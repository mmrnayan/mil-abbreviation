"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { readConversionFeedbackContext, REVIEW_FEEDBACK_STORAGE_KEY } from "@/utils/conversionFeedback";
import { initializeLocalStore, readLocal, writeLocal } from "@/utils/localStore";
import { downloadJson } from "@/utils/downloadJson";
import { ReportDiagnosisPanel } from "./ReportDiagnosisPanel";
interface FeedbackEntry { id: string; receivedAt?: string; createdAt?: string; category: string; message: string; reportedBy?: string; contact?: { email?: string; introduction?: string }; context?: unknown }
const IMPORT_KEY = "owner-imported-reports-v1";
export function FeedbackReports() {
  const router = useRouter();
  const [items, setItems] = useState<FeedbackEntry[]>([]);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string>();
  const fileRef = useRef<HTMLInputElement>(null);
  const load = useCallback(async () => {
    try {
      await initializeLocalStore();
      const imported = await readLocal<FeedbackEntry[]>(IMPORT_KEY) ?? [];
      const response = await fetch("/api/feedback", { cache: "no-store" });
      const data = await response.json() as { ok: boolean; items?: FeedbackEntry[] };
      if (!data.ok) throw new Error("Could not load reports from the local owner service.");
      setItems([...new Map([...imported, ...(data.items ?? [])].map((r) => [r.id, r])).values()]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load reports."); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const groups = useMemo(() => {
    const result = new Map<string, FeedbackEntry[]>();
    for (const item of items) {
      const c = readConversionFeedbackContext(item.context);
      const evidence = c?.replacementEvidence.find((r) => !c.selected || (r.startIndex < c.selected.source.end && r.endIndex > c.selected.source.start));
      const key = c ? [typeof c.diagnosis?.root === "string" ? c.diagnosis.root : evidence?.normalizedRoot ?? c.selectedText ?? c.input, typeof c.diagnosis?.pattern === "string" ? c.diagnosis.pattern : evidence?.rule ?? "unmatched", c.datasetVersion ?? "unknown"].join(" · ").toLowerCase() : "General and legacy reports";
      result.set(key, [...(result.get(key) ?? []), item]);
    }
    return [...result.entries()];
  }, [items]);
  function openReview(item: FeedbackEntry) {
    const context = readConversionFeedbackContext(item.context);
    if (!context) return;
    sessionStorage.setItem(REVIEW_FEEDBACK_STORAGE_KEY, JSON.stringify({ ...context, feedbackId: item.id }));
    router.push("/review");
  }
  async function importFile(file?: File) {
    if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("Report file is larger than 10 MB.");
      const raw = await file.text();
      let rows: unknown;
      try { rows = JSON.parse(raw); } catch { rows = raw.split("\n").filter((line) => line.trim()).map((line) => JSON.parse(line)); }
      if (!Array.isArray(rows)) throw new Error("Import a report JSON array or JSONL file.");
      const incoming: FeedbackEntry[] = rows.map((v) => {
        const r = v.report ?? v;
        if (typeof r.id !== "string" || typeof r.message !== "string") throw new Error("Invalid report record.");
        return { ...r, category: typeof r.category === "string" ? r.category : "other" };
      });
      await initializeLocalStore();
      const existing = await readLocal<FeedbackEntry[]>(IMPORT_KEY) ?? [];
      await writeLocal(IMPORT_KEY, [...new Map([...existing, ...incoming].map((r) => [r.id, r])).values()]);
      setError(""); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Import failed."); }
  }
  return <div className="page-shell py-8">
    <h1 className="font-display text-3xl font-bold">Issue reports</h1><p className="mt-3 text-sm text-slate-600 dark:text-stone-400">Inspect evidence, verify the manual, approve a fix, add regression cases and publish approved data. Different sentence examples remain available in each group.</p>
    <div className="mt-5 flex flex-wrap gap-2"><button type="button" className="button-secondary" onClick={() => void load()}>Refresh</button><button type="button" className="button-secondary" onClick={() => fileRef.current?.click()}>Import reports or legacy JSONL</button><button type="button" className="button-secondary" disabled={!items.length} onClick={() => downloadJson(items, "owner-issue-reports.json")}>Export evidence</button><input type="file" ref={fileRef} accept=".json,.jsonl" className="sr-only" aria-label="Import owner reports" onChange={(e) => { void importFile(e.target.files?.[0]); e.target.value = ""; }} /></div>
    {error && <p role="alert" className="mt-3 text-red-700">{error}</p>}
    <p className="mt-4 text-sm">{items.length} reports in {groups.length} groups</p>
    <div className="mt-4 space-y-4">{groups.map(([key, reports]) => <details className="surface-card p-4" key={key} open={groups.length === 1}><summary className="cursor-pointer break-words font-bold">{key} ({reports.length})</summary><ol className="mt-4 space-y-4">{reports.map((item) => {
      const context = readConversionFeedbackContext(item.context);
      return <li key={item.id} className="rounded-xl border p-4 dark:border-white/10"><p className="text-xs text-slate-500">{item.receivedAt ?? item.createdAt ?? "Legacy report"} · {item.id}</p><p className="mt-2 text-sm">{item.message}</p>{context && <><p className="mt-3 break-words text-sm"><strong>Selected:</strong> {context.selectedText ?? context.input}</p><p className="whitespace-pre-wrap break-words text-sm"><strong>Sentence:</strong> {context.input}</p><p className="whitespace-pre-wrap break-words text-sm"><strong>Reported output:</strong> {context.actual}</p><p className="whitespace-pre-wrap break-words text-sm"><strong>Suggested:</strong> {context.suggestedForm || context.expected || "Not provided"}</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" className="button-secondary" onClick={() => setExpanded(expanded === item.id ? undefined : item.id)}>Compare accuracy checks</button><button type="button" className="button-secondary" onClick={() => openReview(item)}>Open in Correction review</button></div>{expanded === item.id && <ReportDiagnosisPanel context={context} />}</>}{(item.contact?.email || item.contact?.introduction || item.reportedBy) && <p className="mt-3 text-xs text-slate-500">Optional details: {item.contact?.introduction ?? item.reportedBy} {item.contact?.email}</p>}</li>;
    })}</ol></details>)}</div>
  </div>;
}
