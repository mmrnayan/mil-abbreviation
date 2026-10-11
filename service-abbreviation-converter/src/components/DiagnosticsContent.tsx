"use client";

import { AlertTriangle, CheckCircle2, Database, Info, LoaderCircle, XCircle } from "lucide-react";
import { useDataset } from "@/providers/DatasetProvider";

export function DiagnosticsContent() {
  const { status, dataset, validation, error } = useDataset();
  const errors = validation?.diagnostics.filter((item) => item.severity === "error") ?? [];
  const warnings = validation?.diagnostics.filter((item) => item.severity === "warning") ?? [];

  return (
    <>
      <section className="border-b bg-forest-50 dark:border-white/10 dark:bg-[#111815]"><div className="page-shell py-9 sm:py-12"><p className="eyebrow flex items-center gap-2"><Database className="h-4 w-4" /> Startup verification</p><h1 className="mt-3 font-display text-3xl font-bold text-forest-950 sm:text-4xl dark:text-white">Dataset diagnostics</h1><p className="mt-3 max-w-2xl text-slate-700 dark:text-stone-300">Schema, references and record-quality checks performed before conversion is enabled.</p></div></section>
      <div className="page-shell space-y-6 py-8">
        <section className="surface-card p-6">
          <div className="flex items-start gap-4">
            <StatusIcon status={status} />
            <div><p className="eyebrow">Current status</p><h2 className="mt-1 text-2xl font-bold capitalize">{status === "ready" ? "Dataset valid" : status}</h2><p className="mt-2 text-sm text-slate-600 dark:text-stone-400">{status === "loading" ? "The browser is loading and validating the bundled JSON." : status === "ready" ? "All required validation checks passed. Medium-confidence records are warnings, not errors." : error ?? "One or more blocking checks failed."}</p></div>
          </div>
          <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><DiagnosticMetric label="Schema version" value={validation?.schemaVersion ?? "—"} /><DiagnosticMetric label="Entries checked" value={validation?.entryCount.toLocaleString() ?? "—"} /><DiagnosticMetric label="Blocking errors" value={errors.length.toString()} /><DiagnosticMetric label="Warnings" value={warnings.length.toString()} /></dl>
        </section>

        {validation && <section className="surface-card overflow-hidden"><div className="border-b p-5 dark:border-white/10"><h2 className="text-lg font-bold">Diagnostic log</h2><p className="mt-1 text-xs text-slate-500 dark:text-stone-500">Checked {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium" }).format(new Date(validation.checkedAt))}</p></div>{validation.diagnostics.length ? <ul className="divide-y dark:divide-white/10">{validation.diagnostics.map((item, index) => <li key={`${item.code}-${index}`} className="flex items-start gap-3 p-5">{item.severity === "error" ? <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" /> : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />}<div><p className="font-mono text-xs font-bold">{item.code}</p><p className="mt-1 text-sm">{item.message}</p>{item.path && <code className="mt-2 block text-xs text-slate-500 dark:text-stone-500">{item.path}</code>}</div></li>)}</ul> : <div className="flex items-center gap-2 p-5 text-sm text-emerald-800 dark:text-emerald-300"><CheckCircle2 className="h-5 w-5" /> No diagnostics were generated.</div>}</section>}

        {dataset && <section className="surface-card p-6"><h2 className="text-lg font-bold">Coverage by annex</h2><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{dataset.annexes.map((annex) => <div key={annex.id} className="rounded-xl border p-4 dark:border-white/10"><p className="text-xs font-bold text-forest-700 dark:text-gold-300">ANNEX {annex.id}</p><p className="mt-1 text-sm font-semibold">{annex.title}</p><p className="mt-3 font-display text-2xl font-bold">{dataset.statistics.entries_by_annex[annex.id]?.toLocaleString() ?? 0}</p></div>)}</div></section>}

        <aside className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm text-blue-950 dark:border-blue-900 dark:bg-blue-950/25 dark:text-blue-100"><Info className="mt-0.5 h-5 w-5 shrink-0" /><p>Validation checks schema version, required fields, unique IDs, annexes, services, abbreviations, variants, replacement references, conflict references and duplicate variants within each entry. Conversion remains disabled after any error.</p></aside>
      </div>
    </>
  );
}

function StatusIcon({ status }: { status: string }) { if (status === "loading") return <span className="rounded-xl bg-blue-50 p-3 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300"><LoaderCircle className="h-7 w-7 animate-spin" /></span>; if (status === "ready") return <span className="rounded-xl bg-emerald-50 p-3 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"><CheckCircle2 className="h-7 w-7" /></span>; return <span className="rounded-xl bg-red-50 p-3 text-red-700 dark:bg-red-950/30 dark:text-red-300"><XCircle className="h-7 w-7" /></span>; }
function DiagnosticMetric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-slate-50 p-4 dark:bg-white/5"><dt className="form-label">{label}</dt><dd className="font-display text-2xl font-bold">{value}</dd></div>; }
