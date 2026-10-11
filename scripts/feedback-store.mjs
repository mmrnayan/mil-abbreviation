import { mkdir, open, link, unlink, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
const clamp = (value, max) => typeof value === "string" ? value.slice(0, max).trim() : "";

export function normalizeReport(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Invalid report.");
  const id = payload.id ?? randomUUID(); // Legacy clients remain accepted.
  if (typeof id !== "string" || !/^[a-zA-Z0-9-]{8,80}$/u.test(id)) throw new Error("Invalid report ID.");
  const message = clamp(payload.message, 4000);
  if (!message) throw new Error("Please describe the problem.");
  const context = payload.context && typeof payload.context === "object" && !Array.isArray(payload.context) ? payload.context : undefined;
  if (context && JSON.stringify(context).length > 220000) throw new Error("Report evidence is too large.");
  if (context?.format === "conversion-feedback-v2" && (typeof context.input !== "string" || context.input.length > 10000 || typeof context.actual !== "string" || context.actual.length > 15000 || !["full-to-abbreviation", "abbreviation-to-full"].includes(context.direction))) throw new Error("Invalid conversion evidence.");
  const contact = { ...(clamp(payload.contact?.email, 254) ? { email: clamp(payload.contact.email, 254) } : {}), ...(clamp(payload.contact?.introduction, 200) ? { introduction: clamp(payload.contact.introduction, 200) } : {}) };
  return { id, createdAt: clamp(payload.createdAt, 40) || new Date().toISOString(), category: clamp(payload.category, 60) || "other", message, ...(clamp(payload.page, 300) ? { page: clamp(payload.page, 300) } : {}), ...(Object.keys(contact).length ? { contact } : {}), ...(clamp(payload.reportedBy, 120) ? { reportedBy: clamp(payload.reportedBy, 120) } : {}), ...(context ? { context } : {}) };
}

/** Publish a fully written report atomically with an exclusive hard link. Concurrent retries create one record. */
export async function storeReport(directory, payload) {
  const report = normalizeReport(payload);
  const folder = path.join(directory, "reports");
  await mkdir(folder, { recursive: true });
  const target = path.join(folder, `${report.id}.json`);
  const receipt = `report:${report.id}`;
  const entry = { ...report, receivedAt: new Date().toISOString(), receipt };
  const temporary = path.join(folder, `.${report.id}-${randomUUID()}.tmp`);
  const handle = await open(temporary, "wx");
  try { await handle.writeFile(JSON.stringify(entry), "utf8"); await handle.sync(); } finally { await handle.close(); }
  try {
    await link(temporary, target);
  } catch (cause) {
    if (cause.code !== "EEXIST") throw cause;
    const stored = JSON.parse(await readFile(target, "utf8"));
    // Stable ID reuse acknowledges the original record; it never replaces it.
    return { ok: true, id: stored.id, receipt: stored.receipt };
  } finally { await unlink(temporary).catch(() => undefined); }
  return { ok: true, id: report.id, receipt };
}

export async function readReports(directory) {
  const result = [];
  const legacy = await readFile(path.join(directory, "feedback.jsonl"), "utf8").catch(() => "");
  for (const line of legacy.split("\n").filter((s) => s.trim())) {
    try { result.push(JSON.parse(line)); } catch { /* Retain the legacy file; skip a corrupt row. */ }
  }
  const folder = path.join(directory, "reports");
  for (const file of await readdir(folder).catch(() => [])) {
    if (!file.endsWith(".json")) continue;
    try { result.push(JSON.parse(await readFile(path.join(folder, file), "utf8"))); } catch { /* Do not delete unreadable evidence. */ }
  }
  return [...new Map(result.map((r) => [r.id, r])).values()].sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt)));
}
