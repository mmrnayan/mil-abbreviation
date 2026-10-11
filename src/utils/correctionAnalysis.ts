import type { AbbreviationEntry } from "@/engine/types";

/**
 * Review-mode analysis: compares the actual conversion output with the
 * reviewer's expected output and proposes structured correction records using
 * the standard error taxonomy. Pure functions — no engine or React imports.
 */

export const ERROR_TYPES = [
  {
    id: "missing_conversion",
    label: "Not converted",
    cause: "It stayed in full — it should have been abbreviated",
    meaning: "Valid expression remained unchanged",
    required_change: "Add variant or linguistic rule",
  },
  {
    id: "wrong_abbreviation",
    label: "Wrong abbreviation",
    cause: "It converted, but to the wrong abbreviation",
    meaning: "Converted to the wrong abbreviation",
    required_change: "Correct entry or context resolution",
  },
  {
    id: "false_conversion",
    label: "Should not convert",
    cause: "It was abbreviated although it should have stayed in full",
    meaning: "Text should not have been abbreviated",
    required_change: "Add blocking exception",
  },
  {
    id: "partial_conversion",
    label: "Partially converted",
    cause: "Only part of the phrase was converted",
    meaning: "Only part of a longer phrase was converted",
    required_change: "Fix longest-phrase priority",
  },
  {
    id: "wrong_derivative",
    label: "Wrong derivative",
    cause: "The tense or word form was handled wrongly (e.g. -ed, -ing, -er)",
    meaning: "Tense or derivative was handled incorrectly",
    required_change: "Update morphology rule",
  },
  {
    id: "wrong_plural",
    label: "Wrong plural",
    cause: "The singular or plural ending is wrong (the -s)",
    meaning: "Singular/plural output is wrong",
    required_change: "Add plural policy",
  },
  {
    id: "wrong_compound",
    label: "Wrong compound",
    cause: "A prefix or suffix form was handled wrongly (e.g. ldrship, demob)",
    meaning: "Prefix or suffix was mishandled",
    required_change: "Add compound rule",
  },
  {
    id: "ambiguous",
    label: "Ambiguous",
    cause: "Several meanings are possible — a choice is needed",
    meaning: "More than one meaning is possible",
    required_change: "Require user selection",
  },
  {
    id: "punctuation_error",
    label: "Punctuation",
    cause: "Only a space, comma or full stop changed",
    meaning: "Spaces, commas or stops changed",
    required_change: "Fix formatting logic",
  },
  {
    id: "capitalization_error",
    label: "Capitalization",
    cause: "Only the upper/lower case is wrong",
    meaning: "Wrong upper/lowercase output",
    required_change: "Follow dataset casing",
  },
  {
    id: "source_data_error",
    label: "Source data",
    cause: "The dictionary entry itself is wrong — verify the manual, then fix the data",
    meaning: "Dictionary extraction is wrong",
    required_change: "Correct base data after verification",
  },
] as const;

export type ErrorTypeId = (typeof ERROR_TYPES)[number]["id"];

export const ERROR_TYPE_IDS = ERROR_TYPES.map((type) => type.id) as ErrorTypeId[];

export function isErrorTypeId(value: unknown): value is ErrorTypeId {
  return typeof value === "string" && (ERROR_TYPE_IDS as string[]).includes(value);
}

/** Paragraph 0241 rules a correction can require. */
export const REQUIRED_RULES = [
  "exact_authorized",
  "verb_derivative",
  "noun_plural",
  "plural_invariant",
  "compound_suffix",
  "compound_prefix",
  "phrase_plural",
  "context_rule",
] as const;

export type RequiredRuleId = (typeof REQUIRED_RULES)[number];

/** Reviewer-language explanation for each rule a correction can require. */
export const REQUIRED_RULE_CAUSES: Record<RequiredRuleId, string> = {
  exact_authorized: "Authorized pair — printed in the dictionary",
  verb_derivative: "Verb rule — one abbreviation for all tenses and derivatives",
  noun_plural: "Plural rule — add s to the abbreviation",
  plural_invariant: "Plural invariant — the abbreviation already covers both forms",
  compound_suffix: "Compound suffix — suffix letters attach to the abbreviation (ldrship)",
  compound_prefix: "Compound prefix — prefix letters go in front (demob)",
  phrase_plural: "Phrase plural — the whole phrase takes the plural",
  context_rule: "Context rule — depends on the surrounding words",
};

