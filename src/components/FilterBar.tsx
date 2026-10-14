"use client";

import { useEffect, useRef, useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";

export interface FilterSectionDef {
  id: string;
  label: string;
  options: Array<{ value: string; label: string }>;
  searchable?: boolean;
}

interface FilterBarProps {
  sections: FilterSectionDef[];
  values: Record<string, string>;
  defaults: Record<string, string>;
  /** When set, applied filters are remembered between sessions under this key. */
  storageKey?: string;
  onChange: (values: Record<string, string>) => void;
}

const FOCUSABLE = "button:not(:disabled), input, [role='radio']";

/**
 * Single-row filter bar that opens a bottom sheet. Selections are drafted
 * inside the sheet and only committed on Apply; closing discards the draft.
 */
export function FilterBar({ sections, values, defaults, storageKey, onChange }: FilterBarProps) {
  const barRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [entered, setEntered] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>(values);
  const [term, setTerm] = useState("");

  // Session memory: hydrate persisted filters once on mount.
  useEffect(() => {
    if (!storageKey) return;
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
      if (saved && typeof saved === "object" && sections.every((section) => typeof saved[section.id] === "string")) onChange(saved);
    } catch { /* Ignore unreadable saved filters. */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open) return;
    setDraft(values);
    setTerm("");
    const timer = requestAnimationFrame(() => setEntered(true));
    const previous = document.activeElement as HTMLElement | null;
    sheetRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); return; }
      if (event.key !== "Tab" || !sheetRef.current) return;
      const controls = [...sheetRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(timer);
      window.removeEventListener("keydown", onKey);
      setEntered(false);
      // Return focus to the filter bar when the sheet closes.
      barRef.current?.focus();
      void previous;
    };
  }, [open, values]);

  function apply() {
    onChange(draft);
    if (storageKey) { try { localStorage.setItem(storageKey, JSON.stringify(draft)); } catch { /* Saving is best-effort. */ } }
    setOpen(false);
  }

  function reset() {
    onChange({ ...defaults });
    if (storageKey) { try { localStorage.removeItem(storageKey); } catch { /* Best-effort. */ } }
    setDraft({ ...defaults });
    setOpen(false);
  }

  const activeCount = sections.filter((section) => values[section.id] !== defaults[section.id]).length;
  const summary = sections
    .map((section) => section.options.find((option) => option.value === values[section.id])?.label ?? section.label)
    .join(" · ");

  return (
    <div>
      <button
        ref={barRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Open filters"
        onClick={() => setOpen(true)}
        className="flex h-11 w-full items-center gap-2 rounded-xl border border-forest-200 bg-white px-3 text-left hover:bg-forest-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-500 active:bg-forest-100 dark:border-white/15 dark:bg-white/5 dark:hover:bg-white/10 dark:active:bg-white/15"
      >
        <SlidersHorizontal className="h-4 w-4 shrink-0 text-forest-700 dark:text-gold-300" aria-hidden="true" />
        <span className="shrink-0 text-sm font-semibold">Filters</span>
        {activeCount > 0 && (
          <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-gold-400 px-1 text-[11px] font-bold text-forest-950" aria-label={`${activeCount} filters active`}>{activeCount}</span>
        )}
        <span className="truncate text-xs text-slate-500 dark:text-stone-400">{summary}</span>
        {activeCount > 0 && (
          <span
            role="button"
            tabIndex={0}
            aria-label="Reset filters"
            onClick={(event) => { event.stopPropagation(); reset(); }}
            onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); reset(); } }}
            className="ml-auto shrink-0 rounded-md px-2 py-2 text-xs font-semibold text-forest-700 hover:bg-forest-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-500 active:bg-forest-200 dark:text-gold-300 dark:hover:bg-white/10 dark:active:bg-white/20"
          >
            Reset
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-[120]">
          <div
            className={`absolute inset-0 bg-forest-950/60 backdrop-blur-sm transition-opacity duration-200 motion-reduce:transition-none ${entered ? "opacity-100" : "opacity-0"}`}
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="Filters"
            className={`absolute inset-x-0 bottom-0 flex max-h-[70dvh] flex-col rounded-t-2xl bg-white shadow-lift transition-transform duration-200 motion-reduce:transition-none dark:bg-[#14251f] ${entered ? "translate-y-0" : "translate-y-full"}`}
            onTouchStart={(event) => { dragStart.current = event.touches[0].clientY; }}
            onTouchMove={(event) => {
              if (dragStart.current === null || !sheetRef.current) return;
              const delta = event.touches[0].clientY - dragStart.current;
              if (delta > 0) sheetRef.current.style.transform = `translateY(${delta}px)`;
            }}
            onTouchEnd={(event) => {
              if (dragStart.current === null || !sheetRef.current) return;
              const delta = event.changedTouches[0].clientY - dragStart.current;
              dragStart.current = null;
              sheetRef.current.style.transform = "";
              if (delta > 80) setOpen(false);
            }}
          >
            <div
              className="flex cursor-grab justify-center pt-2"
              onTouchStart={(event) => { dragStart.current = event.touches[0].clientY; }}
              aria-hidden="true"
            >
              <div className="h-1 w-10 rounded-full bg-slate-300 dark:bg-white/20" />
            </div>
            <div className="flex items-center justify-between px-4 pb-2 pt-2">
              <h2 className="text-lg font-bold">Filters</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close filters"
                className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 hover:bg-forest-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-500 active:bg-forest-100 dark:text-stone-400 dark:hover:bg-white/10 dark:active:bg-white/20"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-2">
              {sections.map((section) => {
                const visible = section.searchable && term
                  ? section.options.filter((option) => option.label.toLowerCase().includes(term.toLowerCase()))
                  : section.options;
                return (
                  <section key={section.id} className="mt-3">
                    <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-stone-400">{section.label}</h3>
                    {section.searchable && (
                      <label className="relative mt-2 block">
                        <span className="sr-only">{`Filter ${section.label} options`}</span>
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                        <input className="form-control !py-2.5 !pl-9 text-sm" type="search" value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Search options…" />
                      </label>
                    )}
                    <div role="radiogroup" aria-label={section.label} className="mt-1">
                      {visible.map((option) => {
                        const checked = draft[section.id] === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            role="radio"
                            aria-checked={checked}
                            onClick={() => setDraft((current) => ({ ...current, [section.id]: option.value }))}
                            className={`flex min-h-12 w-full items-center justify-between rounded-lg px-3 text-left text-sm hover:bg-forest-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-500 active:bg-forest-100 dark:hover:bg-white/10 dark:active:bg-white/20 ${checked ? "bg-gold-300/10 dark:bg-gold-300/15" : ""}`}
                          >
                            {option.label}
                            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${checked ? "border-gold-500" : "border-slate-300 dark:border-white/25"}`} aria-hidden="true">
                              {checked && <span className="h-2.5 w-2.5 rounded-full bg-gold-500" />}
                            </span>
                          </button>
                        );
                      })}
                      {section.searchable && term && !visible.length && (
                        <p className="px-3 py-3 text-sm text-slate-500 dark:text-stone-400">No matching options.</p>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>

            <div className="flex justify-end gap-2 border-t px-3 pt-3 pb-[max(env(safe-area-inset-bottom,0px),12px)] dark:border-white/10">
              <button type="button" className="button-ghost !min-h-11" onClick={reset}>Reset</button>
              <button type="button" className="button-primary !min-h-11" onClick={apply}>Apply</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
