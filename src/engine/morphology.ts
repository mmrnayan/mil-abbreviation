import { normalizeForMatch } from "./phraseTrie";
import type { AbbreviationEntry } from "./types";

/**
 * Controlled English morphological reduction. These helpers generate candidate
 * base forms only; the caller validates every candidate against the authorized
 * dataset before any replacement is produced. There is no unrestricted stemming.
 */

/** Minimum length of a word or base form considered by the morphology rules. */
export const MINIMUM_WORD_LENGTH = 4;

const VOWELS = new Set(["a", "e", "i", "o", "u"]);

export function isPlainWord(value: string): boolean {
  return /^[A-Za-z]+$/.test(value) && value.length >= MINIMUM_WORD_LENGTH;
}

/** Everything the 0241 rule modules need to validate a generated form. */
export interface WordModel {
  /** Entry authorized for this exact single word (case-insensitive), if any. */
  entryForWord(word: string): AbbreviationEntry | undefined;
  entriesForWord(word: string): AbbreviationEntry[];
  permitsRule(entryId: string, rule: string): boolean;
  isVerb(entryId: string): boolean;
  isExactOnly(entryId: string): boolean;
  isPluralInvariant(entryId: string): boolean;
  isMeasurement(entryId: string): boolean;
  /** Irregular inflected form to base form, from the rules overlay. */
  irregularBaseOf(word: string): string | undefined;
  isAllowed(entry: AbbreviationEntry): boolean;
  prefixes: string[];
  suffixes: string[];
  headWords: ReadonlySet<string>;
}

/** Generated forms retain the confidence of their source dictionary record. */
export function generatedConfidence(
  entry: AbbreviationEntry,
  confidence: "high" | "medium" | "needs-review" = "high",
): "high" | "medium" | "needs-review" {
  if (confidence === "needs-review") return confidence;
  if (entry.quality.confidence === "high") return confidence;
  return entry.quality.confidence === "medium" ? "medium" : "needs-review";
}

function deduplicate(values: string[]): string[] {
  return [...new Set(values)];
}

/** Undo consonant doubling: "planned" -> "plan", "running" -> "run". */
function undoubleStem(stem: string): string[] {
  const lastTwo = stem.slice(-2);
  if (
    stem.length >= MINIMUM_WORD_LENGTH &&
    lastTwo[0] === lastTwo[1] && !VOWELS.has(lastTwo[0])
  ) {
    return [stem.slice(0, -1)];
  }
  return [];
}

/**
 * Candidate base (present indefinite) forms of an inflected verb. Candidates
 * are lowercase and must be validated against the authorized verb set. Two
 * reduction levels are applied so agent plurals such as "supporters" reduce
 * through "supporter" to "support".
 */
export function verbBaseCandidates(
  word: string,
  irregularForms: Record<string, string>,
): string[] {
  const w = word.toLocaleLowerCase("en");
  if (!isPlainWord(w)) return [];

  const irregular = irregularForms[w];
  if (irregular) return [irregular.toLocaleLowerCase("en")];

  const levelOne = reduceVerbOnce(w);
  const levelTwo = levelOne.flatMap((candidate) =>
    reduceVerbOnce(candidate),
  );
  return deduplicate([w, ...levelOne, ...levelTwo]).filter(
    (candidate) => candidate !== w && candidate.length >= MINIMUM_WORD_LENGTH,
  );
}

