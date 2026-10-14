"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ClipboardPaste,
  Copy,
  Download,
  Eraser,
  FileDown,
  FileJson,
  Highlighter,
  ListChecks,
  Sparkles,
  Upload,
  FileInput,
  Send,
} from "lucide-react";
import { AmbiguityReview } from "./AmbiguityReview";
import { DatasetStatusPanel } from "./DatasetStatusPanel";
import { DirectionSelector } from "./DirectionSelector";
import { HighlightedOutput } from "./HighlightedOutput";
import { ReportIssueWidget } from "./ReportIssueWidget";
import { FilterBar } from "./FilterBar";
import { HistoryContent } from "./HistoryContent";
import { mapSelection } from "@/utils/reportSelection";
import {
  resolutionKeyForAll,
  resolutionKeyForOccurrence,
} from "@/engine/converter";
import type { LearningContext } from "@/engine/learning";
import type {
  AmbiguityChoice,
  AmbiguityRecord,
  ConversionDirection,
  ConversionFilters,
  ConversionResult,
  HistoryItem,
} from "@/engine/types";
import { useConversionHistory, REOPEN_STORAGE_KEY } from "@/hooks/useConversionHistory";
import { useConverter } from "@/hooks/useConverter";
import { useLearningProfile } from "@/hooks/useLearningProfile";
import { usePersistentState } from "@/hooks/usePersistentState";
import { useDataset } from "@/providers/DatasetProvider";
import { downloadTextAsDocx } from "@/utils/exporters";
import { isOfficeHost, readWordSelection, replaceWordSelection } from "@/utils/office";

const PREFERENCE_KEY = "sac:converter-preferences:v1";
const DIRECTION_KEY = "sac:converter-direction:v1";
const REMEMBERED_CHOICES_KEY = "sac:ambiguity-choices:v1";

const DEFAULT_FILTERS: Required<ConversionFilters> = {
  service: "all",
  annex: "all",
  context: "internal-service-writing",
};

const FORWARD_SAMPLE =
  "The Major informed the Commanding Officer about the After Action Review. The Air Defence Operations Centre then informed the staff.";
const REVERSE_SAMPLE = "The ADOC info the CO about the AAR.";

function countWords(value: string): number {
  return value.trim() ? value.trim().split(/\s+/u).length : 0;
}

