"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, CircleHelp, Diamond, ShieldAlert, X } from "lucide-react";
import type { AbbreviationDataset, ConversionResult, ReplacementRecord } from "@/engine/types";
import { ReportIssueWidget } from "./ReportIssueWidget";
import { mapSelection, selectedOutputRange, type TextRange } from "@/utils/reportSelection";

interface HighlightedOutputProps {
  result?: ConversionResult;
  dataset: AbbreviationDataset;
  enabled: boolean;
  datasetVersion?: string;
}

type Mark =
  | { kind: "replacement"; start: number; end: number; replacement: ReplacementRecord }
  | { kind: "ambiguity"; start: number; end: number }
  | { kind: "unknown"; start: number; end: number };

export function HighlightedOutput({ result, dataset, enabled, datasetVersion }: HighlightedOutputProps) {
  const [selected, setSelected] = useState<ReplacementRecord>();
  const [range, setRange] = useState<TextRange>();
  const outputRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setRange(undefined); setSelected(undefined); }, [result]);
  useEffect(() => {
    const capture = () => {
      if (!outputRef.current) return;
      const next = selectedOutputRange(outputRef.current);
      if (next) setRange(next);
    };
    document.addEventListener("selectionchange", capture);
    return () => document.removeEventListener("selectionchange", capture);
  }, []);
  function captureSelection() {
    if (!outputRef.current) return;
    const next = selectedOutputRange(outputRef.current);
    if (next) setRange(next);
  }
  const entries = useMemo(() => new Map(dataset.entries.map((entry) => [entry.id, entry])), [dataset.entries]);

  if (!result) {
    return <p className="text-sm text-slate-400 dark:text-stone-500">Converted text will appear here.</p>;
  }

  const marks: Mark[] = (enabled ? [
    ...result.replacements.map((replacement): Mark => ({ kind: "replacement", start: replacement.outputStartIndex, end: replacement.outputEndIndex, replacement })),
    ...result.ambiguities.map((ambiguity): Mark => ({ kind: "ambiguity", start: ambiguity.outputStartIndex, end: ambiguity.outputEndIndex })),
    ...result.unresolved.map((item): Mark => ({ kind: "unknown", start: item.outputStartIndex, end: item.outputEndIndex })),
  ] : []).sort((left, right) => left.start - right.start || left.end - right.end);

  const fragments: React.ReactNode[] = [];
  let cursor = 0;
  marks.forEach((mark, index) => {
    if (mark.start < cursor) return;
    if (mark.start > cursor) fragments.push(<span key={`plain-${cursor}`}>{result.convertedText.slice(cursor, mark.start)}</span>);
    const text = result.convertedText.slice(mark.start, mark.end);
    if (mark.kind === "replacement") {
      const contextual = mark.replacement.resolution === "context-rule";
      fragments.push(
        <button
          type="button"
          key={`replacement-${index}`}
          className={`${contextual ? "highlight-context" : "highlight-auto"} cursor-help font-semibold`}
          onClick={() => setSelected(mark.replacement)}
          aria-label={`${text}, ${contextual ? "contextual-rule" : "automatic"} conversion. Show details.`}
          title="Show conversion details"
        >
          {text}
        </button>,
      );
    } else if (mark.kind === "ambiguity") {
      fragments.push(<span key={`ambiguity-${index}`} className="highlight-ambiguity font-semibold" title="Ambiguous: selection required" aria-label={`${text}, unresolved ambiguity`}>{text}</span>);
    } else {
      fragments.push(<span key={`unknown-${index}`} className="highlight-unknown" title="Unknown or filtered abbreviation" aria-label={`${text}, unknown abbreviation`}>{text}</span>);
    }
    cursor = mark.end;
  });
  if (cursor < result.convertedText.length) fragments.push(<span key={`plain-${cursor}`}>{result.convertedText.slice(cursor)}</span>);

  const entry = selected ? entries.get(selected.entryId) : undefined;
  return (
    <div>
      <div ref={outputRef} onPointerUp={captureSelection} onKeyUp={captureSelection} className="whitespace-pre-wrap break-words text-[15px] leading-7" aria-label="Converted text">{fragments.length ? fragments : <span className="text-slate-400">Empty result</span>}</div>
      {range && <ReportIssueWidget label="Report selected text" conversion={{ result, datasetVersion, selection: mapSelection(result, range, "output") }} />}
      <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 border-t pt-3 text-[11px] font-semibold text-slate-600 dark:border-white/10 dark:text-stone-400" aria-label="Highlight legend">
        <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" /> Solid underline: automatic</span>
        <span className="inline-flex items-center gap-1.5"><Diamond className="h-3.5 w-3.5 text-blue-700" aria-hidden="true" /> Double underline: context rule</span>
        <span className="inline-flex items-center gap-1.5"><CircleHelp className="h-3.5 w-3.5 text-amber-700" aria-hidden="true" /> Dashed underline: ambiguity</span>
        <span className="inline-flex items-center gap-1.5"><ShieldAlert className="h-3.5 w-3.5 text-red-700" aria-hidden="true" /> Wavy underline: unknown</span>
      </div>

      {selected && (
        <aside className="relative mt-4 rounded-xl border border-forest-200 bg-forest-50 p-4 text-sm dark:border-forest-700 dark:bg-forest-950/60" aria-label="Selected conversion details">
          <button type="button" onClick={() => setSelected(undefined)} className="absolute right-2 top-2 rounded-lg p-1.5 hover:bg-black/5 dark:hover:bg-white/10" aria-label="Close conversion details"><X className="h-4 w-4" /></button>
          <p className="eyebrow">Conversion detail</p>
          <ReportIssueWidget conversion={{ result, datasetVersion, selection: mapSelection(result, { start: selected.startIndex, end: selected.endIndex }, "source") }} />
          <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <Detail label="Original matched text" value={selected.sourceText} />
            <Detail label="Output" value={selected.replacementText} />
            {entry && <Detail label="Full form" value={entry.full_form} />}
            {entry && <Detail label="Abbreviation" value={entry.abbreviation} />}
            <Detail label="Service" value={selected.service} />
            <Detail label="Annex" value={selected.annex ? `Annex ${selected.annex}` : "Document rule"} />
            <Detail label="Rule" value={selected.rule.replaceAll("-", " ")} />
            {selected.normalizedRoot && <Detail label="Authorized root" value={selected.normalizedRoot} />}
            <Detail label="Confidence" value={selected.confidence} />
            {entry?.notes && <div className="sm:col-span-2"><Detail label="Notes" value={entry.notes} /></div>}
          </dl>
        </aside>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-stone-500">{label}</dt><dd className="mt-0.5 font-medium text-charcoal dark:text-stone-100">{value}</dd></div>;
}
