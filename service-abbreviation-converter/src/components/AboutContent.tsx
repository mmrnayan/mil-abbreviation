"use client";

import Link from "next/link";
import { BookOpen, Cpu, Database, Download, LockKeyhole, ScanSearch, ShieldCheck } from "lucide-react";
import { DatasetStatusPanel } from "./DatasetStatusPanel";
import { useDataset } from "@/providers/DatasetProvider";

export function AboutContent() {
  const { status, dataset } = useDataset();
  if (status !== "ready" || !dataset) return <div className="page-shell"><DatasetStatusPanel /></div>;

  return (
    <>
      <section className="border-b bg-forest-900 text-white dark:border-white/10 dark:bg-forest-950">
        <div className="page-shell py-12 sm:py-16">
          <p className="eyebrow !text-gold-300 flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Bangladesh Services Writing Assistant</p>
          <h1 className="mt-4 max-w-3xl font-display text-3xl font-bold sm:text-5xl">A precise local tool for authorized service abbreviations.</h1>
          <p className="mt-5 max-w-3xl text-base leading-8 text-forest-100/85">Service Abbreviation Converter treats the supplied schema 1.1.0 JSON as its single source of truth. It provides full-sentence conversion, traceable reports and deliberate ambiguity resolution without sending writing to a server.</p>
        </div>
      </section>

      <div className="page-shell space-y-8 py-9">
        <section className="grid gap-4 md:grid-cols-3" aria-label="Application principles">
          <Principle icon={<Database />} title="Dataset governed">All {dataset.entries.length.toLocaleString()} entries, variants, filters, conflicts and rules come from the bundled JSON.</Principle>
          <Principle icon={<Cpu />} title="Efficient matching">A character trie performs a continuous left-to-right scan and selects the longest complete authorized phrase.</Principle>
          <Principle icon={<LockKeyhole />} title="Private by design">Text conversion runs in a Web Worker in the browser. No entered text is uploaded or sent to an external API.</Principle>
        </section>

        <section className="surface-card grid overflow-hidden lg:grid-cols-[1.1fr_.9fr]">
          <div className="p-6 sm:p-8"><p className="eyebrow">How conversion works</p><h2 className="mt-2 text-2xl font-bold">Complete-sentence scanning, not replacement chaining</h2><p className="mt-4 leading-7 text-slate-700 dark:text-stone-300">The engine reads declared <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm dark:bg-white/10">match_variants</code>, scans from the beginning to the end of the input, and continues after every replacement. It never feeds newly generated output back into the matcher, preventing accidental cascades.</p><ol className="mt-5 space-y-3 text-sm leading-6">{["Protect URLs, email addresses, paths, numbers, date-time groups and existing authorized abbreviations.","Find candidates at the cursor with the prebuilt trie and enforce complete-word boundaries.","Choose the longest phrase, preserve adjacent punctuation and continue scanning.","Apply authorized context templates and return source/output offsets for a detailed audit trail."].map((item, index) => <li key={item} className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-forest-100 text-xs font-bold text-forest-800 dark:bg-white/10 dark:text-gold-300">{index + 1}</span><span>{item}</span></li>)}</ol></div>
          <div className="border-t bg-forest-50 p-6 sm:p-8 lg:border-l lg:border-t-0 dark:border-white/10 dark:bg-forest-950/40"><ScanSearch className="h-8 w-8 text-forest-700 dark:text-gold-300" /><h3 className="mt-4 text-lg font-bold">Ambiguity is never guessed</h3><p className="mt-2 text-sm leading-6 text-slate-600 dark:text-stone-400">When more than one reverse meaning remains after service and annex filtering, the printed abbreviation stays unchanged until the user selects a meaning. Annex B presents its individual <code>meanings</code>, never the combined printed full-form field.</p><h3 className="mt-6 text-lg font-bold">Medium-confidence records</h3><p className="mt-2 text-sm leading-6 text-slate-600 dark:text-stone-400">The {dataset.statistics.entries_requiring_review} reconstructed records work normally, carry a verification indicator, and add a conversion-report warning rather than failing validation.</p></div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="surface-card p-6"><p className="eyebrow">Dataset profile</p><h2 className="mt-2 text-xl font-bold">{dataset.title}</h2><dl className="mt-5 grid grid-cols-2 gap-4"><Metric label="Schema" value={dataset.schema_version} /><Metric label="Entries" value={dataset.statistics.entry_count.toLocaleString()} /><Metric label="Conflict groups" value={dataset.statistics.conflicting_abbreviation_count.toLocaleString()} /><Metric label="Annexes" value={dataset.annexes.length.toString()} /></dl><div className="mt-5 border-t pt-4 text-sm dark:border-white/10"><p className="form-label">Generated</p><p>{dataset.generated_on}</p><p className="form-label mt-4">Description</p><p className="leading-6 text-slate-600 dark:text-stone-400">{dataset.description}</p></div></section>
          <section className="surface-card p-6"><p className="eyebrow">Install and use offline</p><h2 className="mt-2 text-xl font-bold">Progressive Web App support</h2><p className="mt-3 text-sm leading-6 text-slate-600 dark:text-stone-400">In a production deployment, install the application from the browser menu. The service worker caches the interface and bundled dataset for subsequent offline use.</p><div className="mt-5 flex items-start gap-3 rounded-xl bg-slate-50 p-4 text-sm dark:bg-white/5"><Download className="mt-0.5 h-5 w-5 shrink-0 text-forest-700 dark:text-gold-300" /><div><strong>Installation varies by browser</strong><p className="mt-1 text-slate-600 dark:text-stone-400">Look for “Install app” or “Add to Home Screen” after opening a secure production deployment.</p></div></div><div className="mt-6 flex flex-wrap gap-3"><Link href="/" className="button-primary">Open converter</Link><Link href="/rules" className="button-secondary"><BookOpen className="h-4 w-4" /> Read rules</Link><Link href="/diagnostics" className="button-secondary">Dataset diagnostics</Link></div></section>
        </div>
      </div>
    </>
  );
}

function Principle({ icon, title, children }: { icon: React.ReactElement; title: string; children: React.ReactNode }) {
  return <article className="surface-card p-6"><span className="inline-flex rounded-xl bg-forest-50 p-2.5 text-forest-700 dark:bg-white/5 dark:text-gold-300">{icon}</span><h2 className="mt-4 text-lg font-bold">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-600 dark:text-stone-400">{children}</p></article>;
}
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-slate-50 p-4 dark:bg-white/5"><dt className="form-label">{label}</dt><dd className="font-display text-2xl font-bold text-forest-800 dark:text-gold-300">{value}</dd></div>; }
