"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BadgeCheck,
  CheckCircle2,
  ClipboardList,
  Download,
  FlaskConical,
  Save,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { DatasetStatusPanel } from "./DatasetStatusPanel";
import { FilterBar } from "./FilterBar";
import { useDataset } from "@/providers/DatasetProvider";
import { useLearningProfile } from "@/hooks/useLearningProfile";
import { ConverterEngine } from "@/engine/converter";
import { rulesOverlay } from "@/engine/rulesOverlay";
import type { ConversionDirection, ConversionResult, ConversionFilters } from "@/engine/types";
import { readConversionFeedbackContext, REVIEW_FEEDBACK_STORAGE_KEY, type ConversionFeedbackContext } from "@/utils/conversionFeedback";
import {
  analyzeCorrections,
  ERROR_TYPES,
  REQUIRED_RULES,
  REQUIRED_RULE_CAUSES,
  type AnalysisDictionary,
  type ErrorTypeId,
} from "@/utils/correctionAnalysis";

interface SavedCorrection {
  feedback_id: string;
  input_sentence: string;
  actual_output: string;
  expected_output: string;
  corrections: {
    source: string;
    actual: string;
    expected: string;
    error_type: string;
    root?: string;
    entry_id?: string;
    required_rule?: string;
  }[];
  review_status: string;
  reviewed_by: string;
  created_at?: string;
}

interface CommunityEvidence {
  abbreviation: string;
  service: string;
  writingContext: string;
  direction: string;
  choices: Record<string, { confirmed: number; rejected: number }>;
}

interface AgentJob {
  jobId: string;
  status: "running" | "done" | "failed" | "interrupted";
  startedAt: string;
  finishedAt?: string;
  progress: { stage: string; detail: string };
  correctionsRead: number;
  groupsFound: number;
  proposalsNew: number;
  proposalsKnown: number;
  proposalIds: string[];
  failures: string[];
}

interface AgentProposal {
  id: string;
  pattern: string;
  error_types: string[];
  occurrences: number;
  feedback_ids: string[];
  sample_sentence?: string;
  rule: string;
  entry_id?: string;
  input: string;
  output: string;
  current_full_form?: string;
  suggested_full_form?: string;
  reason: string;
  evidence: { manual: string; line: number; quotation: string; matched: string }[];
  validation: { entryExists: boolean; notDuplicate: boolean; noConflict: boolean; manualSupport: boolean };
  reviewStatus: "proposed" | "approved" | "rejected";
}

interface EditableRow {
  key: number;
  source: string;
  actual: string;
  expected: string;
  error_type: ErrorTypeId;
  root: string;
  entry_id: string;
  required_rule: string;
}

const RULE_LABELS: Record<string, string> = {
  "exact-authorized": "Authorized pair from the dictionary",
  "exact-exception": "Authorized pair — exact form only",
  "verb-derivative": "Verb rule — same abbreviation for all tenses",
  "noun-plural": "Plural rule — approved noun form",
  "compound-prefix": "Compound prefix — prefix letters in front",
  "compound-suffix": "Compound suffix — suffix letters attached",
  "context-generated": "Authorized contextual form",
  "document-policy": "Document formatting rule",
  "reviewer-approved": "Reviewer-approved extension — check against the source",
  "custom-first-use": "Custom first use",
  "custom-subsequent-use": "Custom subsequent use",
};

const ERROR_TYPE_OPTIONS = new Map(ERROR_TYPES.map((type) => [type.id, type]));

const SAMPLE = {
  original: "The leadership supported the Commander.",
  expected: "The ldrship sp the Cdr.",
};