export interface CorrectionRecord {
  /** The problem text as it appears in the original/actual output. */
  source: string;
  actual: string;
  expected: string;
  error_type: ErrorTypeId;
  root?: string;
  entry_id?: string;
  required_rule?: RequiredRuleId;
}

/** A correction suggestion before the reviewer edits it. */
export interface SuggestedCorrection extends CorrectionRecord {
  /** Display helpers derived from the dictionary. */
  authorized_abbreviation?: string;
  authorized_full_form?: string;
}

export interface AnalysisDictionary {
  entries: Pick<
    AbbreviationEntry,
    "id" | "full_form" | "abbreviation" | "match_variants" | "ambiguous" | "conversion_enabled"
  >[];
  compound_affixes: { prefixes: string[]; suffixes: string[] };
  verb_entry_ids: string[];
}

interface Token {
  text: string;
  isWord: boolean;
}

const WORD = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const match of text.matchAll(/\s+|[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*|[^\s]/gu)) {
    const token = match[0];
    if (/^\s+$/u.test(token)) continue;
    WORD.lastIndex = 0;
    tokens.push({ text: token, isWord: WORD.test(token) });
  }
  return tokens;
}

/** First slash/semicolon segment of the full form, parentheticals removed. */
export function baseRootOf(fullForm: string): string {
  return fullForm
    .replace(/\(([^)]*)\)/g, "")
    .replace(/\s+/g, " ")
    .split(/[\/;]/)[0]
    .trim();
}

function stem(word: string): string {
  return word.replace(/(?:ed|ing|s)$/u, "");
}

interface EntryCandidate {
  entry: AnalysisDictionary["entries"][number];
  required_rule?: RequiredRuleId;
  score: number;
  /** Overrides the displayed root when the actual word is a declared form. */
  root?: string;
}

/**
 * Finds the dictionary entry most likely behind an expected token, and the
 * rule that would produce it. Prefers entries whose root word relates to the
 * unconverted actual token.
 */
export function suggestEntry(
  expected: string,
  actual: string,
  dict: AnalysisDictionary,
): EntryCandidate | undefined {
  const expectedKey = expected.toLocaleLowerCase("en");
  const actualKey = actual.toLocaleLowerCase("en");
  const actualStem = stem(actualKey);
  const { suffixes, prefixes } = dict.compound_affixes;
  const candidates: EntryCandidate[] = [];

  for (const entry of dict.entries) {
    if (!entry.conversion_enabled) continue;
    const abbreviation = entry.abbreviation.toLocaleLowerCase("en");
    const root = baseRootOf(entry.full_form).toLocaleLowerCase("en");
    const rootWords = root.split(" ").filter(Boolean);
    // When the unconverted word is itself one of the entry's declared
    // single-word forms, that word — not the printed base segment — is the
    // true root ("Minimum" inside "Minute; Minimum/Minimize").
    const matchingVariant = entry.match_variants.find(
      (variant) =>
        !variant.includes(" ") && variant.toLocaleLowerCase("en") === actualKey,
    );
    const relates = Boolean(matchingVariant) ||
      actualKey.startsWith(root) ||
      rootWords.some((word) => actualKey.startsWith(word) || word.startsWith(actualStem)) ||
      stem(root) === actualStem;

    if (expectedKey === abbreviation) {
      candidates.push({
        entry,
        required_rule: dict.verb_entry_ids.includes(entry.id) ? "verb_derivative" : undefined,
        score: (relates ? 4 : 1) + (rootWords.length === 1 ? 0.5 : 0),
      });
      if (matchingVariant) {
        candidates[candidates.length - 1].root = matchingVariant.toLocaleLowerCase("en");
      }
      continue;
    }
    if (expectedKey === `${abbreviation}s`) {
      candidates.push({ entry, required_rule: "noun_plural", score: relates ? 3 : 0.5 });
      if (matchingVariant) candidates[candidates.length - 1].root = matchingVariant.toLocaleLowerCase("en");
      continue;
    }
    if (abbreviation && expectedKey.startsWith(abbreviation)) {
      const tail = expectedKey.slice(abbreviation.length);
      if (suffixes.includes(tail)) {
        candidates.push({ entry, required_rule: "compound_suffix", score: relates ? 3 : 0.5 });
        if (matchingVariant) candidates[candidates.length - 1].root = matchingVariant.toLocaleLowerCase("en");
        continue;
      }
    }
    const prefix = prefixes.find(
      (affix) =>
        affix &&
        expectedKey.startsWith(affix) &&
        expectedKey.slice(affix.length) === abbreviation,
    );
    if (prefix) {
      candidates.push({ entry, required_rule: "compound_prefix", score: relates ? 3 : 0.5 });
      if (matchingVariant) candidates[candidates.length - 1].root = matchingVariant.toLocaleLowerCase("en");
      continue;
    }
    // Full-form match (reverse-direction problems and phrase suggestions).
    const variantMatch = [entry.full_form, ...entry.match_variants].some(
      (variant) => variant.toLocaleLowerCase("en") === expectedKey,
    );
    if (variantMatch) {
      candidates.push({ entry, required_rule: undefined, score: relates ? 2.5 : 2 });
    }
  }

  return candidates.sort((left, right) => right.score - left.score)[0];
}

