import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

/**
 * Server-side store of learned word conversions: pairs a reviewer confirmed
 * through Review mode (a word that stayed in full but has an authorized
 * abbreviation). Repeated confirmations strengthen the count; the composer
 * merges them into the runtime dataset as reviewer-approved, medium-
 * confidence entries so corrections reflect in the converter after reload.
 * Storage is a JSONL file under data/, like corrections and feedback.
 */
const DATA_FILE = path.join(process.cwd(), "data", "learned-conversions.jsonl");

export interface LearnedConversion {
  word: string;
  abbreviation: string;
  count: number;
  feedbackIds: string[];
  firstSeen: string;
  lastSeen: string;
}

export async function listLearnedConversions(): Promise<LearnedConversion[]> {
  try {
    const raw = await readFile(DATA_FILE, "utf8");
    const items: LearnedConversion[] = [];
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        items.push(JSON.parse(line) as LearnedConversion);
      } catch {
        // Skip malformed lines.
      }
    }
    return items;
  } catch {
    return [];
  }
}

export async function saveLearnedConversions(items: LearnedConversion[]): Promise<void> {
  await mkdir(path.dirname(DATA_FILE), { recursive: true });
  await writeFile(
    DATA_FILE,
    items.map((item) => JSON.stringify(item)).join("\n") + (items.length ? "\n" : ""),
    "utf8",
  );
}

/**
 * Records one confirmed word→abbreviation pair. Returns "recorded",
 * "incremented", or a skip reason. `convertingWords` is the set of words the
 * dictionary already converts (single-word variants and base words).
 */
export async function recordLearnedConversion(
  word: string,
  abbreviation: string,
  feedbackId: string | undefined,
  convertingWords: Set<string>,
): Promise<"recorded" | "incremented" | "already-converts" | "invalid"> {
  const cleanWord = word.trim().toLowerCase();
  const cleanAbbr = abbreviation.trim();
  if (!/^[a-z][a-z-]{1,40}$/u.test(cleanWord)) return "invalid";
  if (!cleanAbbr || cleanAbbr.length > 20) return "invalid";
  if (convertingWords.has(cleanWord)) return "already-converts";

  const items = await listLearnedConversions();
  const existing = items.find(
    (item) => item.word === cleanWord && item.abbreviation.toLowerCase() === cleanAbbr.toLowerCase(),
  );
  if (existing) {
    existing.count += 1;
    existing.lastSeen = new Date().toISOString();
    if (feedbackId && !existing.feedbackIds.includes(feedbackId)) {
      existing.feedbackIds.push(feedbackId);
    }
    await saveLearnedConversions(items);
    return "incremented";
  }
  const now = new Date().toISOString();
  items.push({
    word: cleanWord,
    abbreviation: cleanAbbr,
    count: 1,
    feedbackIds: feedbackId ? [feedbackId] : [],
    firstSeen: now,
    lastSeen: now,
  });
  await saveLearnedConversions(items);
  return "recorded";
}

/** Words the base dictionary already converts on their own. */
export async function buildConvertingWordSet(): Promise<Set<string>> {
  const base = JSON.parse(
    await readFile(path.join(process.cwd(), "public/data/abbreviations.base.json"), "utf8"),
  ) as {
    entries: { full_form: string; abbreviation: string; annex: string }[];
    annex_profiles: Record<string, { service: string | null }>;
  };
  const words = new Set<string>();
  for (const entry of base.entries) {
    words.add(entry.abbreviation.trim().toLowerCase());
    // Only words that convert ALONE count against a learned pair: entries
    // whose first segment is a single word ("Arrange"), plus single-word
    // match variants. Words inside multi-word phrases ("Situational" in
    // "Situation Report") do not convert alone and must stay learnable.
    const firstSegment = entry.full_form
      .replace(/\(([^)]*)\)/g, "")
      .split(/[\/;]/)[0]
      .trim();
    if (!/\s/u.test(firstSegment)) {
      words.add(firstSegment.toLowerCase());
    }
    for (const variant of (entry as { match_variants?: string[] }).match_variants ?? []) {
      if (!/\s/u.test(variant.trim())) {
        words.add(variant.trim().toLowerCase());
      }
    }
  }
  return words;
}
