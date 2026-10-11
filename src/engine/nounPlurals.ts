import type { WordModel } from "./morphology";
import { generatedConfidence, singularCandidates } from "./morphology";
import type { GeneratedMatch } from "./exactExceptions";

/**
 * Paragraph 0241b(3) plural rule. An "s" may be added only to the abbreviation
 * of a noun, always at the end (GOCs). Abbreviations that already cover both
 * singular and plural, and measurement abbreviations, remain unaltered.
 * Verb abbreviations never take an "s" (fol covers follow and follows).
 */
export function resolveNounPlural(
  word: string,
  model: WordModel,
  irregularForms: Record<string, string>,
): GeneratedMatch | undefined {
  const singulars = singularCandidates(word, irregularForms);

  for (const singular of singulars) {
    for (const entry of model.entriesForWord(singular)) {
      if (!model.isAllowed(entry) || model.isExactOnly(entry.id)) continue;

    if (model.isVerb(entry.id) && model.permitsRule(entry.id, "verb_forms")) {
      // First and third person singular of a verb are identical (follow, follows).
      return {
        entry,
        replacementText: entry.abbreviation,
        rule: "verb-derivative",
        normalizedRoot: singular,
        confidence: generatedConfidence(entry),
      };
    }

    if (!model.permitsRule(entry.id, "noun_plural") &&
        !model.permitsRule(entry.id, "plural_invariant")) continue;

    if (model.isPluralInvariant(entry.id) || model.isMeasurement(entry.id)) {
      return {
        entry,
        replacementText: entry.abbreviation,
        rule: "noun-plural",
        normalizedRoot: singular,
        confidence: generatedConfidence(entry),
      };
    }

    return {
      entry,
      replacementText: `${entry.abbreviation}s`,
      rule: "noun-plural",
      normalizedRoot: singular,
      confidence: generatedConfidence(entry),
    };
    }
  }
  return undefined;
}
