"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowDownAZ,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Search,
} from "lucide-react";
import { DatasetStatusPanel } from "./DatasetStatusPanel";
import { FilterBar } from "./FilterBar";
import type { AbbreviationEntry, ConversionResult } from "@/engine/types";
import { useDataset } from "@/providers/DatasetProvider";
import { ReportIssueWidget } from "./ReportIssueWidget";
import { mapSelection } from "@/utils/reportSelection";

const PAGE_SIZE = 24;

export function DictionaryTable() {
  const { status, dataset } = useDataset();
  const [query, setQuery] = useState("");
  const [service, setService] = useState("all");
  // Annex filter removed from the UI; results always span all annexes.
  const [annex] = useState("all");
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

  return (
    <>
      <h1 className="sr-only">Dictionary</h1>


      <div className="page-shell py-7">
        <section className="surface-card p-4 sm:p-5" aria-label="Dictionary search and filters">
          <label className="relative block">
            <span className="sr-only">Search dictionary</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input className="form-control !py-3 !pl-11 text-base" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search full form, abbreviation or match variant…" />
          </label>
          <div className="mt-3">
            <FilterBar
              storageKey="sac:dictionary-filters:v1"
              sections={[
                { id: "service", label: "Service", options: [
                  { value: "all", label: "All Services" }, { value: "tri-service", label: "Tri-Service" }, { value: "army", label: "Army" },
                  { value: "navy", label: "Navy" }, { value: "air-force", label: "Air Force" }, { value: "other", label: "Other" },
                ] },
                { id: "category", label: "Category", searchable: true, options: [
                  { value: "all", label: "All Categories" }, ...categories.map((item) => ({ value: item, label: item.replaceAll("_", " ") })),
                ] },
                { id: "sort", label: "Sort order", options: [
                  { value: "full-form", label: "Full form A–Z" }, { value: "abbreviation", label: "Abbreviation A–Z" },
                ] },
              ]}
              values={{ service, category, sort }}
              defaults={{ service: "all", category: "all", sort: "full-form" }}
              onChange={(values) => {
                setService(values.service);
                setCategory(values.category);
                setSort(values.sort as typeof sort);
              }}
            />
          </div>
        </section>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600 dark:text-stone-400"><strong className="text-charcoal dark:text-white">{filtered.length.toLocaleString()}</strong> matching records · page {page} of {totalPages}</p>
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-stone-500"><ArrowDownAZ className="h-4 w-4" /> Sorted by {sort === "full-form" ? "full form" : "abbreviation"}</span>
        </div>

        {visible.length ? (
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            {visible.map((entry) => <DictionaryEntryCard entry={entry} key={entry.id} query={query} />)}
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

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/** Highlights the active search term inside card text. */
function Highlight({ text, query }: { text: string; query: string }) {
  const needle = query.trim();
  if (!needle) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRegExp(needle)})`, "giu"));
  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === needle.toLowerCase()
          ? <mark key={index} className="rounded-sm bg-gold-300/50 text-inherit dark:bg-gold-300/30">{part}</mark>
          : <span key={index}>{part}</span>,
      )}
    </>
  );
}

function DictionaryEntryCard({ entry, query }: { entry: AbbreviationEntry; query: string }) {
  const dataset = useDataset();
  const [copied, setCopied] = useState(false);
  const result: ConversionResult = { originalText: entry.full_form, convertedText: entry.abbreviation, direction: "full-to-abbreviation", appliedFilters: { service: entry.service, annex: entry.annex, context: "internal-service-writing" }, ambiguities: [], unresolved: [], warnings: [], replacements: [{ entryId: entry.id, sourceText: entry.full_form, replacementText: entry.abbreviation, matchedVariant: entry.full_form, startIndex: 0, endIndex: entry.full_form.length, outputStartIndex: 0, outputEndIndex: entry.abbreviation.length, service: entry.service, annex: entry.annex, category: entry.category, confidence: entry.quality.confidence, rule: "exact-authorized", resolution: "automatic" }] };
  async function copyAbbreviation() {
    try {
      await navigator.clipboard.writeText(entry.abbreviation);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch { /* Clipboard unavailable; the abbreviation is still visible for manual copy. */ }
  }
  return (
    <article className="surface-card overflow-hidden p-3">
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 break-words font-display text-base font-bold leading-6 text-forest-800 dark:text-gold-300">
            <Highlight text={entry.full_form} query={query} />
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="inline-block max-w-full truncate rounded-md bg-forest-100 px-2 py-0.5 font-mono text-sm font-bold text-forest-900 dark:bg-gold-300/15 dark:text-gold-200">
              <Highlight text={entry.abbreviation} query={query} />
            </span>
            {copied && <span role="status" className="text-xs font-semibold text-forest-700 dark:text-gold-300">Copied</span>}
            {entry.ambiguous && <span className="status-pill border-amber-200 bg-amber-50 !px-2 !py-0.5 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"><AlertCircle className="h-3 w-3" /> Ambiguous</span>}
            {entry.quality.confidence === "medium" && <span className="status-pill border-blue-200 bg-blue-50 !px-2 !py-0.5 text-blue-800 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200">Verify source</span>}
          </div>
          {(entry.service || entry.category) && (
            <p className="mt-1.5 flex gap-1.5 truncate text-[11px] font-medium capitalize text-slate-500 dark:text-stone-400">
              {entry.service && <span className="truncate">{entry.service.replaceAll("-", " ")}</span>}
              {entry.service && entry.category && <span aria-hidden="true">·</span>}
              {entry.category && <span className="truncate">{entry.category.replaceAll("_", " ")}</span>}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center">
          <button type="button" onClick={() => void copyAbbreviation()} aria-label={`Copy abbreviation ${entry.abbreviation}`} className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 hover:bg-forest-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-500 active:bg-forest-100 dark:text-stone-400 dark:hover:bg-white/10 dark:active:bg-white/20">
            {copied ? <Check className="h-4 w-4 text-forest-700 dark:text-gold-300" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
          </button>
          <ReportIssueWidget iconOnly conversion={{ result, datasetVersion: dataset.version, selection: mapSelection(result, { start: 0, end: entry.full_form.length }, "source") }} />
        </div>
      </div>
    </article>
  );
}
