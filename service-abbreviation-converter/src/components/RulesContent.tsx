"use client";

import { ArrowDown, BookMarked, CheckCircle2, GitBranch, Info, Layers3, Repeat2, ShieldAlert } from "lucide-react";
import { DatasetStatusPanel } from "./DatasetStatusPanel";
import { useDataset } from "@/providers/DatasetProvider";

export function RulesContent() {
  const { status, dataset } = useDataset();
  if (status !== "ready" || !dataset) return <div className="page-shell"><DatasetStatusPanel /></div>;
  const config = dataset.converter_config;

  return (
    <>
      <section className="border-b bg-forest-50 dark:border-white/10 dark:bg-[#111815]">
        <div className="page-shell py-9 sm:py-12">
          <p className="eyebrow flex items-center gap-2"><BookMarked className="h-4 w-4" /> Dataset-defined policy</p>
          <h1 className="mt-3 font-display text-3xl font-bold text-forest-950 sm:text-4xl dark:text-white">Conversion rules</h1>
          <p className="mt-3 max-w-3xl leading-7 text-slate-700 dark:text-stone-300">This page is rendered directly from <code className="rounded bg-white px-1.5 py-0.5 text-sm dark:bg-white/10">converter_config</code>. It does not maintain a separate hard-coded policy list.</p>
        </div>
      </section>

      <div className="page-shell space-y-8 py-8">
        <section aria-labelledby="pipeline-heading">
          <div className="mb-4 flex items-end justify-between gap-4"><div><p className="eyebrow">Execution order</p><h2 id="pipeline-heading" className="mt-1 text-2xl font-bold">Conversion pipeline</h2></div><span className="status-pill border-forest-200 bg-white text-forest-800 dark:border-white/15 dark:bg-white/5 dark:text-stone-200">{config.replacement_order.replaceAll("_", " ")}</span></div>
          <ol className="grid gap-3 lg:grid-cols-4">
            {config.conversion_pipeline.map((step, index) => (
              <li key={step.step} className="surface-card relative p-5">
                <div className="flex items-center justify-between"><span className="grid h-8 w-8 place-items-center rounded-full bg-forest-800 text-sm font-bold text-white dark:bg-gold-400 dark:text-forest-950">{step.step}</span>{index < config.conversion_pipeline.length - 1 && <ArrowDown className="h-4 w-4 text-slate-300 lg:hidden" />}</div>
                <h3 className="mt-4 font-bold capitalize">{step.operation.replaceAll("_", " ")}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-stone-400">{step.rule}</p>
                <p className="mt-3 font-mono text-[10px] uppercase tracking-wide text-forest-700 dark:text-gold-300">{step.loop.replaceAll("_", " ")}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="context-heading">
          <p className="eyebrow">Authorized templates</p><h2 id="context-heading" className="mt-1 text-2xl font-bold">Contextual rules</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {config.context_rules.map((rule) => (
              <article key={rule.id} className="surface-card p-5">
                <div className="flex items-start gap-3"><span className="rounded-lg bg-forest-50 p-2 text-forest-700 dark:bg-white/5 dark:text-gold-300"><GitBranch className="h-4 w-4" /></span><div><p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-stone-500">{rule.id}</p><h3 className="mt-1 font-bold">{rule.trigger}</h3></div></div>
                <p className="mt-4 text-sm leading-6 text-slate-600 dark:text-stone-400">{rule.action}</p>
                {rule.example && <div className="mt-4 rounded-xl border bg-slate-50 p-3 text-sm dark:border-white/10 dark:bg-white/[.035]"><p><span className="text-slate-500 dark:text-stone-500">Input:</span> {rule.example.input}</p><p className="mt-1 font-semibold text-forest-700 dark:text-gold-300"><span className="font-normal text-slate-500 dark:text-stone-500">Output:</span> {rule.example.output}</p></div>}
                {rule.examples && <div className="mt-4 flex flex-wrap gap-1.5">{rule.examples.map((example) => <code key={example} className="rounded-md bg-slate-100 px-2 py-1 text-xs dark:bg-white/10">{example}</code>)}</div>}
              </article>
            ))}
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="surface-card p-6" aria-labelledby="scope-heading">
            <div className="flex items-center gap-3"><span className="rounded-xl bg-amber-50 p-2.5 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"><ShieldAlert className="h-5 w-5" /></span><div><p className="eyebrow">Usage boundaries</p><h2 id="scope-heading" className="mt-0.5 text-xl font-bold">Scope rules</h2></div></div>
            <ul className="mt-5 space-y-3">{config.scope_rules.map((rule) => <li key={rule} className="flex gap-2.5 text-sm leading-6 text-slate-700 dark:text-stone-300"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-forest-600 dark:text-gold-300" /><span>{rule}</span></li>)}</ul>
          </section>

          <section className="surface-card p-6" aria-labelledby="morphology-heading">
            <div className="flex items-center gap-3"><span className="rounded-xl bg-blue-50 p-2.5 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300"><Layers3 className="h-5 w-5" /></span><div><p className="eyebrow">Variant policy</p><h2 id="morphology-heading" className="mt-0.5 text-xl font-bold">Morphology</h2></div></div>
            <dl className="mt-5 space-y-4"><RuleField label="Policy" value={config.morphology.policy.replaceAll("_", " ")} /><RuleField label="Rule" value={config.morphology.rule} /></dl>
            {config.morphology.example && <JsonSummary value={config.morphology.example} />}
          </section>
        </div>

        <section className="surface-card p-6" aria-labelledby="reverse-heading">
          <div className="flex items-center gap-3"><span className="rounded-xl bg-forest-50 p-2.5 text-forest-700 dark:bg-white/5 dark:text-gold-300"><Repeat2 className="h-5 w-5" /></span><div><p className="eyebrow">Expansion safeguards</p><h2 id="reverse-heading" className="mt-0.5 text-xl font-bold">Reverse conversion</h2></div></div>
          <div className="mt-5 grid gap-4 md:grid-cols-3"><RuleField label="Default ambiguous action" value={config.reverse_conversion.default_ambiguous_action.replaceAll("_", " ")} /><RuleField label="Never expand inside a word" value={config.reverse_conversion.never_expand_inside_word ? "Yes" : "No"} /><RuleField label="Filter precedence" value={config.reverse_conversion.service_filter_precedence.map((item) => item.replaceAll("_", " ")).join(" → ")} /></div>
        </section>

        <aside className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm text-blue-950 dark:border-blue-900 dark:bg-blue-950/25 dark:text-blue-100"><Info className="mt-0.5 h-5 w-5 shrink-0" /><p>Changes to the dataset’s pipeline, context, scope, morphology or reverse-conversion policy appear here automatically after the updated JSON passes startup validation.</p></aside>
      </div>
    </>
  );
}

function RuleField({ label, value }: { label: string; value: string }) {
  return <div><dt className="form-label">{label}</dt><dd className="text-sm leading-6 text-charcoal dark:text-stone-200">{value}</dd></div>;
}

function JsonSummary({ value }: { value: Record<string, unknown> }) {
  return <dl className="mt-5 rounded-xl bg-slate-50 p-4 text-sm dark:bg-white/[.035]">{Object.entries(value).map(([key, item]) => <div key={key} className="grid gap-1 py-1.5 sm:grid-cols-[130px_1fr]"><dt className="font-semibold capitalize text-slate-500 dark:text-stone-400">{key.replaceAll("_", " ")}</dt><dd>{Array.isArray(item) ? item.join(", ") : String(item)}</dd></div>)}</dl>;
}
