import { initializeLocalStore, readLocal, writeLocal, withLocalLock } from "./localStore";
import { serviceUrl, DeliveryConfigurationError } from "./onlineService";
import { readConversionFeedbackContext, type ConversionFeedbackContext } from "./conversionFeedback";

export interface ReportContact { email?: string; introduction?: string }
export interface SubmittedReport {
  id: string; createdAt: string; category: string; message: string;
  page?: string; contact?: ReportContact; context?: ConversionFeedbackContext;
}
export type DeliveryStatus = "waiting" | "sending" | "sent" | "attention";
export interface QueuedReport {
  report: SubmittedReport; status: DeliveryStatus; attempts: number;
  nextAttemptAt?: number; receipt?: string; error?: string;
}
const KEY = "report-outbox-v2";
export const DELIVERY_LABELS: Record<DeliveryStatus, string> = { waiting: "Waiting to send", sending: "Sending", sent: "Sent", attention: "Needs attention" };
export function notifyOutbox() { if (typeof window !== "undefined") window.dispatchEvent(new Event("sac-outbox-change")); }

export async function listReports(): Promise<QueuedReport[]> {
  await initializeLocalStore();
  return await readLocal<QueuedReport[]>(KEY) ?? [];
}
async function change(action: (items: QueuedReport[]) => QueuedReport[]): Promise<void> {
  await withLocalLock("outbox", async () => {
    await writeLocal(KEY, action(await listReports()));
  });
  notifyOutbox();
}
export async function enqueueReport(report: SubmittedReport): Promise<void> {
  await change((items) => items.some((r) => r.report.id === report.id) ? items : [{ report, status: "waiting", attempts: 0 }, ...items]);
  // Browser storage persistence is best effort; a refusal does not undo a committed write.
  if (typeof navigator !== "undefined") void navigator.storage?.persist?.().catch(() => undefined);
}
export async function cancelReport(id: string): Promise<void> {
  await change((items) => items.filter((r) => r.report.id !== id || ["sent", "sending"].includes(r.status)));
}
export async function retryReport(id: string): Promise<void> {
  await change((items) => items.map((r) => r.report.id === id && r.status !== "sent" ? { ...r, status: "waiting", nextAttemptAt: 0, error: undefined } : r));
}

export async function deliverReports(fetcher: typeof fetch = fetch): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  await withLocalLock("delivery", async () => {
    const items = await listReports();
    for (const item of items) {
      if (item.status === "sent" || item.status === "attention" || (item.nextAttemptAt ?? 0) > Date.now()) continue;
      // A sending record left by an interrupted process is retried with the same ID.
      let claimed = false;
      await change((current) => current.map((r) => {
        if (r.report.id !== item.report.id || r.status === "sent" || r.status === "attention") return r;
        claimed = true;
        return { ...r, status: "sending", attempts: r.attempts + 1 };
      }));
      if (!claimed) continue;
      try {
        const response = await fetcher(serviceUrl("/api/feedback"), {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item.report), signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) {
          const permanent = response.status >= 400 && response.status < 500 && ![408, 429].includes(response.status);
          const error = `Server returned HTTP ${response.status}.`;
          await change((current) => current.map((r) => r.report.id === item.report.id ? { ...r, status: permanent ? "attention" : "waiting", error, nextAttemptAt: Date.now() + retryDelay(r.attempts) } : r));
          continue;
        }
        const ack = await response.json() as { ok?: boolean; id?: string; receipt?: string };
        if (!ack.ok || ack.id !== item.report.id || !ack.receipt) throw new Error("Server did not acknowledge this report. It remains queued.");
        await change((current) => current.map((r) => r.report.id === item.report.id ? { ...r, status: "sent", receipt: ack.receipt, error: undefined } : r));
      } catch (cause) {
        await change((current) => current.map((r) => r.report.id === item.report.id ? { ...r, status: cause instanceof DeliveryConfigurationError ? "attention" : "waiting", error: cause instanceof Error ? cause.message : "Connection failed.", nextAttemptAt: Date.now() + retryDelay(r.attempts) } : r));
      }
    }
  });
}
function retryDelay(attempts: number) { return Math.min(3600000, 30000 * 2 ** Math.min(attempts - 1, 7)); }

export async function importOutbox(json: string): Promise<number> {
  const value: unknown = JSON.parse(json);
  if (!Array.isArray(value) || value.length > 5000) throw new Error("Select a report export containing up to 5,000 reports.");
  const incoming = value.map((v) => {
    const row = v as QueuedReport;
    const report = row?.report;
    if (!report || !/^[a-zA-Z0-9-]{8,80}$/u.test(report.id) || typeof report.message !== "string" || typeof report.category !== "string") throw new Error("The report export is invalid.");
    const context = readConversionFeedbackContext(report.context);
    return { report: { ...report, ...(context ? { context } : {}) }, status: row.status === "sent" && row.receipt ? "sent" : "waiting", attempts: 0, ...(row.receipt ? { receipt: row.receipt } : {}) } as QueuedReport;
  });
  let count = 0;
  await change((items) => {
    const ids = new Set(items.map((r) => r.report.id));
    const added = incoming.filter((r) => { if (ids.has(r.report.id)) return false; ids.add(r.report.id); count++; return true; });
    return [...added, ...items];
  });
  return count;
}
