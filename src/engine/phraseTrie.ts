import type { AbbreviationEntry } from "./types";

export interface TrieValue {
  entry: AbbreviationEntry;
  variant: string;
  order: number;
}

export interface TrieMatch extends TrieValue {
  startIndex: number;
  endIndex: number;
}

interface TrieNode {
  children: Map<string, TrieNode>;
  values: TrieValue[];
}

const APOSTROPHES = /[\u2018\u2019\u02BC\uFF07`]/g;
const SINGLE_APOSTROPHE = /[\u2018\u2019\u02BC\uFF07`]/;
const WHITE_SPACE = /\s/u;
const WORD_CHARACTER = /[\p{L}\p{N}_]/u;

export function normalizeApostrophes(value: string): string {
  return value.replace(APOSTROPHES, "'");
}

/** Normalization is deliberately narrow so the authoritative dataset remains decisive. */
export function normalizeForMatch(value: string, foldCase = true): string {
  const normalized = normalizeApostrophes(value)
    .normalize("NFC")
    .replace(/\s+/gu, " ");
  return foldCase ? normalized.toLocaleLowerCase("en") : normalized;
}

export function isWordCharacter(character: string | undefined): boolean {
  return Boolean(character && WORD_CHARACTER.test(character));
}

function normalizedCharacter(character: string): string {
  if (SINGLE_APOSTROPHE.test(character)) return "'";
  return character.toLocaleLowerCase("en");
}

function makeNode(): TrieNode {
  return { children: new Map<string, TrieNode>(), values: [] };
}

/**
 * Character trie used for both directions. Whitespace runs are represented by one
 * edge, allowing matching across repeated spaces without changing untouched text.
 */
export class PhraseTrie {
  private readonly root: TrieNode = makeNode();

  add(phrase: string, value: TrieValue): void {
    const normalized = normalizeForMatch(phrase).trim();
    if (!normalized) return;

    let node = this.root;
    for (const character of normalized) {
      let child = node.children.get(character);
      if (!child) {
        child = makeNode();
        node.children.set(character, child);
      }
      node = child;
    }
    node.values.push(value);
  }

  findMatchesAt(input: string, startIndex: number): TrieMatch[] {
    if (startIndex < 0 || startIndex >= input.length) return [];

    const matches: TrieMatch[] = [];
    let node = this.root;
    let cursor = startIndex;

    while (cursor < input.length) {
      const character = input[cursor];
      let key: string;
      let nextCursor: number;

      if (WHITE_SPACE.test(character)) {
        key = " ";
        nextCursor = cursor + 1;
        while (nextCursor < input.length && WHITE_SPACE.test(input[nextCursor])) {
          nextCursor += 1;
        }
      } else {
        key = normalizedCharacter(character);
        nextCursor = cursor + 1;
      }

      const child = node.children.get(key);
      if (!child) break;

      node = child;
      cursor = nextCursor;
      if (node.values.length) {
        for (const value of node.values) {
          matches.push({ ...value, startIndex, endIndex: cursor });
        }
      }
    }

    return matches;
  }
}

export function hasValidBoundaries(
  input: string,
  match: Pick<TrieMatch, "startIndex" | "endIndex" | "variant" | "entry">,
): boolean {
  if (!match.entry.match.word_boundary && !match.entry.match.whole_phrase) return true;

  const normalizedVariant = normalizeForMatch(match.variant, false).trim();
  const first = normalizedVariant[0];
  const last = normalizedVariant[normalizedVariant.length - 1];
  const before = match.startIndex > 0 ? input[match.startIndex - 1] : undefined;
  const after = match.endIndex < input.length ? input[match.endIndex] : undefined;

  if (isWordCharacter(first) && isWordCharacter(before)) return false;
  if (isWordCharacter(last) && isWordCharacter(after)) return false;

  if (match.entry.match.case_sensitive) {
    const source = input.slice(match.startIndex, match.endIndex);
    if (
      normalizeForMatch(source, false).trim() !==
      normalizeForMatch(match.variant, false).trim()
    ) {
      return false;
    }
  }

  return true;
}