function downloadBlob(content: string, type: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

let rowKey = 0;
const nextKey = () => (rowKey += 1);

export function ReviewMode() {
  const { status, dataset } = useDataset();
  const [original, setOriginal] = useState("");
  const [direction, setDirection] = useState<ConversionDirection>("full-to-abbreviation");
  const [filters, setFilters] = useState<Required<ConversionFilters>>({ service: "all", annex: "all", context: "internal-service-writing" });
  const [reportedContext, setReportedContext] = useState<ConversionFeedbackContext>();
  const [sourceFeedbackId, setSourceFeedbackId] = useState("");
  const [actual, setActual] = useState("");
  const [expected, setExpected] = useState("");
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [saved, setSaved] = useState<SavedCorrection[]>([]);
  const [showSaved, setShowSaved] = useState(false);
  const [community, setCommunity] = useState<CommunityEvidence[]>([]);
  const [communityEvents, setCommunityEvents] = useState(0);
  const [agentJob, setAgentJob] = useState<AgentJob | null>(null);
  const [proposals, setProposals] = useState<AgentProposal[]>([]);
  const [proposalsSummary, setProposalsSummary] = useState("");
  const learning = useLearningProfile();
  const learningImportRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(REVIEW_FEEDBACK_STORAGE_KEY);
      if (!raw) return;
      const value = JSON.parse(raw) as Record<string, unknown>;
      const context = readConversionFeedbackContext(value);
      if (!context) return;
      setOriginal(context.input);
      setActual(context.actual);
      setExpected(context.expected);
      setDirection(context.direction);
      setFilters({ service: context.filters.service ?? "all", annex: context.filters.annex ?? "all", context: context.filters.context ?? "internal-service-writing" });
      setReportedContext(context);
      if (typeof value.feedbackId === "string") setSourceFeedbackId(value.feedbackId);
      sessionStorage.removeItem(REVIEW_FEEDBACK_STORAGE_KEY);
    } catch {
      setSaveMessage("The report could not be loaded. Paste its original and outputs to review it.");
    }
  }, []);

  const engine = useMemo(
    () => (dataset ? new ConverterEngine(dataset) : undefined),
    [dataset],
  );

  const analysisDictionary = useMemo<AnalysisDictionary>(
    () => ({
      entries:
        dataset?.entries.map((entry) => {
          const forward = rulesOverlay.forward_overrides[entry.id];
          return {
            id: entry.id,
            full_form: entry.full_form,
            abbreviation: entry.abbreviation,
            // Forward-enabled records use their authorized variant lists.
            match_variants: forward?.variants ?? entry.match_variants,
            ambiguous: entry.ambiguous,
            conversion_enabled: entry.conversion_enabled || Boolean(forward),
          };
        }) ?? [],
      compound_affixes: rulesOverlay.compound_affixes,
      verb_entry_ids: rulesOverlay.verb_entry_ids,
    }),
    [dataset],
  );

  const entriesById = useMemo(() => {
    const map = new Map<string, { full_form: string; abbreviation: string; ambiguous: boolean }>();
    for (const entry of dataset?.entries ?? []) {
      map.set(entry.id, {
        full_form: entry.full_form,
        abbreviation: entry.abbreviation,
        ambiguous: entry.ambiguous,
      });
    }
    return map;
  }, [dataset]);

  const loadSaved = useCallback(async () => {
    try {
      const response = await fetch("/api/corrections", { cache: "no-store" });
      const data = (await response.json()) as { ok: boolean; items?: SavedCorrection[] };
      if (data.ok) setSaved(data.items ?? []);
    } catch {
      // The list is best-effort; saving reports failures explicitly.
    }
  }, []);

  const loadProposals = useCallback(async () => {
    try {
      const response = await fetch("/api/agent/proposals", { cache: "no-store" });
      const data = (await response.json()) as {
        ok: boolean;
        items?: AgentProposal[];
        summary?: { total: number; proposed: number; approved: number; rejected: number };
      };
      if (data.ok) {
        setProposals(data.items ?? []);
        const summary = data.summary;
        if (summary) {
          setProposalsSummary(
            `${summary.total} saved · ${summary.proposed} waiting for you · ${summary.approved} approved · ${summary.rejected} rejected`,
          );
        }
      }
    } catch {
      // Panel is best-effort.
    }
  }, []);

  const startAnalysis = useCallback(async () => {
    try {
      const response = await fetch("/api/agent/analyze", { method: "POST" });
      const data = (await response.json()) as { ok: boolean; jobId?: string; error?: string };
      if (!data.ok || !data.jobId) throw new Error(data.error ?? "The analysis could not be started.");
      const jobId = data.jobId;
      setAgentJob({
        jobId,
        status: "running",
        startedAt: new Date().toISOString(),
        progress: { stage: "starting", detail: "Job submitted" },
        correctionsRead: 0,
        groupsFound: 0,
        proposalsNew: 0,
        proposalsKnown: 0,
        proposalIds: [],
        failures: [],
      });
      // Poll the persisted job record until it settles.
      const poll = window.setInterval(async () => {
        try {
          const jobResponse = await fetch(`/api/agent/analyze?id=${jobId}`, { cache: "no-store" });
          const jobData = (await jobResponse.json()) as { ok: boolean; job?: AgentJob };
          if (jobData.ok && jobData.job) {
            setAgentJob(jobData.job);
            if (jobData.job.status !== "running") {
              window.clearInterval(poll);
              await loadProposals();
            }
          }
        } catch {
          window.clearInterval(poll);
        }
      }, 1000);
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "The analysis could not be started.");
    }
  }, [loadProposals]);

  const reviewProposal = useCallback(
    async (id: string, action: "approve" | "reject") => {
      await fetch("/api/agent/proposals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      await loadProposals();
    },
    [loadProposals],
  );

  function exportLearningProfile() {
    if (!learning.profile) return;
    downloadBlob(learning.exportProfile(), "application/json", "learning-profile.json");
  }

  async function importLearningProfile(file?: File) {
    if (!file) return;
    if (learningImportRef.current) learningImportRef.current.value = "";
    try {
      const { entries } = learning.importProfile(await file.text());
      setSaveMessage(`Learning profile imported — ${entries} preference entries are now stored.`);
    } catch {
      setSaveMessage("The learning profile file could not be read. Expected exported JSON.");
    }
  }

  function resetLearningProfile() {
    if (!window.confirm("Forget ALL learned ambiguity preferences in this browser? This cannot be undone.")) return;
    void learning.resetAll();
  }

  useEffect(() => {
    void loadSaved();
    void loadProposals();
    // Community evidence: what all users' anonymous choices add up to.
    fetch("/api/learning", { cache: "no-store" })
      .then((response) => response.json() as Promise<{ ok: boolean; eventCount?: number; aggregate?: Record<string, CommunityEvidence> }>)
      .then((data) => {
        if (!data.ok) return;
        setCommunityEvents(data.eventCount ?? 0);
        const entries = Object.values(data.aggregate ?? {}).sort((left, right) => {
          const evidence = (entry: CommunityEvidence) =>
            Object.values(entry.choices).reduce((sum, stat) => sum + stat.confirmed + stat.rejected, 0);
          return evidence(right) - evidence(left);
        });
        setCommunity(entries);
      })
      .catch(() => undefined);
  }, [loadSaved, loadProposals]);

  // Suggested corrections regenerate whenever the compared texts change;
  // manual edits survive until then.
  const suggestions = useMemo(() => {
    if (!actual.trim() || !expected.trim()) return [];
    return analyzeCorrections(actual, expected, analysisDictionary);
  }, [actual, expected, analysisDictionary]);

  useEffect(() => {
    setRows(
      suggestions.map((suggestion) => ({
        key: nextKey(),
        source: suggestion.source,
        actual: suggestion.actual,
        expected: suggestion.expected,
        error_type: suggestion.error_type,
        root: suggestion.root ?? "",
        entry_id: suggestion.entry_id ?? "",
        required_rule: suggestion.required_rule ?? "",
      })),
    );
  }, [suggestions]);

  function runEngine() {
    if (!engine || !original.trim()) return;
    const conversion = engine.convert(original, direction, filters);
    setResult(conversion);
    setActual(conversion.convertedText);
    setSaveMessage("");
  }

  function loadSample() {
    setReportedContext(undefined);
    setSourceFeedbackId("");
    setFilters({ service: "navy", annex: "all", context: "internal-service-writing" });
    setOriginal(SAMPLE.original);
    setExpected(SAMPLE.expected);
    setDirection("full-to-abbreviation");
    if (engine) {
      const conversion = engine.convert(SAMPLE.original, "full-to-abbreviation", { service: "navy" });
      setResult(conversion);
      setActual(conversion.convertedText);
    }
    setSaveMessage("");
  }

  function updateRow(key: number, patch: Partial<EditableRow>) {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  function addManualRow() {
    setRows((current) => [
      ...current,
      {
        key: nextKey(),
        source: "",
        actual: "",
        expected: "",
        error_type: "missing_conversion",
        root: "",
        entry_id: "",
        required_rule: "",
      },
    ]);
  }

  async function save(reviewStatus: "approved" | "corrected") {
    if (!original.trim() || !actual.trim() || !expected.trim() || saving) return;
    setSaving(true);
    setSaveMessage("");
    try {
      const response = await fetch("/api/corrections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          input_sentence: original,
          actual_output: actual,
          expected_output: expected,
          corrections: rows.map((row) => ({
            source: row.source,
            actual: row.actual,
            expected: row.expected,
            error_type: row.error_type,
            ...(row.root ? { root: row.root } : {}),
            ...(row.entry_id ? { entry_id: row.entry_id } : {}),
            ...(row.required_rule ? { required_rule: row.required_rule } : {}),
          })),
          review_status: reviewStatus,
          reviewed_by: "human",
          direction,
          filters,
          source_feedback_id: sourceFeedbackId || undefined,
          reported_context: reportedContext,
        }),
      });
      const data = (await response.json()) as { ok: boolean; feedback_id?: string; error?: string };
      if (!data.ok) throw new Error(data.error ?? "The correction could not be stored.");
      setSaveMessage(`Saved as ${data.feedback_id} — review status “${reviewStatus}”.`);
      await loadSaved();
      setShowSaved(true);
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "The correction could not be stored.");
    } finally {
      setSaving(false);
    }
  }

  function exportSaved(format: "json" | "txt") {
    if (format === "json") {
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(saved, null, 2)], { type: "application/json" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "corrections.json";
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      return;
    }
    const lines: string[] = [`Correction records — exported ${new Date().toLocaleString()} (${saved.length} records)`, ""];
    for (const record of saved) {
      lines.push(`[${record.feedback_id}] ${record.review_status} — ${new Date(record.created_at ?? "").toLocaleString()}`);
      lines.push(`Original: ${record.input_sentence}`);
      lines.push(`Actual:   ${record.actual_output}`);
      lines.push(`Expected: ${record.expected_output}`);
      for (const correction of record.corrections) {
        lines.push(`  - ${correction.source}: ${correction.actual} → ${correction.expected} (${correction.error_type}${correction.root ? `, root ${correction.root}` : ""}${correction.entry_id ? `, ${correction.entry_id}` : ""})`);
      }
      lines.push("");
    }
    const url = URL.createObjectURL(
      new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "corrections.txt";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function clearSaved() {
    if (!window.confirm("Delete ALL correction records from the server? This cannot be undone.")) return;
    await fetch("/api/corrections", { method: "DELETE" });
    await loadSaved();
  }

  if (status !== "ready" || !dataset || !engine) {
    return <div className="page-shell"><DatasetStatusPanel /></div>;
  }

  const replacements = result?.replacements ?? [];
  const ambiguities = result?.ambiguities ?? [];
  const ambiguousForward = replacements.filter(
    (replacement) => entriesById.get(replacement.entryId.split("#")[0])?.ambiguous,
  );
  const coveredFlags = new Array<boolean>(original.length + 1).fill(false);
  for (const replacement of replacements) {
    for (let index = replacement.startIndex; index < replacement.endIndex; index += 1) {
      coveredFlags[index] = true;
    }
  }
  const unconverted: string[] = [];
  for (const match of original.matchAll(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)) {
    if (!coveredFlags[match.index ?? 0]) unconverted.push(match[0]);
  }
  const confidenceCounts = replacements.reduce<Record<string, number>>((counts, replacement) => {
    counts[replacement.confidence] = (counts[replacement.confidence] ?? 0) + 1;
    return counts;
  }, {});

  const canSave = Boolean(original.trim() && actual.trim() && expected.trim()) && !saving;

  return (
    <>
      <section className="border-b bg-forest-50 dark:border-white/10 dark:bg-[#111815]">
        <div className="page-shell py-9 sm:py-12">
          <p className="eyebrow flex items-center gap-2"><FlaskConical className="h-4 w-4" /> Review mode</p>
          <h1 className="mt-3 font-display text-3xl font-bold text-forest-950 sm:text-4xl dark:text-white">Correction review</h1>
          <p className="mt-3 max-w-3xl leading-7 text-slate-700 dark:text-stone-300">
            Compare what you wrote, what the app produced, and what it should say. Review each correction before saving. Approved missing-word corrections may add a reviewer-approved extension; other dictionary changes are proposed for approval below.
          </p>
        </div>
      </section>

      <div className="page-shell space-y-8 py-8">
        {reportedContext && <aside role="status" className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm dark:border-blue-900 dark:bg-blue-950/25">Report loaded with its original conversion scope. Dataset at reporting: {reportedContext.datasetVersion ?? "unknown"}. Current dataset: {dataset.schema_version} · {dataset.generated_on}.{reportedContext.note && <p className="mt-2">Reporter note: {reportedContext.note}</p>}</aside>}
        <FilterBar filters={filters} onChange={setFilters} />
        {/* Step 1 — sentence under review */}
        <section className="surface-card p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Step 1</p>
              <h2 className="mt-1 text-xl font-bold">Sentence under review</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={loadSample} className="button-primary !py-2 text-sm">Example</button>
              <button
                type="button"
                onClick={runEngine}
                disabled={!original.trim()}
                className="status-pill border-forest-300 bg-forest-800 px-4 py-2 font-semibold text-white disabled:opacity-50 dark:bg-gold-400 dark:text-forest-950"
              >
                Convert original
              </button>
            </div>
          </div>
          <div className="mt-4 grid gap-4">
            <div>
              <label className="form-label" htmlFor="review-original">Original sentence</label>
              <textarea
                id="review-original"
                className="form-control min-h-20"
                value={original}
                onChange={(event) => setOriginal(event.target.value)}
                placeholder="Paste the sentence to review…"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="form-label" htmlFor="review-direction">Conversion direction</label>
                <select
                  id="review-direction"
                  className="form-control"
                  value={direction}
                  onChange={(event) => setDirection(event.target.value as ConversionDirection)}
                >
                  <option value="full-to-abbreviation">Full form → abbreviation</option>
                  <option value="abbreviation-to-full">Abbreviation → full form</option>
                </select>
              </div>
              <div className="flex items-end">
                <p className="text-sm text-slate-600 dark:text-stone-400">Convert first, then edit the actual output if you captured it elsewhere.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Step 2 — comparison */}
        <section className="surface-card p-6">
          <p className="eyebrow">Step 2</p>
          <h2 className="mt-1 text-xl font-bold">Comparison</h2>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <div>
              <p className="form-label">Original</p>
              <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm dark:bg-white/5">{original || "—"}</p>
            </div>
            <div>
              <label className="form-label" htmlFor="review-actual">Actual output</label>
              <textarea
                id="review-actual"
                className="form-control min-h-24"
                value={actual}
                onChange={(event) => setActual(event.target.value)}
                placeholder="Produced by Convert original, or paste the actual output…"
              />
            </div>
            <div>
              <label className="form-label" htmlFor="review-expected">Expected output</label>
              <textarea
                id="review-expected"
                className="form-control min-h-24"
                value={expected}
                onChange={(event) => setExpected(event.target.value)}
                placeholder="The correct authorized output…"
              />
            </div>
          </div>

          {result && (
            <div className="mt-6 grid gap-5">
              <div>
                <p className="form-label">Replaced words ({replacements.length})</p>
                {replacements.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs uppercase tracking-wider text-slate-500 dark:text-stone-400">
                          <th className="py-2 pr-3">Replaced word</th>
                          <th className="py-2 pr-3">Replacement</th>
                          <th className="py-2 pr-3">Dictionary entry</th>
                          <th className="py-2 pr-3">Rule applied</th>
                          <th className="py-2">Confidence</th>
                        </tr>
                      </thead>
                      <tbody>
                        {replacements.slice(0, 200).map((replacement, index) => {
                          const entry = entriesById.get(replacement.entryId) ?? entriesById.get(replacement.entryId.split("#")[0]);
                          return (
                            <tr key={`${replacement.entryId}-${replacement.startIndex}-${index}`} className="border-b last:border-0">
                              <td className="py-2 pr-3 font-semibold">{replacement.sourceText}</td>
                              <td className="py-2 pr-3">{replacement.replacementText}</td>
                              <td className="py-2 pr-3">
                                {entry ? (
                                  <span>
                                    {entry.full_form} <span className="text-slate-500">→ {entry.abbreviation}</span>{" "}
                                    <code className="text-xs">{replacement.entryId}</code>
                                  </span>
                                ) : (
                                  <code className="text-xs">{replacement.entryId}</code>
                                )}
                              </td>
                              <td className="py-2 pr-3">{RULE_LABELS[replacement.rule] ?? replacement.rule}</td>
                              <td className="py-2">
                                <span className="status-pill">{replacement.confidence}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {replacements.length > 200 && (
                      <p className="mt-2 text-xs text-slate-500">Showing the first 200 of {replacements.length} replacements.</p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-slate-600 dark:text-stone-400">No words were replaced.</p>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="form-label">Left in full (normal words)</p>
                  <p className="text-sm leading-6">
                    {unconverted.length
                      ? unconverted.slice(0, 25).join(", ") + (unconverted.length > 25 ? ` … and ${unconverted.length - 25} more` : "")
                      : "None"}
                  </p>
                </div>
                <div>
                  <p className="form-label">Needs a meaning choice</p>
                  <p className="text-sm leading-6">
                    {ambiguities.length
                      ? ambiguities.map((ambiguity) => `${ambiguity.sourceText} (${ambiguity.choices.length} meanings)`).join(", ")
                      : ambiguousForward.length
                        ? [...new Set(ambiguousForward.map((replacement) => replacement.sourceText))].join(", ")
                        : "None"}
                  </p>
                </div>
                <div>
                  <p className="form-label">Confidence</p>
                  <p className="text-sm leading-6">
                    {replacements.length
                      ? Object.entries(confidenceCounts).map(([level, count]) => `${count} ${level}`).join(", ")
                      : "—"}
                  </p>
                </div>
              </div>

              {result.warnings.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                  <ul className="list-disc space-y-1 pl-5">
                    {result.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Step 3 — problems and corrections */}
        <section className="surface-card p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Step 3</p>
              <h2 className="mt-1 text-xl font-bold">Problems identified</h2>
            </div>
            <button type="button" onClick={addManualRow} className="status-pill border-forest-300 px-4 py-2 font-semibold">
              + Add correction manually
            </button>
          </div>
          {!expected.trim() || !actual.trim() ? (
            <p className="mt-4 text-sm text-slate-600 dark:text-stone-400">
              Fill in the actual and expected outputs — the problems are identified by comparing them.
            </p>
          ) : rows.length ? (
            <div className="mt-4 grid gap-4">
              {rows.map((row, index) => {
                const typeInfo = ERROR_TYPE_OPTIONS.get(row.error_type);
                const entry = row.entry_id ? entriesById.get(row.entry_id.split("#")[0]) : undefined;
                return (
                  <article key={row.key} className="rounded-xl border p-4 dark:border-white/10">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-display text-lg font-bold">{index + 1}. {row.source || "(unnamed)"}</p>
                      <button
                        type="button"
                        onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}
                        className="text-xs font-semibold text-red-700 hover:underline dark:text-red-300"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <div>
                        <label className="form-label" htmlFor={`error-${row.key}`}>Error type</label>
                        <select
                          id={`error-${row.key}`}
                          className="form-control"
                          value={row.error_type}
                          onChange={(event) => updateRow(row.key, { error_type: event.target.value as ErrorTypeId })}
                        >
                          {ERROR_TYPES.map((type) => (
                            <option key={type.id} value={type.id}>{type.cause}</option>
                          ))}
                        </select>
                        {typeInfo && (
                          <p className="mt-1 text-xs text-slate-500 dark:text-stone-400">Fix: {typeInfo.required_change}</p>
                        )}
                      </div>
                      <div>
                        <label className="form-label" htmlFor={`expected-${row.key}`}>Correction</label>
                        <input
                          id={`expected-${row.key}`}
                          className="form-control"
                          value={row.expected}
                          onChange={(event) => updateRow(row.key, { expected: event.target.value })}
                        />
                      </div>
                      <div>
                        <label className="form-label" htmlFor={`rule-${row.key}`}>Cause — rule to apply</label>
                        <select
                          id={`rule-${row.key}`}
                          className="form-control"
                          value={row.required_rule}
                          onChange={(event) => updateRow(row.key, { required_rule: event.target.value })}
                        >
                          <option value="">No specific rule recorded</option>
                          {REQUIRED_RULES.map((rule) => (
                            <option key={rule} value={rule}>{REQUIRED_RULE_CAUSES[rule]}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="form-label" htmlFor={`root-${row.key}`}>Root</label>
                        <input
                          id={`root-${row.key}`}
                          className="form-control"
                          value={row.root}
                          onChange={(event) => updateRow(row.key, { root: event.target.value })}
                        />
                      </div>
                      <div>
                        <label className="form-label" htmlFor={`entry-${row.key}`}>Dictionary entry</label>
                        <input
                          id={`entry-${row.key}`}
                          className="form-control"
                          value={row.entry_id}
                          onChange={(event) => updateRow(row.key, { entry_id: event.target.value })}
                          placeholder="abbr-0000"
                        />
                        {entry && (
                          <p className="mt-1 text-xs text-slate-500 dark:text-stone-400">
                            {entry.full_form} — authorized abbreviation: <strong>{entry.abbreviation}</strong>
                          </p>
                        )}
                      </div>
                      <div>
                        <p className="form-label">Actual</p>
                        <p className="rounded-lg bg-slate-50 p-2.5 text-sm dark:bg-white/5">{row.actual || "—"}</p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-forest-800 dark:text-forest-200">
              <CheckCircle2 className="h-4 w-4" /> No differences found between the actual and expected outputs.
            </p>
          )}
        </section>

        {/* Step 4 — approve or correct */}
        <section className="surface-card p-6">
          <p className="eyebrow">Step 4</p>
          <h2 className="mt-1 text-xl font-bold">Decision</h2>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => save("approved")}
              disabled={!canSave}
              className="button-primary inline-flex items-center gap-2 disabled:opacity-50"
            >
              <BadgeCheck className="h-4 w-4" /> Approve output
            </button>
            <button
              type="button"
              onClick={() => save("corrected")}
              disabled={!canSave}
              className="status-pill inline-flex items-center gap-2 border-forest-300 bg-forest-800 px-4 py-2 font-semibold text-white disabled:opacity-50 dark:bg-gold-400 dark:text-forest-950"
            >
              <Save className="h-4 w-4" /> Save corrections
            </button>
            {saving && <span className="text-sm text-slate-500">Saving…</span>}
          </div>
          {saveMessage && (
            <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-forest-800 dark:text-forest-200">
              <CheckCircle2 className="h-4 w-4" /> {saveMessage}
            </p>
          )}
          {!original.trim() || !actual.trim() || !expected.trim() ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-slate-600 dark:text-stone-400">
              <TriangleAlert className="h-4 w-4" /> Original, actual and expected outputs are all required before saving.
            </p>
          ) : null}
        </section>

        {/* Improvement pipeline: collect, analyze, review — nothing is applied */}
        <section className="surface-card p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow flex items-center gap-2"><FlaskConical className="h-4 w-4" /> Improvement pipeline</p>
              <h2 className="mt-1 text-xl font-bold">Suggestions from your corrections {proposalsSummary ? `— ${proposalsSummary}` : ""}</h2>
              <p className="mt-2 max-w-3xl text-sm text-slate-600 dark:text-stone-300">
                Press the button and the app reads your saved corrections, groups the ones that keep coming back, checks them against your manual, and writes a suggestion. <strong>Nothing changes on its own</strong> — approving a suggestion only marks it as ready; applying it to the dictionary is a separate step you ask for.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => void startAnalysis()} className="button-primary !py-2 text-sm">
                {agentJob?.status === "running" ? "Checking…" : "Check my corrections"}
              </button>
              <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-white/10" aria-hidden="true" />
              <span className="text-xs font-semibold text-slate-500 dark:text-stone-400">
                Personal learning profile: {learning.profile ? Object.keys(learning.profile).length : 0} entries
              </span>
              <button type="button" onClick={exportLearningProfile} disabled={!learning.profile} className="button-ghost !px-3 !py-1.5 text-xs disabled:opacity-50">Export</button>
              <button type="button" onClick={() => learningImportRef.current?.click()} disabled={!learning.profile} className="button-ghost !px-3 !py-1.5 text-xs disabled:opacity-50">Import</button>
              <button type="button" onClick={resetLearningProfile} disabled={!learning.profile || Object.keys(learning.profile).length === 0} className="button-ghost !px-3 !py-1.5 text-xs text-red-700 disabled:opacity-50 dark:text-red-300">Reset all</button>
              <input ref={learningImportRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => void importLearningProfile(event.target.files?.[0])} />
            </div>
          </div>

          {agentJob && (
            <div className="mt-4 rounded-xl border p-4 text-sm dark:border-white/10">
              <p className="font-semibold">
                {agentJob.status === "running"
                  ? "Checking your corrections…"
                  : agentJob.status === "done"
                    ? "Done."
                    : agentJob.status === "failed"
                      ? "Failed."
                      : "Stopped (the app restarted mid-check)."}
              </p>
              <p className="mt-1 text-slate-600 dark:text-stone-400">{agentJob.progress.detail}</p>
              {agentJob.failures.length > 0 && (
                <p className="mt-1 text-sm text-red-700 dark:text-red-300">{agentJob.failures.join("; ")}</p>
              )}
            </div>
          )}

          {proposals.length ? (
            <div className="mt-4 grid gap-4">
              {proposals.map((proposal) => (
                <article key={proposal.id} className="rounded-xl border p-4 dark:border-white/10">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-bold">
                      {proposal.id} — {proposal.rule === "correct_entry" ? "Fix a dictionary entry" : "Teach a new abbreviation"}
                      <span className="ml-2 text-sm font-normal text-slate-500 dark:text-stone-400">({proposal.pattern})</span>
                    </p>
                    <span className="status-pill">
                      {proposal.reviewStatus === "proposed" ? "waiting for you" : proposal.reviewStatus}
                    </span>
                  </div>
                  <p className="mt-2 text-sm">
                    <strong>Now:</strong> {proposal.current_full_form ?? proposal.input} → {proposal.output}
                  </p>
                  {proposal.suggested_full_form && proposal.suggested_full_form !== proposal.current_full_form && (
                    <p className="text-sm">
                      <strong>You suggest:</strong> {proposal.suggested_full_form} → {proposal.output}
                    </p>
                  )}
                  <p className="mt-1 text-sm text-slate-600 dark:text-stone-300">{proposal.reason}</p>
                  {proposal.evidence.length > 0 && (
                    <div className="mt-2 rounded-lg bg-slate-50 p-3 text-xs dark:bg-white/5">
                      <p className="form-label">From your manual — check these lines</p>
                      <ul className="space-y-1">
                        {proposal.evidence.map((item, index) => (
                          <li key={index}>
                            <code>{item.manual}.txt:{item.line}</code> — “{item.quotation}”
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <p className="mt-2 text-xs text-slate-500 dark:text-stone-400">
                    Safety checks: {proposal.validation.entryExists ? "entry exists" : "new entry"} · {proposal.validation.notDuplicate ? "not a duplicate" : "DUPLICATE — do not approve"} · {proposal.validation.noConflict ? "no conflicts" : "CONFLICT — do not approve"} · {proposal.validation.manualSupport ? "manual mentions it" : "not in the manual"}
                    {proposal.feedback_ids.length ? ` · from ${proposal.feedback_ids.join(", ")}` : ""}
                  </p>
                  {proposal.reviewStatus === "proposed" && (
                    <div className="mt-3 flex gap-2">
                      <button type="button" onClick={() => void reviewProposal(proposal.id, "approve")} className="status-pill border-forest-300 bg-forest-800 px-4 py-2 font-semibold text-white dark:bg-gold-400 dark:text-forest-950">
                        Approve — ready to apply later
                      </button>
                      <button type="button" onClick={() => void reviewProposal(proposal.id, "reject")} className="status-pill border-red-200 px-4 py-2 font-semibold text-red-700 dark:text-red-300">
                        Reject
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-600 dark:text-stone-400">No suggestions yet. After you save a few corrections, press “Check my corrections”.</p>
          )}
        </section>

        {/* Community learning evidence */}
        <section className="surface-card p-6">
          <p className="eyebrow flex items-center gap-2"><Sparkles className="h-4 w-4" /> From all users</p>
          <h2 className="mt-1 text-xl font-bold">What other users chose ({communityEvents} shared choices)</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-stone-400">
            Aggregated ambiguity choices from users who opted in (each contributor counted at most three times per choice; no document text is shared). Community evidence is a suggestion only — it changes output for all users when you approve it by promoting the mapping into the overrides layer as a versioned dictionary update. Outputs improve as reviewed evidence grows.
          </p>
          {community.length ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wider text-slate-500 dark:text-stone-400">
                    <th className="py-2 pr-3">Abbreviation</th>
                    <th className="py-2 pr-3">Context</th>
                    <th className="py-2 pr-3">Learned choices (confirmed / rejected)</th>
                  </tr>
                </thead>
                <tbody>
                  {community.slice(0, 20).map((entry) => (
                    <tr key={`${entry.abbreviation}-${entry.service}-${entry.writingContext}-${entry.direction}`} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-semibold">{entry.abbreviation}</td>
                      <td className="py-2 pr-3 text-xs">{entry.service} · {entry.writingContext.replaceAll("_", " ")} · {entry.direction}</td>
                      <td className="py-2 pr-3">
                        {Object.entries(entry.choices).map(([choiceId, stat]) => (
                          <span key={choiceId} className="mr-3 inline-block">
                            {choiceId.split("::")[1] ?? choiceId} <strong>{stat.confirmed}</strong>/{stat.rejected}
                          </span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {community.length > 20 && <p className="mt-2 text-xs text-slate-500">Showing the 20 entries with the most evidence of {community.length}.</p>}
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-600 dark:text-stone-400">No shared choices yet.</p>
          )}
        </section>

        {/* Saved correction records */}
        <section className="surface-card p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow flex items-center gap-2"><ClipboardList className="h-4 w-4" /> Server records</p>
              <h2 className="mt-1 text-xl font-bold">Saved correction records ({saved.length})</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setShowSaved((open) => !open)} className="status-pill border-forest-300 px-4 py-2 font-semibold">
                {showSaved ? "Hide" : "Show"}
              </button>
              <button type="button" onClick={() => exportSaved("json")} disabled={!saved.length} className="status-pill inline-flex items-center gap-1.5 border-forest-300 px-4 py-2 font-semibold disabled:opacity-50">
                <Download className="h-3.5 w-3.5" /> JSON
              </button>
              <button type="button" onClick={() => exportSaved("txt")} disabled={!saved.length} className="status-pill inline-flex items-center gap-1.5 border-forest-300 px-4 py-2 font-semibold disabled:opacity-50">
                <Download className="h-3.5 w-3.5" /> TXT
              </button>
              <button type="button" onClick={clearSaved} disabled={!saved.length} className="status-pill inline-flex items-center gap-1.5 border-red-200 px-4 py-2 font-semibold text-red-700 disabled:opacity-50 dark:text-red-300">
                <Trash2 className="h-3.5 w-3.5" /> Clear all
              </button>
            </div>
          </div>
          {showSaved && (
            <div className="mt-4 grid gap-4">
              {saved.map((record) => (
                <article key={record.feedback_id} className="rounded-xl border p-4 dark:border-white/10">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-bold">{record.feedback_id}</p>
                    <span className="status-pill">{record.review_status}</span>
                  </div>
                  <p className="mt-2 text-sm"><strong>Original:</strong> {record.input_sentence}</p>
                  <p className="text-sm"><strong>Actual:</strong> {record.actual_output}</p>
                  <p className="text-sm"><strong>Expected:</strong> {record.expected_output}</p>
                  {record.corrections.map((correction, index) => (
                    <p key={index} className="mt-1 text-sm text-slate-600 dark:text-stone-400">
                      — {correction.source}: {correction.actual || "(unchanged)"} → {correction.expected || "(removed)"} [{correction.error_type}
                      {correction.root ? `, root ${correction.root}` : ""}
                      {correction.entry_id ? `, ${correction.entry_id}` : ""}
                      {correction.required_rule ? `, rule ${correction.required_rule}` : ""}]
                    </p>
                  ))}
                </article>
              ))}
              {!saved.length && <p className="text-sm text-slate-600 dark:text-stone-400">No corrections recorded yet.</p>}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
