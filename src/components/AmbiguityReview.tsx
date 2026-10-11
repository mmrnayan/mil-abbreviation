"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, Check, Sparkles, X } from "lucide-react";
import type { AmbiguityChoice, AmbiguityRecord } from "@/engine/types";

interface AmbiguityReviewProps {
  open: boolean;
  ambiguities: AmbiguityRecord[];
  onClose: () => void;
  onResolve: (
    ambiguity: AmbiguityRecord,
    choice: AmbiguityChoice,
    applyAll: boolean,
    remember: boolean,
  ) => void | Promise<void>;
  /** Records a rejection for the learned suggestion ("not in this context"). */
  onRejectSuggestion?: (ambiguity: AmbiguityRecord, choiceId: string) => void | Promise<void>;
  /** Removes the learned preference for this meaning entirely. */
  onForgetSuggestion?: (ambiguity: AmbiguityRecord, choiceId: string) => void | Promise<void>;
  /** The user's explicit "Always use this meaning in this context" switch. */
  onAlwaysApply?: (ambiguity: AmbiguityRecord, choiceId: string, value: boolean) => void | Promise<void>;
}

export function AmbiguityReview({ open, ambiguities, onClose, onResolve, onRejectSuggestion, onForgetSuggestion, onAlwaysApply }: AmbiguityReviewProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [index, setIndex] = useState(0);
  const [choiceId, setChoiceId] = useState("");
  const [applyAll, setApplyAll] = useState(true);
  const [remember, setRemember] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const safeIndex = Math.min(index, Math.max(0, ambiguities.length - 1));
  const ambiguity = ambiguities[safeIndex];

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute("hidden"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [onClose, open]);

  useEffect(() => {
    // Pre-select the learned suggestion, if any — the reviewer still confirms
    // it with "Use selected meaning" before anything is applied.
    const suggested = ambiguity?.suggestion;
    setChoiceId(
      suggested && ambiguity?.choices.some((choice) => choice.id === suggested.choiceId)
        ? suggested.choiceId
        : "",
    );
  }, [safeIndex, ambiguity?.startIndex, ambiguity?.suggestion, ambiguity?.choices]);

  if (!open || !ambiguity) return null;
  const selected = ambiguity.choices.find((choice) => choice.id === choiceId);

  async function submit() {
    if (!selected) return;
    setSubmitting(true);
    try {
      await onResolve(ambiguity, selected, applyAll, remember);
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-forest-950/70 p-3 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/10 bg-white shadow-lift dark:bg-[#181f1d]">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b bg-white p-5 dark:border-white/10 dark:bg-[#181f1d]">
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-amber-100 p-2 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"><AlertCircle className="h-5 w-5" aria-hidden="true" /></span>
            <div>
              <p className="eyebrow !text-amber-700 dark:!text-amber-300">Context required</p>
              <h2 id={titleId} className="mt-0.5 text-xl font-bold">Resolve “{ambiguity.abbreviation}”</h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-stone-400">Occurrence {safeIndex + 1} of {ambiguities.length} · Dataset policy: {ambiguity.policy.replaceAll("_", " ")}</p>
            </div>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} className="button-ghost !p-2" aria-label="Close ambiguity review"><X className="h-5 w-5" /></button>
        </header>

        <div className="space-y-6 p-5 sm:p-6">
          <div>
            <p className="form-label">Surrounding sentence</p>
            <blockquote className="rounded-xl border-l-4 border-amber-400 bg-amber-50 p-4 text-sm leading-6 text-amber-950 dark:bg-amber-950/25 dark:text-amber-100">{ambiguity.surroundingSentence}</blockquote>
          </div>

          <fieldset>
            <legend className="form-label">Select the intended meaning</legend>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {ambiguity.choices.map((choice) => {
                const checked = choice.id === choiceId;
                const suggested = ambiguity.suggestion?.choiceId === choice.id;
                return (
                  <label key={choice.id} className={`cursor-pointer rounded-xl border p-4 ${checked ? "border-forest-600 bg-forest-50 ring-1 ring-forest-600 dark:border-gold-400 dark:bg-gold-900/10 dark:ring-gold-400" : "hover:border-forest-300 dark:border-white/15 dark:hover:border-white/30"}`}>
                    <span className="flex items-start gap-3">
                      <input type="radio" name="ambiguity-choice" value={choice.id} checked={checked} onChange={() => setChoiceId(choice.id)} className="mt-1 h-4 w-4 accent-forest-700" />
                      <span className="min-w-0">
                        <span className="block font-semibold leading-5">{choice.meaning}</span>
                        {suggested && (
                          <span className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-gold-300 bg-gold-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800 dark:border-gold-400/40 dark:bg-gold-900/30 dark:text-amber-200">
                            <Sparkles className="h-3 w-3" aria-hidden="true" />
                            {ambiguity.suggestion?.source === "community"
                              ? `Suggested by ${ambiguity.suggestion?.contributors ?? "several"} users' choices (confirmed ${ambiguity.suggestion?.confirmed ?? 0}×)`
                              : `Suggested from your previous choices (confirmed ${ambiguity.suggestion?.confirmed ?? 0}×)`}
                          </span>
                        )}
                        <span className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-stone-400">
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-white/10">{choice.service}</span>
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-white/10">Annex {choice.annex}</span>
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-white/10">{choice.category.replaceAll("_", " ")}</span>
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-white/10">{choice.confidence} confidence</span>
                        </span>
                        {suggested && (
                          <span className="mt-2 flex flex-wrap gap-2 text-xs">
                            {ambiguity.suggestion?.source === "personal" &&
                              ambiguity.suggestion?.canOfferAlways && (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    void onAlwaysApply?.(ambiguity, choice.id, true);
                                  }}
                                  className="font-semibold text-forest-700 underline decoration-dotted hover:text-forest-900 dark:text-gold-300 dark:hover:text-gold-200"
                                >
                                  Always use this meaning in this context
                                </button>
                              )}
                            <button
                              type="button"
                              onClick={(event) => {
                                event.preventDefault();
                                void onRejectSuggestion?.(ambiguity, choice.id);
                              }}
                              className="font-semibold text-slate-600 underline decoration-dotted hover:text-slate-900 dark:text-stone-300 dark:hover:text-white"
                            >
                              Not in this context
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.preventDefault();
                                void onForgetSuggestion?.(ambiguity, choice.id);
                              }}
                              className="font-semibold text-red-700 underline decoration-dotted hover:text-red-900 dark:text-red-300 dark:hover:text-red-200"
                            >
                              Forget this preference
                            </button>
                          </span>
                        )}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2 dark:bg-white/5">
            <label className="flex items-start gap-2.5"><input type="checkbox" checked={applyAll} onChange={(event) => setApplyAll(event.target.checked)} className="mt-0.5 h-4 w-4 accent-forest-700" /><span><strong className="block">Apply to all occurrences</strong><span className="text-xs text-slate-500 dark:text-stone-400">Use this meaning for every “{ambiguity.abbreviation}” in this text.</span></span></label>
            <label className="flex items-start gap-2.5"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} className="mt-0.5 h-4 w-4 accent-forest-700" /><span><strong className="block">Remember my choice</strong><span className="text-xs text-slate-500 dark:text-stone-400">Store this preference only in this browser.</span></span></label>
          </div>
        </div>

        <footer className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t bg-white p-5 dark:border-white/10 dark:bg-[#181f1d]">
          <div className="flex gap-2">
            <button type="button" className="button-secondary" disabled={safeIndex === 0} onClick={() => setIndex((value) => Math.max(0, value - 1))}><ArrowLeft className="h-4 w-4" /> Previous</button>
            <button type="button" className="button-secondary" disabled={safeIndex >= ambiguities.length - 1} onClick={() => setIndex((value) => Math.min(ambiguities.length - 1, value + 1))}>Next <ArrowRight className="h-4 w-4" /></button>
          </div>
          <button type="button" className="button-primary" disabled={!selected || submitting} onClick={() => void submit()}><Check className="h-4 w-4" /> {submitting ? "Applying…" : "Use selected meaning"}</button>
        </footer>
      </section>
    </div>
  );
}
