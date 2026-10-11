import type { WordModel } from "./morphology";
import { generatedConfidence } from "./morphology";
import type { GeneratedMatch } from "./exactExceptions";

/**
 * Paragraph 0241b(1) composite noun/verb rule. A composite word may be
 * abbreviated by abbreviating the authorized part and preserving the rest:
 *
 * - authorized root plus recognized suffix: leadership -> ldrship
 * - recognized prefix plus authorized verb root: demobilize -> demob
 * - common head word plus authorized root: minefield -> minefd
 *
 * Arbitrary substring replacement is not performed: a valid morpheme boundary
 * must be identified through the affix lists or the approved head-word list.
 * Generated compounds may be unclear, so they are flagged for review.
 */
export function resolveCompound(
  word: string,
  model: WordModel,
): GeneratedMatch | undefined {
  const w = word.toLocaleLowerCase("en");
  if (w.length < 6) return undefined;

  const suffixMatch = rootWithSuffix(w, model);
  if (suffixMatch) return suffixMatch;

  const prefixMatch = prefixWithRoot(w, model);
  if (prefixMatch) return prefixMatch;

  return headWordWithRoot(word, w, model);
}

function rootWithSuffix(w: string, model: WordModel): GeneratedMatch | undefined {
  const suffixes = [...model.suffixes].sort(
    (left, right) => right.length - left.length,
  );
  for (const suffix of suffixes) {
    if (!w.endsWith(suffix)) continue;
    const root = w.slice(0, -suffix.length);
    if (root.length < 3) continue;
    for (const entry of model.entriesForWord(root)) {
      if (!model.isAllowed(entry) || model.isExactOnly(entry.id) ||
          !model.permitsRule(entry.id, "compound_suffix")) continue;
      return {
        entry,
        replacementText: `${entry.abbreviation}${suffix}`,
        rule: "compound-suffix",
        normalizedRoot: root,
        confidence: generatedConfidence(entry, "medium"),
      };
    }
  }
  return undefined;
}

function prefixWithRoot(w: string, model: WordModel): GeneratedMatch | undefined {
  const prefixes = [...model.prefixes].sort(
    (left, right) => right.length - left.length,
  );
  for (const prefix of prefixes) {
    if (!w.startsWith(prefix)) continue;
    const root = w.slice(prefix.length);
    if (root.length < 3) continue;
    for (const entry of model.entriesForWord(root)) {
      if (!model.isAllowed(entry) ||
          !model.permitsRule(entry.id, "compound_prefix") || model.isExactOnly(entry.id)) continue;
      return {
        entry,
        replacementText: `${prefix}${entry.abbreviation}`,
        rule: "compound-prefix",
        normalizedRoot: w,
        confidence: generatedConfidence(entry, "medium"),
      };
    }
  }
  return undefined;
}

function headWordWithRoot(
  originalWord: string,
  w: string,
  model: WordModel,
): GeneratedMatch | undefined {
  // Longest authorized root first: scan the split point from the left.
  for (let split = 3; split <= w.length - 3; split += 1) {
    const head = w.slice(0, split);
    if (!model.headWords.has(head)) continue;
    const root = w.slice(split);
    for (const entry of model.entriesForWord(root)) {
      if (!model.isAllowed(entry) || model.isExactOnly(entry.id) ||
          !model.permitsRule(entry.id, "compound_suffix")) continue;
      const headAsTyped = originalWord.slice(0, split);
      return {
        entry,
        replacementText: `${headAsTyped}${entry.abbreviation}`,
        rule: "compound-suffix",
        normalizedRoot: root,
        confidence: "needs-review",
      };
    }
  }
  return undefined;
}