function reduceVerbOnce(word: string): string[] {
  const candidates: string[] = [];

  // Third-person singular: follows -> follow, watches -> watch, carries -> carry.
  if (word.endsWith("ies") && word.length > MINIMUM_WORD_LENGTH) {
    candidates.push(`${word.slice(0, -3)}y`);
  } else if (
    word.endsWith("es") &&
    word.length > MINIMUM_WORD_LENGTH &&
    /(ch|sh|ss|x|z)es$/u.test(word)
  ) {
    // Both analyses are needed: watches -> watch, authorizes -> authorize.
    candidates.push(word.slice(0, -1), word.slice(0, -2));
  } else if (
    word.endsWith("s") &&
    !word.endsWith("ss") &&
    word.length > MINIMUM_WORD_LENGTH
  ) {
    candidates.push(word.slice(0, -1));
  }

  // Past tense and past participle: supported -> support, allocated -> allocate.
  if (word.endsWith("ied") && word.length > MINIMUM_WORD_LENGTH) {
    candidates.push(`${word.slice(0, -3)}y`);
  } else if (word.endsWith("ed") && word.length > MINIMUM_WORD_LENGTH) {
    const stem = word.slice(0, -2);
    candidates.push(stem, `${stem}e`, ...undoubleStem(stem));
  } else if (
    word.endsWith("d") &&
    word.length > MINIMUM_WORD_LENGTH &&
    VOWELS.has(word[word.length - 2] ?? "")
  ) {
    // e-verbs: camouflaged -> camouflage, mobilized -> mobilize.
    candidates.push(word.slice(0, -1));
  }

  // Present participle: supporting -> support, coming -> come, planning -> plan.
  if (word.endsWith("ing") && word.length > MINIMUM_WORD_LENGTH + 1) {
    const stem = word.slice(0, -3);
    candidates.push(stem, `${stem}e`, ...undoubleStem(stem));
  }

  // Agent noun and adjectival derivative: supporter -> support, supportive -> support.
  if (word.endsWith("ers") && word.length > MINIMUM_WORD_LENGTH + 1) {
    const stem = word.slice(0, -3);
    candidates.push(stem, `${stem}e`, ...undoubleStem(stem));
  } else if (word.endsWith("er") && word.length > MINIMUM_WORD_LENGTH) {
    const stem = word.slice(0, -2);
    candidates.push(stem, `${stem}e`, ...undoubleStem(stem));
  }

  if (word.endsWith("ier") || word.endsWith("iers")) {
    candidates.push(`${word.slice(0, word.endsWith("iers") ? -4 : -3)}y`);
  }
  if (word.endsWith("or") || word.endsWith("ors")) {
    const stem = word.slice(0, word.endsWith("ors") ? -3 : -2);
    candidates.push(stem, `${stem}e`);
  }

  // Adjectival derivative: supportive -> support, collective -> collect.
  if (word.endsWith("ive") && word.length > MINIMUM_WORD_LENGTH) {
    candidates.push(word.slice(0, -3), `${word.slice(0, -3)}e`);
  }

  // Nominal derivative of a verb: information -> inform.
  if (word.endsWith("ation") && word.length - 5 >= MINIMUM_WORD_LENGTH) {
    const stem = word.slice(0, -5);
    candidates.push(stem, `${stem}e`, `${stem}ate`);
  }
  if (word.endsWith("ion")) {
    const stem = word.slice(0, -3);
    candidates.push(stem, `${stem}e`);
  }
  if (word.endsWith("ment")) candidates.push(word.slice(0, -4));
  if (word.endsWith("ly")) candidates.push(word.slice(0, -2));

  return deduplicate(
    candidates.filter((candidate) => candidate.length >= MINIMUM_WORD_LENGTH),
  );
}

/**
 * Candidate singular forms of a plural noun. Candidates are lowercase and must
 * be validated against the authorized dataset.
 */
export function singularCandidates(
  word: string,
  irregularForms: Record<string, string>,
): string[] {
  const w = word.toLocaleLowerCase("en");
  if (!isPlainWord(w)) return [];

  const irregular = irregularForms[w];
  if (irregular) return [irregular.toLocaleLowerCase("en")];

  const candidates: string[] = [];
  if (w.endsWith("ies") && w.length > MINIMUM_WORD_LENGTH) {
    candidates.push(`${w.slice(0, -3)}y`);
  } else if (
    w.endsWith("es") &&
    w.length > MINIMUM_WORD_LENGTH &&
    /(ch|sh|ss|x|z)es$/u.test(w)
  ) {
    candidates.push(w.slice(0, -1), w.slice(0, -2));
  } else if (
    w.endsWith("s") &&
    !w.endsWith("ss") &&
    w.length > MINIMUM_WORD_LENGTH
  ) {
    candidates.push(w.slice(0, -1));
  }
  return deduplicate(candidates);
}

/**
 * Candidate singular forms of each word in a plural phrase. Used for the
 * "General Officers Commanding -> GOCs" rule, where the plural may fall on an
 * interior word. Returns the phrase with exactly one word singularized.
 */
export function phraseSingularCandidates(
  phrase: string,
  irregularForms: Record<string, string>,
): string[] {
  const normalized = normalizeForMatch(phrase).trim();
  const words = normalized.split(" ");
  if (words.length < 2 || words.length > 8) return [];

  const candidates: string[] = [];
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    if (!isPlainWord(word)) continue;
    for (const singular of singularCandidates(word, irregularForms)) {
      const rebuilt = [...words];
      rebuilt[index] = singular;
      candidates.push(rebuilt.join(" "));
    }
  }
  return deduplicate(candidates);
}
