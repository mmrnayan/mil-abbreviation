"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowDownAZ,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Search,
} from "lucide-react";
import { DatasetStatusPanel } from "./DatasetStatusPanel";
import type { AbbreviationEntry, ConversionResult } from "@/engine/types";
import { useDataset } from "@/providers/DatasetProvider";
import { ReportIssueWidget } from "./ReportIssueWidget";
import { mapSelection } from "@/utils/reportSelection";

const PAGE_SIZE = 24;

export function DictionaryTable() {
  const { status, dataset } = useDataset();
  const [query, setQuery] = useState("");
  const [service, setService] = useState("all");
  const [annex, setAnnex] = useState("all");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState<"full-form" | "abbreviation">("full-form");
  const [page, setPage] = useState(1);

  const categories = useMemo(
    () => [...new Set(dataset?.entries.map((entry) => entry.category) ?? [])].sort(),
    [dataset],
  );

  const filtered = useMemo(() => {
    if (!dataset) return [];
    const needle = query.trim().toLocaleLowerCase("en");
    return dataset.entries
      .filter((entry) => service === "all" || entry.service === service)
      .filter((entry) => annex === "all" || entry.annex === annex)
      .filter((entry) => category === "all" || entry.category === category)
      .filter((entry) => {
        if (!needle) return true;
        return [
          entry.full_form,
          entry.abbreviation,
          ...entry.match_variants,
          ...entry.meanings,
          ...entry.aliases,
        ].some((value) => value.toLocaleLowerCase("en").includes(needle));
      })
      .sort((left, right) => {
        const leftValue = sort === "full-form" ? left.full_form : left.abbreviation;
        const rightValue = sort === "full-form" ? right.full_form : right.abbreviation;
        return leftValue.localeCompare(rightValue, "en", { sensitivity: "base", numeric: true });
      });
  }, [annex, category, dataset, query, service, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  useEffect(() => setPage(1), [query, service, annex, category, sort]);
  useEffect(() => setPage((value) => Math.min(value, totalPages)), [totalPages]);
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (status !== "ready" || !dataset) {
    return <div className="page-shell"><DatasetStatusPanel /></div>;
  }

  function reset() {
    setQuery("");
    setService("all");
    setAnnex("all");
    setCategory("all");
    setSort("full-form");
  }

  return (
    <>
      <section className="border-b bg-forest-50 dark:border-white/10 dark:bg-[#111815]">
        <div className="page-shell flex flex-wrap items-baseline justify-between gap-3 py-6">
          <h1 className="font-display text-2xl font-bold text-forest-950 sm:text-3xl dark:text-white">Dictionary</h1>
          <p className="text-sm text-slate-600 dark:text-stone-300">{dataset.entries.length.toLocaleString()} records · {dataset.statistics.entries_requiring_review} to verify</p>
        </div>
      </section>

      <div className="page-shell py-7">
        <section className="surface-card p-4 sm:p-5" aria-label="Dictionary search and filters">
          <label className="relative block">
            <span className="sr-only">Search dictionary</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input className="form-control !py-3 !pl-11 text-base" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search full form, abbreviation or match variant…" />
          </label>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label><span className="form-label">Service</span><select className="form-control" value={service} onChange={(event) => setService(event.target.value)}><option value="all">All Services</option><option value="tri-service">Tri-Service</option><option value="army">Army</option><option value="navy">Navy</option><option value="air-force">Air Force</option><option value="other">Other</option></select></label>
            <label><span className="form-label">Annex</span><select className="form-control" value={annex} onChange={(event) => setAnnex(event.target.value)}><option value="all">All Annexes</option>{dataset.annexes.map((item) => <option key={item.id} value={item.id}>Annex {item.id} — {item.title}</option>)}</select></label>
            <label><span className="form-label">Category</span><select className="form-control" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">All Categories</option>{categories.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></label>
            <label><span className="form-label">Alphabetical sort</span><select className="form-control" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="full-form">Full form A–Z</option><option value="abbreviation">Abbreviation A–Z</option></select></label>
          </div>
          <div className="mt-4 flex justify-end border-t pt-4 text-sm dark:border-white/10">
            <button type="button" className="button-ghost" onClick={reset}><RotateCcw className="h-4 w-4" /> Reset</button>
          </div>
        </section>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600 dark:text-stone-400"><strong className="text-charcoal dark:text-white">{filtered.length.toLocaleString()}</strong> matching records · page {page} of {totalPages}</p>
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-stone-500"><ArrowDownAZ className="h-4 w-4" /> Sorted by {sort === "full-form" ? "full form" : "abbreviation"}</span>
        </div>

        {visible.length ? (
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            {visible.map((entry) => <DictionaryEntryCard entry={entry} key={entry.id} />)}
          </div>
        ) : (
          <div className="surface-card mt-4 py-16 text-center"><Search className="mx-auto h-8 w-8 text-slate-300 dark:text-stone-600" /><h2 className="mt-3 font-bold">No matching records</h2><p className="mt-1 text-sm text-slate-500 dark:text-stone-400">Try a broader search or reset one of the filters.</p></div>
        )}

        <nav className="mt-7 flex items-center justify-center gap-3" aria-label="Dictionary pagination">
          <button type="button" className="button-secondary" disabled={page <= 1} onClick={() => { setPage((value) => Math.max(1, value - 1)); window.scrollTo({ top: 300, behavior: "smooth" }); }}><ChevronLeft className="h-4 w-4" /> Previous</button>
          <span className="min-w-24 text-center text-sm font-semibold">{page} / {totalPages}</span>
          <button type="button" className="button-secondary" disabled={page >= totalPages} onClick={() => { setPage((value) => Math.min(totalPages, value + 1)); window.scrollTo({ top: 300, behavior: "smooth" }); }}>Next <ChevronRight className="h-4 w-4" /></button>
        </nav>
      </div>
    </>
  );
}

function DictionaryEntryCard({ entry }: { entry: AbbreviationEntry }) {
  const dataset = useDataset();
  const result: ConversionResult = { originalText: entry.full_form, convertedText: entry.abbreviation, direction: "full-to-abbreviation", appliedFilters: { service: entry.service, annex: entry.annex, context: "internal-service-writing" }, ambiguities: [], unresolved: [], warnings: [], replacements: [{ entryId: entry.id, sourceText: entry.full_form, replacementText: entry.abbreviation, matchedVariant: entry.full_form, startIndex: 0, endIndex: entry.full_form.length, outputStartIndex: 0, outputEndIndex: entry.abbreviation.length, service: entry.service, annex: entry.annex, category: entry.category, confidence: entry.quality.confidence, rule: "exact-authorized", resolution: "automatic" }] };
  return (
    <article className="surface-card overflow-hidden">
      <div className="flex items-start justify-between gap-4 p-5">
        <div className="min-w-0">
          <p className="break-words font-display text-2xl font-bold leading-8 text-forest-800 dark:text-gold-300">{entry.full_form}</p>
          <p className="mt-1 text-xl font-semibold text-slate-600 dark:text-stone-300">{entry.abbreviation}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {entry.ambiguous && <span className="status-pill border-amber-200 bg-amber-50 !px-2 !py-0.5 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"><AlertCircle className="h-3 w-3" /> Ambiguous</span>}
          {entry.quality.confidence === "medium" && <span className="status-pill border-blue-200 bg-blue-50 !px-2 !py-0.5 text-blue-800 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200">Verify source</span>}
        </div>
      </div>
      <div className="border-t px-5 dark:border-white/10"><ReportIssueWidget conversion={{ result, datasetVersion: dataset.version, selection: mapSelection(result, { start: 0, end: entry.full_form.length }, "source") }} /></div>
    </article>
  );
}
