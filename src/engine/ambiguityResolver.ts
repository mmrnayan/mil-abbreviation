import { normalizeForMatch } from "./phraseTrie";
import type {
  AbbreviationEntry,
  AmbiguityChoice,
  ConflictDefinition,
} from "./types";

export function createChoiceId(entryId: string, meaning: string): string {
  return `${entryId}::${meaning}`;
}

export function buildMeaningChoices(
  entries: AbbreviationEntry[],
): AmbiguityChoice[] {
  const choices: AmbiguityChoice[] = [];
  const seenMeanings = new Set<string>();

  for (const entry of entries) {
    const meanings = entry.meanings.length ? entry.meanings : [entry.full_form];

    for (const meaning of meanings) {
      const key = normalizeForMatch(meaning).trim();
      if (!meaning.trim() || seenMeanings.has(key)) continue;
      seenMeanings.add(key);
      choices.push({
        id: createChoiceId(entry.id, meaning),
        entryId: entry.id,
        meaning,
        service: entry.service,
        annex: entry.annex,
        category: entry.category,
        confidence: entry.quality.confidence,
        notes: entry.notes,
      });
    }
  }

  return choices.sort((left, right) =>
    left.meaning.localeCompare(right.meaning, "en", { sensitivity: "base" }),
  );
}

export function getConflictPolicy(
  abbreviation: string,
  conflictsByAbbreviation: Map<string, ConflictDefinition>,
): string {
  return (
    conflictsByAbbreviation.get(abbreviation.toLocaleLowerCase("en"))
      ?.reverse_policy ?? "require_context_or_user_selection"
  );
}

export function sentenceAround(
  input: string,
  startIndex: number,
  endIndex: number,
): string {
  const sentenceBoundary = /[.!?\n]/;
  let start = startIndex;
  let end = endIndex;
  while (start > 0 && !sentenceBoundary.test(input[start - 1])) start -= 1;
  while (end < input.length && !sentenceBoundary.test(input[end])) end += 1;
  if (end < input.length) end += 1;
  const sentence = input.slice(start, end).trim();
  if (sentence.length <= 260) return sentence;

  const localStart = Math.max(0, startIndex - start - 100);
  const localEnd = Math.min(sentence.length, endIndex - start + 100);
  return `${localStart > 0 ? "…" : ""}${sentence.slice(localStart, localEnd)}${
    localEnd < sentence.length ? "…" : ""
  }`;
}
