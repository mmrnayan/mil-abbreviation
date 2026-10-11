import type { WordModel } from "./morphology";
import { generatedConfidence, verbBaseCandidates } from "./morphology";
import type { GeneratedMatch } from "./exactExceptions";

/**
 * Paragraph 0241b(4) verb rule: if the present indefinite form of a verb is
 * authorized, the same abbreviation is used for all its ordinary derivatives
 * and tenses (support, supported, supporting, supporter, supportive -> sp).
 * A recognized prefix on the verb keeps its letters (demobilize -> demob).
 * The abbreviation of a verb never takes a plural "s".
 */
export function resolveVerbDerivative(
  word: string,
  model: WordModel,
  irregularForms: Record<string, string>,
): GeneratedMatch | undefined {
  const bases = verbBaseCandidates(word, irregularForms);

  for (const base of bases) {
    for (const entry of model.entriesForWord(base)) {
      if (!model.isAllowed(entry) || !model.isVerb(entry.id) ||
          !model.permitsRule(entry.id, "verb_forms") || model.isExactOnly(entry.id)) continue;
      return {
        entry,
        replacementText: entry.abbreviation,
        rule: "verb-derivative",
        normalizedRoot: base,
        confidence: generatedConfidence(entry),
      };
    }
    // Prefer an authorized complete root over splitting its prefix.
    const prefixed = prefixedVerbRoot(base, model);
    if (prefixed) return prefixed;
  }
  return undefined;
}

function prefixedVerbRoot(
  base: string,
  model: WordModel,
): GeneratedMatch | undefined {
  const prefixes = [...model.prefixes].sort(
    (left, right) => right.length - left.length,
  );
  for (const prefix of prefixes) {
    if (!base.startsWith(prefix)) continue;
    const rest = base.slice(prefix.length);
    if (rest.length < 3) continue;
    for (const entry of model.entriesForWord(rest)) {
      if (!model.isAllowed(entry) || !model.isVerb(entry.id) ||
          !model.permitsRule(entry.id, "verb_forms") ||
          !model.permitsRule(entry.id, "compound_prefix") || model.isExactOnly(entry.id)) continue;
      return {
        entry,
        replacementText: `${prefix}${entry.abbreviation}`,
        rule: "verb-derivative",
        normalizedRoot: base,
        confidence: generatedConfidence(entry),
      };
    }
  }
  return undefined;
}
