"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowRightLeft,
  Clock3,
  Copy,
  Download,
  FileDown,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useConversionHistory } from "@/hooks/useConversionHistory";
import { downloadHistoryAsDocx, downloadHistoryAsTxt } from "@/utils/exporters";
import type { HistoryItem } from "@/engine/types";

export function HistoryContent({ embedded = false, onReopen }: { embedded?: boolean; onReopen?: (item: HistoryItem) => void }) {
  const router = useRouter();
  const { items, remove, clear, stageForReopen } = useConversionHistory();
  const [announcement, setAnnouncement] = useState("");

  async function copy(item: HistoryItem) {
    try {
      await navigator.clipboard.writeText(item.convertedText);
      setAnnouncement("Converted text copied.");
    } catch {
      setAnnouncement("Copy failed. Use your browser’s manual copy command.");
    }
  }

  return (
    <>
      {!embedded && <section className="border-b bg-forest-50 dark:border-white/10 dark:bg-[#111815]">
        <div className="page-shell py-6">
          <h1 className="font-display text-2xl font-bold text-forest-950 sm:text-3xl dark:text-white">Conversion history</h1>
        </div>
      </section>}

      <div className={embedded ? "py-4" : "page-shell py-7"}>
        <p className="sr-only" aria-live="polite">{announcement}</p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600 dark:text-stone-400"><strong className="text-charcoal dark:text-white">{items.length}</strong> of 50 local records</p>
          <div className="flex gap-2">
            <button type="button" className="button-secondary" disabled={!items.length} onClick={() => void downloadHistoryAsDocx(items, "service-abbreviation-history.docx")}><FileDown className="h-4 w-4" /> Export DOCX</button>
            <button type="button" className="button-secondary" disabled={!items.length} onClick={() => downloadHistoryAsTxt(items, "service-abbreviation-history.txt")}><Download className="h-4 w-4" /> Export TXT</button>
            {/* JSON export hidden for now — restore when needed. */}
            {/* <button type="button" className="button-secondary" disabled={!items.length} onClick={() => exportJson(items)}><Download className="h-4 w-4" /> Export JSON</button> */}
            <button type="button" className="button-secondary !text-red-700 dark:!text-red-300" disabled={!items.length} onClick={() => { if (window.confirm("Clear all locally stored conversion history?")) clear(); }}><Trash2 className="h-4 w-4" /> Clear history</button>
          </div>
        </div>

        {!items.length ? (
          <div className="surface-card mt-5 py-20 text-center"><Clock3 className="mx-auto h-10 w-10 text-slate-300 dark:text-stone-600" /><h2 className="mt-4 text-lg font-bold">No saved conversions yet</h2><p className="mt-2 text-sm text-slate-500 dark:text-stone-400">Conversions will appear here automatically after you select Convert.</p><button type="button" className="button-primary mt-5" onClick={() => router.push("/")}>Open converter</button></div>
        ) : (
          <ol className="mt-5 space-y-4">
            {items.map((item) => (
              <li key={item.id}>
                <article className="surface-card overflow-hidden">
                  <header className="flex flex-col justify-between gap-3 border-b bg-slate-50/70 px-5 py-3 sm:flex-row sm:items-center dark:border-white/10 dark:bg-white/[.03]">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-stone-400"><span className="inline-flex items-center gap-1.5 font-semibold text-charcoal dark:text-stone-100"><Clock3 className="h-3.5 w-3.5" /> {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</span><span aria-hidden="true">•</span><span className="capitalize">{item.direction.replaceAll("-", " ")}</span><span aria-hidden="true">•</span><span>{item.replacementCount} changed</span><span>{item.ambiguityCount} ambiguous</span><span>{item.unresolvedCount} unresolved</span></div>
                    <div className="flex flex-wrap gap-1"><button type="button" className="button-ghost" onClick={() => { if (onReopen) onReopen(item); else { stageForReopen(item); router.push("/"); } }}><RotateCcw className="h-4 w-4" /> Reopen</button><button type="button" className="button-ghost" onClick={() => void copy(item)}><Copy className="h-4 w-4" /> Copy</button><button type="button" className="button-ghost !text-red-700 dark:!text-red-300" onClick={() => remove(item.id)} aria-label="Delete this history record"><Trash2 className="h-4 w-4" /></button></div>
                  </header>
                  <div className="grid gap-0 md:grid-cols-[1fr_auto_1fr]">
                    <HistoryText label="Original" text={item.originalText} />
                    <div className="hidden place-items-center border-x px-3 md:grid dark:border-white/10"><ArrowRightLeft className="h-4 w-4 text-slate-400" /></div>
                    <HistoryText label="Converted" text={item.convertedText} />
                  </div>
                  <footer className="flex flex-wrap gap-x-4 gap-y-1 border-t px-5 py-2.5 text-[11px] text-slate-500 dark:border-white/10 dark:text-stone-500"><span>Service: {item.appliedFilters.service}</span><span>Annex: {item.appliedFilters.annex}</span><span>Context: {item.appliedFilters.context?.replaceAll("-", " ")}</span></footer>
                </article>
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  );
}

function HistoryText({ label, text }: { label: string; text: string }) {
  return <div className="min-w-0 p-5"><p className="form-label">{label}</p><p className="line-clamp-4 whitespace-pre-wrap break-words text-sm leading-6">{text || <span className="italic text-slate-400">Empty text</span>}</p></div>;
}
