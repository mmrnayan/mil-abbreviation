"use client";
import { useMemo } from "react";
import { useDataset } from "@/providers/DatasetProvider";
import { diagnoseReport } from "@/utils/reportDiagnosis";
import type { ConversionFeedbackContext } from "@/utils/conversionFeedback";
export function ReportDiagnosisPanel({ context }: { context: ConversionFeedbackContext }) {
  const { dataset, overlay, version } = useDataset();
  const diagnosis = useMemo(() => dataset && overlay ? diagnoseReport(context, dataset, overlay, version ?? "") : undefined, [context, dataset, overlay, version]);
  if (!diagnosis) return <p>Loading approved data…</p>;
  return <section className="mt-4 rounded-xl border p-4 dark:border-white/10" aria-label="Report comparison">
    <h3 className="font-bold">{diagnosis.status}</h3><p className="mt-1 text-sm">Root: {diagnosis.root} · Pattern: {diagnosis.pattern}</p><p className="mt-2 text-sm">{diagnosis.versionComparison}</p>
    <div className="mt-3 space-y-3">{diagnosis.checks.map((check, i) => <div key={i} className="rounded-lg bg-slate-50 p-3 dark:bg-white/5"><p className="text-sm font-bold">{check.label}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm">{check.input} → <strong>{check.output}</strong></p><p className="mt-1 text-xs text-slate-500">{check.matches.length ? check.matches.map((r) => `${r.entryId}: ${r.rule}${r.root ? ` (root ${r.root})` : ""}, ${r.confidence}`).join("; ") : "No approved replacement matched. Verify against the source manual."}</p>{check.warnings.map((w, j) => <p key={j} className="mt-1 text-xs text-amber-800 dark:text-amber-200">{w}</p>)}</div>)}</div>
    <p className="mt-3 text-xs text-slate-500">Verify against the manual, approve the correction, add a regression case, then publish the approved dataset package. Reports never modify approved data automatically.</p>
  </section>;
}
