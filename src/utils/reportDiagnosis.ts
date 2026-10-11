import { ConverterEngine } from "@/engine/converter";
import type { AbbreviationDataset, ConversionResult } from "@/engine/types";
import type { AbbreviationRulesOverlay } from "@/engine/rulesOverlay";
import type { ConversionFeedbackContext } from "./conversionFeedback";

export interface DiagnosisCheck {
  label: string; input: string; output: string;
  matches: { entryId: string; rule: string; root?: string; confidence: string }[];
  warnings: string[];
}
export interface ReportDiagnosis {
  version: string; root: string; pattern: string;
  status: "Needs source review" | "Approved match available";
  checks: DiagnosisCheck[]; versionComparison: string;
}

export function diagnoseReport(context: ConversionFeedbackContext, dataset: AbbreviationDataset, overlay: AbbreviationRulesOverlay, version: string): ReportDiagnosis {
  const engine = new ConverterEngine(dataset);
  const text = context.selectedText || context.input;
  const targeted = context.replacementEvidence.find((r) => !context.selected || (r.startIndex < context.selected.source.end && r.endIndex > context.selected.source.start));
  const isolated = engine.convert(text, context.direction, context.filters);
  const broadWord = engine.convert(text, context.direction, { ...context.filters, service: "all", annex: "all" });
  const root = targeted?.normalizedRoot ?? isolated.replacements[0]?.normalizedRoot ?? broadWord.replacements[0]?.normalizedRoot ?? text;
  const matchedId = targeted?.entryId ?? isolated.replacements[0]?.entryId ?? broadWord.replacements[0]?.entryId;
  const entry = dataset.entries.find((e) => e.id === matchedId) ?? dataset.entries.find((e) => e.full_form.toLowerCase() === root.toLowerCase());
  const checks: DiagnosisCheck[] = [];
  const add = (label: string, input: string, result: ConversionResult) => checks.push({
    label, input, output: result.convertedText,
    matches: [...result.replacements.map((r) => ({ entryId: r.entryId, rule: r.rule, ...(r.normalizedRoot ? { root: r.normalizedRoot } : {}), confidence: r.confidence })), ...result.ambiguities.flatMap((a) => a.choices.map((c) => ({ entryId: c.entryId, rule: `Ambiguous meaning: ${c.meaning}`, confidence: c.confidence })))], warnings: result.warnings,
  });
  add("Selected word alone", text, isolated);
  const resolutions: Record<string, string> = {};
  for (const evidence of context.replacementEvidence) {
    if (context.meaningChoices?.some((choice) => choice.entryId === evidence.entryId)) {
      const candidates = engine.convert(context.input, context.direction, context.filters).ambiguities;
      const options = candidates.find((a) => a.startIndex === evidence.startIndex)?.choices;
      const choice = options?.find((c) => c.entryId === evidence.entryId && c.meaning.toLowerCase() === evidence.replacementText.toLowerCase()) ?? options?.find((c) => c.entryId === evidence.entryId);
      if (choice) resolutions[`occurrence:${evidence.startIndex}`] = choice.id;
    }
  }
  const sentence = engine.convert(context.input, context.direction, { ...context.filters, resolutions });
  add("Word in reported sentence", context.input, sentence);
  const forms = entry ? [...new Set([entry.full_form, ...entry.match_variants, ...(overlay.entry_variants?.[entry.id] ?? [])])].filter((f) => f !== text).slice(0, 12) : [];
  for (const form of forms) add("Approved form of the same root", form, engine.convert(form, "full-to-abbreviation", context.filters));
  add("Broader service and annex filters", context.input, engine.convert(context.input, context.direction, { ...context.filters, service: "all", annex: "all", resolutions }));
  const changed = sentence.convertedText !== context.actual;
  const pattern = isolated.replacements.length ? (targeted?.rule ?? isolated.replacements[0].rule) : broadWord.replacements.length ? "scope-excluded" : isolated.ambiguities.length ? "ambiguous" : "unmatched";
  return {
    version, root, pattern,
    status: entry?.quality.confidence === "high" && (isolated.replacements.some((r) => r.confidence === "high") || broadWord.replacements.some((r) => r.confidence === "high") || isolated.ambiguities.some((a) => a.choices.some((c) => c.entryId === entry.id && c.confidence === "high"))) ? "Approved match available" : "Needs source review",
    checks,
    versionComparison: context.datasetVersion === version
      ? `Same dataset version. Recomputed output ${changed ? "differs from the report; inspect meaning choices and evidence" : "matches the report"}.`
      : `${context.datasetVersion ?? "Unknown reported version"} → ${version}. ${changed ? "Output changed; verify against the manual before marking fixed." : "The reported output is still reproduced."}`,
  };
}

export function reportGroupKey(context: ConversionFeedbackContext, diagnosis?: ReportDiagnosis): string {
  return [diagnosis?.root ?? context.selectedText ?? context.input, diagnosis?.pattern ?? "legacy", context.datasetVersion ?? "unknown"].join("|").toLowerCase();
}
