"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { cancelReport, deliverReports, DELIVERY_LABELS, importOutbox, listReports, retryReport, type QueuedReport } from "@/utils/reportOutbox";
import { downloadJson } from "@/utils/downloadJson";

export function PendingReports() {
  const [items, setItems] = useState<QueuedReport[]>([]);
  const [message, setMessage] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const load = useCallback(() => { void listReports().then(setItems).catch((e: Error) => setMessage(e.message)); }, []);
  useEffect(() => { load(); window.addEventListener("sac-outbox-change", load); window.addEventListener("storage", load); return () => { window.removeEventListener("sac-outbox-change", load); window.removeEventListener("storage", load); }; }, [load]);
  async function action(fn: () => Promise<unknown>) { try { await fn(); load(); } catch (e) { setMessage(e instanceof Error ? e.message : "Action failed."); } }
  return <section className="surface-card p-5" aria-labelledby="pending-title">
    <h2 id="pending-title" className="text-xl font-bold">Your reports</h2><p className="mt-2 text-sm text-slate-600 dark:text-stone-400">Submitted reports stay on this device until acknowledged by the server. Reopen the app to resume delivery.</p>
    <div className="mt-4 flex flex-wrap gap-2"><button type="button" className="button-secondary" onClick={() => void action(() => deliverReports())}>Send pending reports</button><button type="button" className="button-secondary" disabled={!items.length} onClick={() => void action(() => downloadJson(items, "abbreviation-reports.json"))}>Export reports</button><button type="button" className="button-secondary" onClick={() => fileRef.current?.click()}>Import reports</button><input ref={fileRef} type="file" accept=".json" className="sr-only" aria-label="Import reports file" onChange={(e) => { const file = e.target.files?.[0]; if (file) void action(async () => { if (file.size > 10 * 1024 * 1024) throw new Error("Report file is larger than 10 MB."); const count = await importOutbox(await file.text()); setMessage(`Imported ${count} new reports.`); window.dispatchEvent(new Event("sac-report-submitted")); }); e.target.value = ""; }} /></div>
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
    {!items.length ? <p className="mt-4 text-sm text-slate-500">No reports submitted on this device.</p> : <ol className="mt-4 space-y-3">{items.map((item) => <li key={item.report.id} className="rounded-xl border p-3 dark:border-white/10"><div className="flex flex-wrap justify-between gap-2"><strong className="break-words">{item.report.context?.selectedText ?? item.report.message}</strong><span className="text-sm font-semibold">{DELIVERY_LABELS[item.status]}</span></div><p className="mt-1 break-words text-sm">{item.report.context?.input}</p><p className="mt-2 text-xs text-slate-500">{new Date(item.report.createdAt).toLocaleString()} · {item.attempts} delivery attempts</p>{item.error && <p className="mt-2 text-sm text-amber-800 dark:text-amber-200">{item.error}</p>}{!["sent", "sending"].includes(item.status) && <div className="mt-2 flex gap-2"><button className="button-ghost" type="button" onClick={() => void action(async () => { await retryReport(item.report.id); await deliverReports(); })}>Retry now</button><button className="button-ghost" type="button" onClick={() => void action(() => cancelReport(item.report.id))}>Cancel unsent report</button></div>}</li>)}</ol>}
  </section>;
}
