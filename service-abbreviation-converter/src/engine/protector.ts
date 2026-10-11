import { hasValidBoundaries, normalizeForMatch, PhraseTrie, type TrieMatch } from "./phraseTrie";
import type { AbbreviationEntry } from "./types";

export interface ProtectedRange {
  startIndex: number;
  endIndex: number;
  kind: "url" | "email" | "file-path" | "number-or-date" | "abbreviation";
}

const STATIC_PATTERNS: Array<{
  kind: ProtectedRange["kind"];
  expression: RegExp;
  capture?: number;
}> = [
  { kind: "url", expression: /\b(?:https?:\/\/|www\.)[^\s<>"']+/giu },
  { kind: "email", expression: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu },
  {
    kind: "file-path",
    expression: /\b[A-Z]:\\(?:[^\\\s<>:"|?*]+\\)*[^\\\s<>:"|?*]*/giu,
  },
  {
    kind: "file-path",
    expression: /(^|[\s(])((?:\.{1,2}\/|\/)[^\s<>"']+)/gmu,
    capture: 2,
  },
  {
    kind: "number-or-date",
    expression: /\b\d{1,4}[-/]\d{1,2}[-/]\d{1,4}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?\b/gu,
  },
  {
    kind: "number-or-date",
    expression: /\b\d{1,2}:\d{2}(?::\d{2})?(?:\s?[AP]M)?\b/giu,
  },
  { kind: "number-or-date", expression: /\b\d+\.\d+\b/gu },
];

function mergeRanges(ranges: ProtectedRange[]): ProtectedRange[] {
  const sorted = [...ranges].sort(
    (left, right) => left.startIndex - right.startIndex || right.endIndex - left.endIndex,
  );
  const merged: ProtectedRange[] = [];

  for (const range of sorted) {
    const previous = merged.at(-1);
    if (previous && range.startIndex < previous.endIndex) {
      previous.endIndex = Math.max(previous.endIndex, range.endIndex);
      continue;
    }
    merged.push({ ...range });
  }
  return merged;
}

export function collectStaticProtectedRanges(input: string): ProtectedRange[] {
  const ranges: ProtectedRange[] = [];

  for (const pattern of STATIC_PATTERNS) {
    pattern.expression.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.expression.exec(input)) !== null) {
      const source = pattern.capture ? match[pattern.capture] : match[0];
      const leadingLength = pattern.capture ? match[0].indexOf(source) : 0;
      const startIndex = match.index + leadingLength;
      ranges.push({
        startIndex,
        endIndex: startIndex + source.length,
        kind: pattern.kind,
      });
      if (match[0].length === 0) pattern.expression.lastIndex += 1;
    }
  }

  return mergeRanges(ranges);
}

export function collectProtectedRanges(
  input: string,
  abbreviationTrie: PhraseTrie,
  isEntryAllowed: (entry: AbbreviationEntry) => boolean,
): ProtectedRange[] {
  const staticRanges = collectStaticProtectedRanges(input);
  const abbreviationRanges: ProtectedRange[] = [];
  let cursor = 0;
  let staticIndex = 0;

  while (cursor < input.length) {
    while (
      staticIndex < staticRanges.length &&
      staticRanges[staticIndex].endIndex <= cursor
    ) {
      staticIndex += 1;
    }
    const nextStatic = staticRanges[staticIndex];
    if (
      nextStatic &&
      cursor >= nextStatic.startIndex &&
      cursor < nextStatic.endIndex
    ) {
      cursor = nextStatic.endIndex;
      continue;
    }

    const matches = abbreviationTrie
      .findMatchesAt(input, cursor)
      .filter((match) => isEntryAllowed(match.entry))
      .filter((match) => hasValidBoundaries(input, match))
      .filter((match) => {
        const source = input.slice(match.startIndex, match.endIndex);
        return (
          normalizeForMatch(source, false).trim() ===
          normalizeForMatch(match.variant, false).trim()
        );
      })
      .filter(
        (match) =>
          !nextStatic ||
          match.endIndex <= nextStatic.startIndex ||
          match.startIndex >= nextStatic.endIndex,
      );

    const selected = selectLongest(matches);
    if (selected) {
      abbreviationRanges.push({
        startIndex: selected.startIndex,
        endIndex: selected.endIndex,
        kind: "abbreviation",
      });
      cursor = selected.endIndex;
    } else {
      cursor += 1;
    }
  }

  return mergeRanges([...staticRanges, ...abbreviationRanges]);
}

function selectLongest(matches: TrieMatch[]): TrieMatch | undefined {
  return [...matches].sort(
    (left, right) =>
      right.endIndex - right.startIndex - (left.endIndex - left.startIndex) ||
      left.order - right.order,
  )[0];
}

/** Ranges must be sorted by start index. */
export function overlapsProtectedRange(
  ranges: ProtectedRange[],
  startIndex: number,
  endIndex: number,
): boolean {
  let low = 0;
  let high = ranges.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const range = ranges[middle];
    if (range.endIndex <= startIndex) low = middle + 1;
    else if (range.startIndex >= endIndex) high = middle - 1;
    else return true;
  }
  return false;
}