function caseFolded(value: string): string {
  return value.toLocaleLowerCase("en");
}

function toCorrection(
  source: string,
  actual: string,
  expected: string,
  candidate: EntryCandidate | undefined,
): SuggestedCorrection {
  const correction: SuggestedCorrection = {
    source,
    actual,
    expected,
    error_type: "missing_conversion",
  };
  if (candidate) {
    correction.entry_id = candidate.entry.id;
    correction.root =
      candidate.root ?? baseRootOf(candidate.entry.full_form).toLocaleLowerCase("en");
    if (candidate.required_rule) correction.required_rule = candidate.required_rule;
    correction.authorized_abbreviation = candidate.entry.abbreviation;
    correction.authorized_full_form = candidate.entry.full_form;
  }
  return correction;
}

/**
 * Aligns the actual and expected outputs and proposes one correction per
 * mismatched token using the standard error taxonomy. Whitespace-only
 * differences collapse into a single punctuation correction.
 */
export function analyzeCorrections(
  actual: string,
  expected: string,
  dict: AnalysisDictionary,
): SuggestedCorrection[] {
  if (actual.trim() === expected.trim()) {
    if (actual !== expected) {
      return [
        {
          source: "(whitespace)",
          actual,
          expected,
          error_type: "punctuation_error",
        },
      ];
    }
    return [];
  }

  const actualTokens = tokenize(actual);
  const expectedTokens = tokenize(expected);
  if (
    actualTokens.length === expectedTokens.length &&
    actualTokens.every((token, index) => token.text === expectedTokens[index].text)
  ) {
    // Identical tokens: the difference is spacing only.
    return [
      {
        source: "(whitespace)",
        actual,
        expected,
        error_type: "punctuation_error",
      },
    ];
  }
  const abbreviationSet = new Set(
    dict.entries.map((entry) => caseFolded(entry.abbreviation)),
  );
  // Tokens shaped like an authorized abbreviation, including plural and
  // compound forms of one ("ldrs", "ldrship", "demob").
  const abbrForms = new Set(abbreviationSet);
  for (const form of abbreviationSet) {
    abbrForms.add(`${form}s`);
    for (const suffix of dict.compound_affixes.suffixes) abbrForms.add(form + suffix);
    for (const prefix of dict.compound_affixes.prefixes) abbrForms.add(prefix + form);
  }
  const isKnownAbbreviation = (token: Token) =>
    token.isWord && abbrForms.has(caseFolded(token.text));

  // Longest-common-subsequence scoring (case-folded) to guide the diff walk.
  const rows = actualTokens.length;
  const cols = expectedTokens.length;
  const table: number[][] = Array.from({ length: rows + 1 }, () =>
    new Array<number>(cols + 1).fill(0),
  );
  for (let i = rows - 1; i >= 0; i -= 1) {
    for (let j = cols - 1; j >= 0; j -= 1) {
      table[i][j] =
        caseFolded(actualTokens[i].text) === caseFolded(expectedTokens[j].text)
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const problems: SuggestedCorrection[] = [];
  const pushReplace = (
    actualToken: Token,
    expectedToken: Token,
    sourceRun?: Token[],
    expectedRun?: Token[],
  ) => {
    const sourceText = (sourceRun ?? [actualToken]).map((token) => token.text).join(" ");
    const expectedText = (expectedRun ?? [expectedToken]).map((token) => token.text).join(" ");
    const candidate = suggestEntry(expectedToken.text, actualToken.text, dict);
    const correction = toCorrection(sourceText, sourceText, expectedText, candidate);
    correction.error_type = classifyPair(
      actualToken,
      expectedToken,
      Boolean(candidate),
      isKnownAbbreviation,
    );
    problems.push(correction);
  };

  let i = 0;
  let j = 0;
  while (i < rows && j < cols) {
    if (actualTokens[i].text === expectedTokens[j].text) {
      i += 1;
      j += 1;
      continue;
    }
    // Collect the whole mismatched run: deletions from actual, insertions
    // from expected, chosen along the LCS-optimal path.
    const deletions: Token[] = [];
    const insertions: Token[] = [];
    while (i < rows || j < cols) {
      const aligned = i < rows && j < cols && actualTokens[i].text === expectedTokens[j].text;
      if (aligned) break;
      if (i >= rows) {
        insertions.push(expectedTokens[j]);
        j += 1;
      } else if (j >= cols) {
        deletions.push(actualTokens[i]);
        i += 1;
      } else if (table[i + 1][j] >= table[i][j + 1]) {
        deletions.push(actualTokens[i]);
        i += 1;
      } else {
        insertions.push(expectedTokens[j]);
        j += 1;
      }
    }
    // One insertion replacing a run of actual tokens (a phrase was not
    // converted as a whole), or one actual token replaced by a run.
    if (insertions.length === 1 && deletions.length >= 1) {
      pushReplace(deletions[0], insertions[0], deletions);
    } else if (deletions.length === 1 && insertions.length >= 1) {
      pushReplace(deletions[0], insertions[0], undefined, insertions);
    } else {
      const pairs = Math.min(deletions.length, insertions.length);
      for (let k = 0; k < pairs; k += 1) {
        pushReplace(deletions[k], insertions[k]);
      }
      for (let k = pairs; k < deletions.length; k += 1) {
        problems.push({
          source: deletions[k].text,
          actual: deletions[k].text,
          expected: "",
          error_type: deletions[k].isWord ? "false_conversion" : "punctuation_error",
        });
      }
      for (let k = pairs; k < insertions.length; k += 1) {
        const candidate = suggestEntry(insertions[k].text, "", dict);
        problems.push(toCorrection(insertions[k].text, "", insertions[k].text, candidate));
      }
    }
  }
  while (i < rows) {
    const token = actualTokens[i];
    problems.push({
      source: token.text,
      actual: token.text,
      expected: "",
      error_type: token.isWord ? "false_conversion" : "punctuation_error",
    });
    i += 1;
  }
  while (j < cols) {
    const token = expectedTokens[j];
    const candidate = suggestEntry(token.text, "", dict);
    problems.push(toCorrection(token.text, "", token.text, candidate));
    j += 1;
  }
  return problems;
}

function classifyPair(
  actualToken: Token,
  expectedToken: Token,
  hasCandidate: boolean,
  isKnownAbbreviation: (token: Token) => boolean,
): ErrorTypeId {
  if (caseFolded(actualToken.text) === caseFolded(expectedToken.text)) {
    return "capitalization_error";
  }
  if (!actualToken.isWord || !expectedToken.isWord) {
    return "punctuation_error";
  }
  const actualAbbrev = isKnownAbbreviation(actualToken);
  const expectedAbbrev = hasCandidate || isKnownAbbreviation(expectedToken);
  if (actualAbbrev && expectedAbbrev) {
    const actual = caseFolded(actualToken.text);
    const expected = caseFolded(expectedToken.text);
    if (actual === `${expected}s` || expected === `${actual}s`) {
      return "wrong_plural";
    }
    return "wrong_abbreviation";
  }
  if (!actualAbbrev && !expectedAbbrev) {
    const actual = caseFolded(actualToken.text);
    const expected = caseFolded(expectedToken.text);
    if (actual === `${expected}s` || expected === `${actual}s`) {
      return "wrong_plural";
    }
    return "wrong_derivative";
  }
  if (!actualAbbrev && expectedAbbrev) {
    return "missing_conversion";
  }
  return "false_conversion";
}