function downloadBlob(content: string, type: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function readRememberedChoices(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(REMEMBERED_CHOICES_KEY) ?? "{}",
    );
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

export function ConverterPanel() {
  const datasetState = useDataset();
  const dataset = datasetState.dataset;
  const [direction, setDirection] = usePersistentState<ConversionDirection>(
    DIRECTION_KEY,
    "full-to-abbreviation",
  );
  const [filters, setFilters] = usePersistentState<Required<ConversionFilters>>(
    PREFERENCE_KEY,
    DEFAULT_FILTERS,
  );
  const [input, setInput] = useState("");
  const [result, setResult] = useState<ConversionResult>();
  const [highlight, setHighlight] = usePersistentState("sac:highlight:v1", true);
  const [showUnresolved, setShowUnresolved] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [ambiguityOpen, setAmbiguityOpen] = useState(false);
  const [resolutions, setResolutions] = useState<Record<string, string>>({});
  const [announcement, setAnnouncement] = useState("");
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { addResult } = useConversionHistory();
  const { convert, isReady } = useConverter(dataset, datasetState.overlay);
  const learning = useLearningProfile();
  const [inputSelection, setInputSelection] = useState<{ start: number; end: number }>();
  const [officeHost, setOfficeHost] = useState(false);
  const datasetVersion = datasetState.version;

  useEffect(() => setOfficeHost(isOfficeHost()), []);

  // The context a learned preference belongs to: the abbreviation plus the
  // service, writing context and direction active during the decision.
  function learningContextFor(abbreviation: string): LearningContext {
    return {
      abbreviation,
      service: filters.service,
      writingContext: filters.context,
      direction,
    };
  }

  useEffect(() => {
    try {
      const staged = window.localStorage.getItem(REOPEN_STORAGE_KEY);
      if (!staged) return;
      const item = JSON.parse(staged) as HistoryItem;
      window.localStorage.removeItem(REOPEN_STORAGE_KEY);
      setInput(item.originalText);
      setDirection(item.direction);
      setFilters({
        service: (item.appliedFilters.service ?? "all") as Required<ConversionFilters>["service"],
        annex: item.appliedFilters.annex ?? "all",
        context: (item.appliedFilters.context ?? "internal-service-writing") as Required<ConversionFilters>["context"],
      });
      setAnnouncement("Conversion reopened from local history. Select Convert to run it again.");
    } catch {
      window.localStorage.removeItem(REOPEN_STORAGE_KEY);
    }
  }, [setDirection, setFilters]);

  const runConversion = useCallback(
    async (
      activeResolutions?: Record<string, string>,
      saveToHistory = true,
      autoSaved = false,
    ) => {
      setError("");
      const choices = activeResolutions ?? {
        ...readRememberedChoices(),
        ...resolutions,
      };
      try {
        const next = await convert(input, direction, {
          ...filters,
          resolutions: choices,
          learning: learning.profile,
        });
        setResult(next);
        setResolutions((current) => Object.keys(current).length === Object.keys(choices).length && Object.keys(choices).every((key) => current[key] === choices[key]) ? current : choices);
        if (saveToHistory) addResult(next, autoSaved);
        setAnnouncement(
          `Conversion complete. ${next.replacements.length} replacement${
            next.replacements.length === 1 ? "" : "s"
          }, ${next.ambiguities.length} ambiguit${
            next.ambiguities.length === 1 ? "y" : "ies"
          }, and ${next.unresolved.length} unresolved term${
            next.unresolved.length === 1 ? "" : "s"
          } found.`,
        );
      } catch (conversionError) {
        setError(
          conversionError instanceof Error
            ? conversionError.message
            : "Conversion could not be completed.",
        );
      }
    },
    [convert, input, direction, filters, resolutions, addResult, learning.profile],
  );

  // Live conversion: rerun automatically as the input, direction, filters or
  // ambiguity resolutions change, without waiting for the Convert button.
  // Auto-converted results are saved to history as well; the coalescing in
  // useConversionHistory keeps one continuous editing session to one entry.
  useEffect(() => {
    if (!isReady) return;
    if (!input.trim()) {
      setResult(undefined);
      return;
    }
    const timer = setTimeout(() => void runConversion(undefined, true, true), 600);
    return () => clearTimeout(timer);
  }, [runConversion, isReady, input]);

  if (datasetState.status !== "ready" || !dataset) {
    return <div className="page-shell"><DatasetStatusPanel /></div>;
  }

  function swapDirection() {
    const next =
      direction === "full-to-abbreviation"
        ? "abbreviation-to-full"
        : "full-to-abbreviation";
    setDirection(next);
    if (result) setInput(result.convertedText);
    setResult(undefined);
    setResolutions({});
    setAnnouncement("Direction swapped. The previous output is now ready as input.");
  }

  async function pasteText() {
    try {
      const text = await navigator.clipboard.readText();
      setInput(text);
      setAnnouncement("Clipboard text pasted into the input panel.");
    } catch {
      setError("Clipboard access was not granted. Use your browser’s paste command instead.");
    }
  }

  async function copyOutput() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.convertedText);
      setAnnouncement("Converted text copied to the clipboard.");
    } catch {
      setError("The browser could not copy the output. Select the text and copy it manually.");
    }
  }

  async function loadWordSelection() {
    try {
      const text = await readWordSelection();
      setInput(text);
      setAnnouncement("Selected Word text loaded into the converter.");
    } catch (conversionError) {
      setError(conversionError instanceof Error ? conversionError.message : "Word selection could not be read.");
    }
  }

  async function insertIntoWord() {
    if (!result) return;
    try {
      await replaceWordSelection(result.convertedText);
      setAnnouncement("Converted text inserted into Word.");
    } catch (conversionError) {
      setError(conversionError instanceof Error ? conversionError.message : "Converted text could not be inserted into Word.");
    }
  }

  async function loadTextFile(file?: File) {
    if (!file) return;
    const name = file.name.toLocaleLowerCase("en");
    if (!name.endsWith(".txt") && !name.endsWith(".docx")) {
      setError("Please select a plain-text (.txt) or Word (.docx) file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("The selected file is larger than the 5 MB local processing limit.");
      return;
    }
    try {
      if (name.endsWith(".docx")) {
        // Loaded on demand so the Word reader stays out of the initial bundle.
        const mammoth = await import("mammoth");
        const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
        setInput(value);
      } else {
        setInput(await file.text());
      }
      setResult(undefined);
      setAnnouncement(`${file.name} loaded locally. The whole document will be converted at once.`);
    } catch {
      setError("The file could not be read.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function resolveAmbiguity(
    ambiguity: AmbiguityRecord,
    choice: AmbiguityChoice,
    applyAll: boolean,
    remember: boolean,
  ) {
    const key = applyAll
      ? resolutionKeyForAll(ambiguity.abbreviation)
      : resolutionKeyForOccurrence(ambiguity.startIndex);
    const next = { ...resolutions, [key]: choice.id };
    if (remember) {
      const stored = readRememberedChoices();
      stored[resolutionKeyForAll(ambiguity.abbreviation)] = choice.id;
      window.localStorage.setItem(
        REMEMBERED_CHOICES_KEY,
        JSON.stringify(stored),
      );
    }
    // Every explicit resolution is a confirmed selection for the learning
    // profile — the app's own generated output is never recorded.
    if (learning.profile) {
      void learning.record(
        learningContextFor(ambiguity.abbreviation),
        choice.id,
        true,
        datasetVersion,
      );
    }
    setResolutions(next);
    await runConversion(next, true);
  }

  async function rejectSuggestion(ambiguity: AmbiguityRecord, choiceId: string) {
    if (!learning.profile) return;
    await learning.record(learningContextFor(ambiguity.abbreviation), choiceId, false, datasetVersion);
    await runConversion(undefined, false);
    setAnnouncement("Recorded that this meaning does not apply in this context.");
  }

  async function alwaysApplySuggestion(ambiguity: AmbiguityRecord, choiceId: string, value: boolean) {
    if (!learning.profile) return;
    await learning.setAlwaysApply(learningContextFor(ambiguity.abbreviation), choiceId, value);
    await runConversion(undefined, false);
    setAnnouncement(
      value
        ? "This meaning will be applied automatically in this service and context. You can withdraw it any time."
        : "Automatic application withdrawn for this meaning.",
    );
  }

  async function forgetSuggestion(ambiguity: AmbiguityRecord, choiceId: string) {
    if (!learning.profile) return;
    await learning.forget(learningContextFor(ambiguity.abbreviation), choiceId);
    await runConversion(undefined, false);
    setAnnouncement("Learned preference removed for this abbreviation.");
  }

  const inputTitle =
    direction === "full-to-abbreviation" ? "Full-form input" : "Abbreviated input";
  const outputTitle =
    direction === "full-to-abbreviation" ? "Authorized abbreviation" : "Expanded full form";
  const needsReview =
    result?.replacements.filter((item) => item.confidence === "needs-review") ?? [];

  return (
    <>
      <h1 className="sr-only">Abbreviation Converter</h1>

      <div className="page-shell space-y-5 py-6 sm:py-8">
        <FilterBar
          sections={[
            { id: "service", label: "Service", options: [
              { value: "all", label: "All Services" }, { value: "tri-service", label: "Tri-Service" }, { value: "army", label: "Army" },
              { value: "navy", label: "Navy" }, { value: "air-force", label: "Air Force" }, { value: "other", label: "Other" },
            ] },
            { id: "context", label: "Writing type", searchable: true, options: [
              { value: "internal-service-writing", label: "Internal Service Writing" }, { value: "signal-message", label: "Signal Message" },
              { value: "civilian-external-correspondence", label: "Civilian/External Correspondence" }, { value: "military-qualification", label: "Military Qualification" },
              { value: "national-force-designation", label: "National Force Designation" }, { value: "operational-writing", label: "Operational Writing" },
              { value: "operational-heading", label: "Operational Order Paragraph Heading" }, { value: "formal-letter", label: "Formal Letter" },
              { value: "demi-official-letter", label: "Demi-official Letter" }, { value: "commanded-letter", label: "Commanded Letter" },
              { value: "service-paper", label: "Service Paper" }, { value: "air-force-operational-paper", label: "BAF Service Paper on Operational Matters" },
              { value: "allied-forces-correspondence", label: "Correspondence with Allied Forces" }, { value: "foreign-correspondence", label: "Correspondence with Foreign Organizations" },
              { value: "paramilitary-operational-writing", label: "Operational Writing to Para-military Forces" }, { value: "departmental-title", label: "Departmental or Business Title" },
              { value: "personnel-line", label: "Personnel Name and Qualifications" }, { value: "address-box", label: "Correspondence Address Box" },
            ] },
          ]}
          values={{ service: filters.service, context: filters.context }}
          defaults={{ service: "all", context: "internal-service-writing" }}
          onChange={(values) => setFilters((current) => ({ ...current, service: values.service as Required<ConversionFilters>["service"], context: values.context as Required<ConversionFilters>["context"] }))}
        />
        {["civilian-external-correspondence", "allied-forces-correspondence", "foreign-correspondence"].includes(filters.context) && (
          <div role="status" className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>Service abbreviations are excluded for these addressees. Full forms will be retained.</p>
          </div>
        )}
        {filters.context === "operational-heading" && <p className="text-sm text-slate-600 dark:text-stone-300">Operational/administrative headings stay in full.</p>}
        {["formal-letter", "demi-official-letter", "commanded-letter", "service-paper"].includes(filters.context) && <p className="text-sm text-slate-600 dark:text-stone-300">Only decorations, qualifications and arms/services are abbreviated.</p>}
        {filters.context === "personnel-line" && <p className="text-sm text-slate-600 dark:text-stone-300">Rank, name, decorations and qualifications.</p>}
        {filters.context === "air-force-operational-paper" && filters.service !== "air-force" && <p className="text-sm text-slate-600 dark:text-stone-300">Select Air Force to apply this exception.</p>}
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/30 dark:text-red-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {error}
          </div>
        )}
        <p className="sr-only" aria-live="polite">{announcement}</p>

        <section className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_154px_minmax(0,1fr)]" aria-label="Converter workspace">
          <article className="surface-card flex min-h-[500px] flex-col overflow-hidden">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-slate-50/80 px-4 py-3 dark:border-white/10 dark:bg-white/[.035]">
              <div>
                <p className="eyebrow">Input</p>
                <h2 className="mt-0.5 font-bold">{inputTitle}</h2>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-1">
                {officeHost && <button type="button" className="button-primary !px-3 !py-2" onClick={() => void loadWordSelection()}><FileInput className="h-4 w-4" /> <span>Read Word selection</span></button>}
                <button type="button" className="button-ghost" onClick={() => void pasteText()}><ClipboardPaste className="h-4 w-4" /> <span className="hidden sm:inline">Paste</span></button>
                <button type="button" className="button-ghost" onClick={() => { setInput(""); setResult(undefined); }}><Eraser className="h-4 w-4" /> <span className="hidden sm:inline">Clear</span></button>
                <button type="button" className="button-ghost" onClick={() => { setInput(direction === "full-to-abbreviation" ? FORWARD_SAMPLE : REVERSE_SAMPLE); setResult(undefined); }}><Sparkles className="h-4 w-4" /> <span className="hidden sm:inline">Sample</span></button>
                <button type="button" className="button-ghost" onClick={() => fileInputRef.current?.click()}><Upload className="h-4 w-4" /> <span className="hidden sm:inline">Upload .docx/.txt</span></button>
                <input ref={fileInputRef} type="file" accept=".txt,.docx,text/plain" className="sr-only" onChange={(event) => void loadTextFile(event.target.files?.[0])} aria-label="Upload a Word or text file" />
              </div>
            </header>
            <label htmlFor="converter-input" className="sr-only">{inputTitle}</label>
            <textarea
              id="converter-input"
              value={input}
              onChange={(event) => { setInput(event.target.value); setInputSelection(undefined); }}
              onSelect={(event) => { const el = event.currentTarget; setInputSelection(el.selectionEnd > el.selectionStart ? { start: el.selectionStart, end: el.selectionEnd } : undefined); }}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                  event.preventDefault();
                  void runConversion();
                }
              }}
              spellCheck
              className="min-h-[390px] flex-1 resize-y bg-transparent p-5 text-[15px] leading-7 outline-none placeholder:text-slate-400 dark:placeholder:text-stone-600"
              placeholder={direction === "full-to-abbreviation" ? "Enter ordinary English service-writing text…" : "Enter authorized abbreviations to expand…"}
            />
            {result && result.originalText === input && inputSelection && <ReportIssueWidget label="Report selected text" conversion={{ result, datasetVersion, selection: mapSelection(result, inputSelection, "source") }} />}
            <footer className="flex items-center justify-between border-t px-4 py-3 text-xs text-slate-500 dark:border-white/10 dark:text-stone-400">
              <span>{countWords(input).toLocaleString()} words</span>
              <span className="flex items-center gap-3">
                <kbd className="rounded border bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] dark:border-white/15 dark:bg-white/10">Ctrl/⌘ ↵</kbd>
                <span>{input.length.toLocaleString()} characters</span>
              </span>
            </footer>
          </article>

          <DirectionSelector onSwap={swapDirection} />

          <article className="surface-card flex min-h-[500px] flex-col overflow-hidden">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-slate-50/80 px-4 py-3 dark:border-white/10 dark:bg-white/[.035]">
              <div>
                <p className="eyebrow">Output</p>
                <h2 className="mt-0.5 font-bold">{outputTitle}</h2>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-1">
                {officeHost && <button type="button" className="button-primary !px-3 !py-2" disabled={!result} onClick={() => void insertIntoWord()}><Send className="h-4 w-4" /> <span>Replace in Word</span></button>}
                <span className="text-xs text-slate-500">Select text to report it</span>
                <button type="button" className="button-ghost" disabled={!result} onClick={() => void copyOutput()}><Copy className="h-4 w-4" /> <span className="hidden sm:inline">Copy</span></button>
                <button type="button" className="button-ghost" disabled={!result} onClick={() => result && void downloadTextAsDocx(result.convertedText, "service-abbreviation-conversion.docx")}><FileDown className="h-4 w-4" /> <span className="hidden sm:inline">.docx</span></button>
                <button type="button" className="button-ghost" disabled={!result} onClick={() => result && downloadBlob(result.convertedText, "text/plain;charset=utf-8", "service-abbreviation-conversion.txt")}><Download className="h-4 w-4" /> <span className="hidden sm:inline">.txt</span></button>
                <button type="button" className="button-ghost" title="Export conversion details locally" disabled={!result} onClick={() => result && downloadBlob(JSON.stringify(result, null, 2), "application/json;charset=utf-8", "service-abbreviation-report.json")}><FileJson className="h-4 w-4" /> <span className="hidden sm:inline">Export details</span></button>
              </div>
            </header>

            {result && (
              <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5 text-xs dark:border-white/10">
                <span className="status-pill border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200"><Check className="h-3 w-3" /> {result.replacements.length} changed</span>
                {result.ambiguities.length > 0 && <button type="button" onClick={() => setAmbiguityOpen(true)} className="status-pill border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">{result.ambiguities.length} to review</button>}
                {result.unresolved.length > 0 && <span className="status-pill border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">{result.unresolved.length} unresolved</span>}
              </div>
            )}

            <div className="min-h-[325px] flex-1 p-5">
              <HighlightedOutput result={result} dataset={dataset} enabled={highlight} datasetVersion={datasetVersion} />
            </div>

            <footer className="border-t p-3 dark:border-white/10">
              <div className="grid grid-cols-3 gap-1">
                <ToggleButton active={highlight} onClick={() => setHighlight((value) => !value)} icon={<Highlighter className="h-4 w-4" />} label="Highlight changes" />
                <ToggleButton active={showUnresolved} onClick={() => setShowUnresolved((value) => !value)} icon={<AlertTriangle className="h-4 w-4" />} label="Unresolved terms" />
                <ToggleButton active={showDetails} onClick={() => setShowDetails((value) => !value)} icon={<ListChecks className="h-4 w-4" />} label="Conversion details" />
              </div>
            </footer>
          </article>
        </section>

        {result?.warnings.length ? (
          <section aria-labelledby="warnings-title" className="surface-card border-amber-200 p-5 dark:border-amber-900/60">
            <h2 id="warnings-title" className="flex items-center gap-2 font-bold text-amber-900 dark:text-amber-100"><AlertTriangle className="h-4 w-4" /> Report warnings</h2>
            <ul className="mt-3 space-y-2 text-sm text-amber-950/80 dark:text-amber-100/80">{result.warnings.map((warning) => <li key={warning} className="flex gap-2"><span aria-hidden="true">•</span><span>{warning}</span></li>)}</ul>
          </section>
        ) : null}

        {showUnresolved && (
          <section className="surface-card p-5" aria-labelledby="unresolved-title">
            <div className="flex items-center justify-between gap-3"><div><p className="eyebrow">Review queue</p><h2 id="unresolved-title" className="mt-1 text-lg font-bold">Unresolved terms and ambiguities</h2></div>{result?.ambiguities.length ? <button className="button-primary" type="button" onClick={() => setAmbiguityOpen(true)}>Review ambiguities</button> : null}</div>
            {!result || (!result.ambiguities.length && !result.unresolved.length && !needsReview.length) ? <p className="mt-4 text-sm text-slate-500 dark:text-stone-400">No unresolved terms in the current result.</p> : (
              <div className="mt-4 space-y-4">
                {needsReview.length ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    {needsReview.map((item) => <div key={`nr-${item.startIndex}`} className="rounded-xl border border-sky-200 bg-sky-50 p-4 dark:border-sky-800 dark:bg-sky-950/20"><strong>{item.sourceText}</strong> <span aria-hidden="true">→</span> <strong>{item.replacementText}</strong><p className="mt-1 text-sm">Generated by the {item.rule.replace("-", " ")} rule. Confirm the form is clear in context.</p><p className="mt-2 text-xs text-slate-600 dark:text-stone-400">Root form: {item.normalizedRoot}</p></div>)}
                  </div>
                ) : null}
                {result.ambiguities.length || result.unresolved.length ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    {result.ambiguities.map((item) => <div key={`a-${item.startIndex}`} className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/20"><strong>{item.abbreviation}</strong><p className="mt-1 text-sm">{item.choices.length} possible meanings; user selection required.</p><p className="mt-2 line-clamp-2 text-xs text-slate-600 dark:text-stone-400">{item.surroundingSentence}</p></div>)}
                    {result.unresolved.map((item) => <div key={`u-${item.startIndex}`} className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/20"><strong>{item.sourceText}</strong><p className="mt-1 text-sm">{item.reason.replaceAll("-", " ")}</p><p className="mt-2 text-xs text-slate-600 dark:text-stone-400">Characters {item.startIndex}–{item.endIndex}</p></div>)}
                  </div>
                ) : null}
              </div>
            )}
          </section>
        )}

        {showDetails && (
          <section className="surface-card overflow-hidden" aria-labelledby="details-title">
            <div className="border-b p-5 dark:border-white/10"><p className="eyebrow">Audit trail</p><h2 id="details-title" className="mt-1 text-lg font-bold">Conversion details</h2></div>
            {!result?.replacements.length ? <p className="p-5 text-sm text-slate-500 dark:text-stone-400">No replacements to display.</p> : (
              <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600 dark:bg-white/5 dark:text-stone-400"><tr><th className="px-5 py-3">Source</th><th className="px-5 py-3">Replacement</th><th className="px-5 py-3">Position</th></tr></thead><tbody className="divide-y dark:divide-white/10">{result.replacements.slice(0, 100).map((replacement, index) => <tr key={`${replacement.startIndex}-${index}`}><td className="px-5 py-3 font-medium">{replacement.sourceText}</td><td className="px-5 py-3 font-bold text-forest-700 dark:text-gold-300">{replacement.replacementText}</td><td className="px-5 py-3 font-mono text-xs">{replacement.startIndex}–{replacement.endIndex}</td></tr>)}</tbody></table>{result.replacements.length > 100 && <p className="border-t p-4 text-xs text-slate-500 dark:border-white/10 dark:text-stone-400">Showing the first 100 of {result.replacements.length} records. Export the JSON report for the complete audit trail.</p>}</div>
            )}
          </section>
        )}
      </div>

      <div className="page-shell mt-6"><details className="surface-card p-5"><summary className="cursor-pointer text-lg font-bold">Recent conversions</summary><HistoryContent embedded onReopen={(item) => { setInput(item.originalText); setDirection(item.direction); setFilters({ service: (item.appliedFilters.service ?? "all") as Required<ConversionFilters>["service"], annex: item.appliedFilters.annex ?? "all", context: (item.appliedFilters.context ?? "internal-service-writing") as Required<ConversionFilters>["context"] }); setResolutions({}); setResult(undefined); window.scrollTo({ top: 0, behavior: "smooth" }); }} /></details></div>

      <AmbiguityReview
        open={ambiguityOpen}
        ambiguities={result?.ambiguities ?? []}
        onClose={() => setAmbiguityOpen(false)}
        onResolve={resolveAmbiguity}
        onRejectSuggestion={rejectSuggestion}
        onForgetSuggestion={forgetSuggestion}
        onAlwaysApply={alwaysApplySuggestion}
      />
    </>
  );
}

function ToggleButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-[11px] font-semibold sm:flex-row sm:text-xs ${active ? "bg-forest-50 text-forest-800 dark:bg-gold-900/20 dark:text-gold-200" : "text-slate-500 hover:bg-slate-50 dark:text-stone-400 dark:hover:bg-white/5"}`}>
      {icon}<span className="truncate">{label}</span>
    </button>
  );
}
