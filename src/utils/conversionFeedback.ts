import type { ConversionDirection, ConversionFilters, ConversionResult, ReplacementRecord } from "@/engine/types";
import { APP_VERSION } from "@/version";
import { mapSelection, sentenceRange, type ReportSelection } from "./reportSelection";
import type { ReportDiagnosis } from "./reportDiagnosis";

export const REVIEW_FEEDBACK_STORAGE_KEY = "sac:review-feedback:v1";

export interface ConversionFeedbackContext {
  format: "conversion-feedback-v1" | "conversion-feedback-v2";
  input: string;
  actual: string;
  expected: string;
  direction: ConversionDirection;
  filters: ConversionFilters;
  datasetVersion?: string;
  replacementEvidence: Pick<ReplacementRecord, "entryId" | "sourceText" | "replacementText" | "rule" | "normalizedRoot" | "confidence" | "startIndex" | "endIndex">[];
  note?: string;
  appVersion?: string;
  selected?: ReportSelection;
  selectedText?: string;
  meaningChoices?: { entryId: string; sourceText: string; resolution: string }[];
  diagnosis?: ReportDiagnosis;
  suggestedForm?: string;
}

export interface ConversionFeedbackSeed { result: ConversionResult; datasetVersion?: string; selection?: ReportSelection }

const SERVICES = ["all", "tri-service", "army", "navy", "air-force", "other"];
const CONTEXTS = ["internal-service-writing", "signal-message", "civilian-external-correspondence", "military-qualification", "national-force-designation", "operational-writing", "operational-heading", "formal-letter", "demi-official-letter", "commanded-letter", "service-paper", "air-force-operational-paper", "allied-forces-correspondence", "foreign-correspondence", "paramilitary-operational-writing", "departmental-title", "personnel-line", "address-box"];

export function sanitizeFeedbackFilters(value: unknown): ConversionFilters {
  const filters = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    ...(typeof filters.service === "string" && SERVICES.includes(filters.service) ? { service: filters.service as ConversionFilters["service"] } : {}),
    ...(typeof filters.annex === "string" && /^(?:all|[A-H])$/u.test(filters.annex) ? { annex: filters.annex } : {}),
    ...(typeof filters.context === "string" && CONTEXTS.includes(filters.context) ? { context: filters.context as ConversionFilters["context"] } : {}),
  };
}

export function buildConversionFeedback(seed: ConversionFeedbackSeed, expected = "", note = "") {
  const selected = seed.selection ?? mapSelection(seed.result, { start: 0, end: seed.result.originalText.length }, "source");
  const sentence = sentenceRange(seed.result.originalText, selected.source);
  const outputSentence = mapSelection(seed.result, sentence, "source").output;
  const context: ConversionFeedbackContext = {
    format: "conversion-feedback-v2",
    input: seed.result.originalText.slice(sentence.start, sentence.end),
    actual: seed.result.convertedText.slice(outputSentence.start, outputSentence.end),
    expected: expected.trim() ? seed.result.convertedText.slice(outputSentence.start, selected.output.start) + expected.trim() + seed.result.convertedText.slice(selected.output.end, outputSentence.end) : "",
    ...(expected.trim() ? { suggestedForm: expected.trim() } : {}),
    appVersion: APP_VERSION,
    selected: {
      source: { start: selected.source.start - sentence.start, end: selected.source.end - sentence.start },
      output: { start: selected.output.start - outputSentence.start, end: selected.output.end - outputSentence.start },
    },
    selectedText: seed.result.originalText.slice(selected.source.start, selected.source.end),
    direction: seed.result.direction,
    filters: sanitizeFeedbackFilters(seed.result.appliedFilters),
    datasetVersion: seed.datasetVersion,
    meaningChoices: seed.result.replacements.filter((r) => r.startIndex >= sentence.start && r.endIndex <= sentence.end && ["user-selected", "learned"].includes(r.resolution)).map((r) => ({ entryId: r.entryId, sourceText: r.sourceText, resolution: r.resolution })),
    replacementEvidence: seed.result.replacements.filter((r) => r.startIndex >= sentence.start && r.endIndex <= sentence.end).map((replacement) => ({
      entryId: replacement.entryId,
      sourceText: replacement.sourceText,
      replacementText: replacement.replacementText,
      rule: replacement.rule,
      normalizedRoot: replacement.normalizedRoot,
      confidence: replacement.confidence,
      startIndex: replacement.startIndex - sentence.start,
      endIndex: replacement.endIndex - sentence.start,
    })),
    ...(note.trim() ? { note: note.trim() } : {}),
  };
  return {
    category: "incorrect-conversion",
    message: note.trim() || "A selected word or phrase was reported for review.",
    context,
  };
}

/** Validate external/stored report data before rendering or staging it for review. */
export function readConversionFeedbackContext(value: unknown): ConversionFeedbackContext | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const context = value as Record<string, unknown>;
  const actual = context.actual ?? context.actualOutput;
  const expected = context.expected ?? context.expectedOutput ?? "";
  if (typeof context.input !== "string" || typeof actual !== "string" || typeof expected !== "string") return undefined;
  if (context.direction !== "full-to-abbreviation" && context.direction !== "abbreviation-to-full") return undefined;
  const evidence = Array.isArray(context.replacementEvidence) ? context.replacementEvidence : [];
  return {
    format: context.format === "conversion-feedback-v2" ? "conversion-feedback-v2" : "conversion-feedback-v1",
    input: context.input,
    actual,
    expected,
    direction: context.direction,
    filters: sanitizeFeedbackFilters(context.filters),
    ...(typeof context.datasetVersion === "string" ? { datasetVersion: context.datasetVersion } : {}),
    ...(typeof context.note === "string" ? { note: context.note } : {}),
    ...(typeof context.appVersion === "string" ? { appVersion: context.appVersion } : {}),
    ...(typeof context.selectedText === "string" ? { selectedText: context.selectedText } : {}),
    ...(typeof context.suggestedForm === "string" ? { suggestedForm: context.suggestedForm } : {}),
    ...(validSelection(context.selected, context.input.length, actual.length) ? { selected: context.selected as ReportSelection } : {}),
    ...(Array.isArray(context.meaningChoices) ? { meaningChoices: context.meaningChoices.filter((r) => r && typeof r.entryId === "string" && typeof r.sourceText === "string" && typeof r.resolution === "string") } : {}),
    ...(context.diagnosis && typeof context.diagnosis === "object" ? { diagnosis: context.diagnosis as ReportDiagnosis } : {}),
    replacementEvidence: evidence.filter((item): item is ConversionFeedbackContext["replacementEvidence"][number] => {
      if (!item || typeof item !== "object") return false;
      const row = item as Record<string, unknown>;
      return ["entryId", "sourceText", "replacementText", "rule", "confidence"].every((field) => typeof row[field] === "string") &&
        typeof row.startIndex === "number" && Number.isFinite(row.startIndex) &&
        typeof row.endIndex === "number" && Number.isFinite(row.endIndex);
    }),
  };
}

function validSelection(value: unknown, sourceLength: number, outputLength: number): boolean {
  if (!value || typeof value !== "object") return false;
  const row = value as ReportSelection;
  return [[row.source, sourceLength], [row.output, outputLength]].every(([range, length]) => {
    const r = range as ReportSelection["source"];
    return r && Number.isInteger(r.start) && Number.isInteger(r.end) && r.start >= 0 && r.end > r.start && r.end <= (length as number);
  });
}
