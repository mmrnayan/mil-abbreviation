/**
 * Stage 1 of the ML pipeline (DataPrep): builds leak-free train/test splits
 * of ambiguity-ranking records for the future ONNX cross-encoder.
 *
 * Sources, in order of trust:
 *   1. public/data/gold-test-cases.jsonl  — human-verified sentences (layer D),
 *     if the file exists. Fields: sentence, abbreviation, correctMeaningId,
 *     plus optional service/writingContext/context.
 *   2. data/corrections.jsonl — review-mode submissions; the only user text
 *     in the system, present because a reviewer explicitly submitted it.
 *     Only records that resolve to a dictionary abbreviation group are used.
 *   3. Synthesized templates over the dictionary — every reverse-conflict
 *     group yields positive records for the correct meaning and negatives
 *     for the alternatives, across a few sentence patterns.
 *
 * Leakage control: every record carries a groupKey (the abbreviation group
 * it belongs to, or its source signature); the whole group goes to one
 * split, so variants of the same entry never straddle train and test.
 *
 * Usage: node scripts/generate-ambiguity-training-data.mjs
 * Output: ml/data/ambiguity-train.jsonl, ml/data/ambiguity-test.jsonl
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const project = resolve(here, "..");

function norm(value) {
  return value
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .normalize("NFC")
    .replace(/\s+/gu, " ")
    .toLowerCase()
    .trim();
}

/** Deterministic 32-bit string hash for stable split assignment. */
function hash(value) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const base = JSON.parse(
  readFileSync(resolve(project, "public/data/abbreviations.base.json"), "utf8"),
);

const SINGLE_MEANING_EXCEPTIONS = new Set(["abbr-0056"]);
function meaningsOf(entry) {
  if (entry.annex === "B" && entry.full_form.includes(";") && !SINGLE_MEANING_EXCEPTIONS.has(entry.id)) {
    return entry.full_form.split(";").map((part) => part.trim());
  }
  return [entry.full_form];
}

// Reverse-conflict groups: one normalized abbreviation, several distinct
// full forms. Reverse conversion uses every entry, including annex B.
const groups = new Map();
for (const entry of base.entries) {
  const key = norm(entry.abbreviation);
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(entry);
}

/** Display form for synthesized sentences: strip notation, first alternative. */
function displayForm(fullForm) {
  return fullForm
    .replace(/\(([^)]*)\)/g, "")
    .replace(/\s+/g, " ")
    .split(/[\/;]/)[0]
    .trim();
}

const PATTERNS = [
  (form) => `The ${form} was reviewed this morning.`,
  (form) => `Report the outcome to the ${form} without delay.`,
  (form) => `The ${form} confirmed the schedule for the exercise.`,
  (form) => `Items assigned to the ${form} are listed in the annex.`,
];

const datasetVersion = `1.1.0·${base.generated_on}`;
const records = [];
let recordSeq = 0;
const nextId = () => `syn-${String((recordSeq += 1)).padStart(5, "0")}`;

for (const [abbrKey, entries] of groups) {
  const distinctForms = new Set(entries.map((entry) => norm(entry.full_form)));
  if (entries.length < 2 || distinctForms.size < 2) continue;

  // Candidate list mirrors AmbiguityChoice: entryId::meaning.
  const candidates = [];
  for (const entry of entries) {
    for (const meaning of meaningsOf(entry)) {
      candidates.push({
        choiceId: `${entry.id}::${meaning}`,
        meaning,
        service: entry.service ?? "tri-service",
        annex: entry.annex,
        category: entry.category ?? "general",
        confidence: entry.verified ? "high" : "medium",
      });
    }
  }
  const groupKey = `abbr:${abbrKey}`;

  for (const correct of candidates) {
    if (correct.meaning.includes(";")) continue; // composite printed forms
    const form = displayForm(correct.meaning);
    if (!form || /\s{2,}/u.test(form)) continue;
    for (let pattern = 0; pattern < PATTERNS.length; pattern += 1) {
      records.push({
        recordId: nextId(),
        groupKey,
        sentence: PATTERNS[pattern](form),
        abbreviation: entries[0].abbreviation,
        candidates,
        correctMeaningId: correct.choiceId,
        service: correct.service,
        writingContext: "internal-service-writing",
        direction: "abbreviation-to-full",
        datasetVersion,
        source: "synthesized",
      });
    }
  }
}

// Human-verified layer-D sentences, when present.
const goldPath = resolve(project, "public/data/gold-test-cases.jsonl");
let goldCount = 0;
if (existsSync(goldPath)) {
  for (const line of readFileSync(goldPath, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const item = JSON.parse(line);
      if (!item.sentence || !item.abbreviation || !item.correctMeaningId) continue;
      const key = norm(item.abbreviation);
      const group = groups.get(key);
      if (!group) continue;
      const candidates = [];
      for (const entry of group) {
        for (const meaning of meaningsOf(entry)) {
          candidates.push({
            choiceId: `${entry.id}::${meaning}`,
            meaning,
            service: entry.service ?? "tri-service",
            annex: entry.annex,
            category: entry.category ?? "general",
            confidence: entry.verified ? "high" : "medium",
          });
        }
      }
      records.push({
        recordId: `gold-${goldCount + 1}`,
        groupKey: `abbr:${key}`,
        sentence: item.sentence,
        abbreviation: item.abbreviation,
        candidates,
        correctMeaningId: item.correctMeaningId,
        service: item.service ?? "all",
        writingContext: item.writingContext ?? item.context ?? "internal-service-writing",
        direction: "abbreviation-to-full",
        datasetVersion,
        source: "gold",
      });
      goldCount += 1;
    } catch {
      // Skip malformed gold lines.
    }
  }
}

// Reviewer-submitted sentences from review mode (the only consented user text).
let reviewCount = 0;
const correctionsPath = resolve(project, "data/corrections.jsonl");
if (existsSync(correctionsPath)) {
  for (const line of readFileSync(correctionsPath, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const item = JSON.parse(line);
      if (item.direction !== "abbreviation-to-full") continue;
      // The expected output of a reverse correction contains the intended
      // meaning; the sentence is the abbreviated input under review.
      const sentence = item.input_sentence;
      if (!sentence) continue;
      // Find abbreviations in the sentence that map to a conflict group.
      for (const [abbrKey, entries] of groups) {
        const pattern = new RegExp(
          `(^|[^\\p{L}\\p{N}])${abbrKey.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}([^\\p{L}\\p{N}]|$)`,
          "iu",
        );
        if (!pattern.test(sentence)) continue;
        const candidates = [];
        for (const entry of entries) {
          for (const meaning of meaningsOf(entry)) {
            candidates.push({
              choiceId: `${entry.id}::${meaning}`,
              meaning,
              service: entry.service ?? "tri-service",
              annex: entry.annex,
              category: entry.category ?? "general",
              confidence: entry.verified ? "high" : "medium",
            });
          }
        }
        // The reviewed expected output picks one meaning; mark it correct
        // only when exactly one candidate appears in the expected output.
        const expected = (item.expected_output ?? "").toLowerCase();
        const hits = candidates.filter((candidate) =>
          expected.includes(candidate.meaning.toLowerCase()),
        );
        if (hits.length !== 1) continue;
        records.push({
          recordId: `rev-${item.feedback_id}`,
          groupKey: `abbr:${abbrKey}`,
          sentence,
          abbreviation: entries[0].abbreviation,
          candidates,
          correctMeaningId: hits[0].choiceId,
          service: hits[0].service,
          writingContext: item.direction ?? "internal-service-writing",
          direction: "abbreviation-to-full",
          datasetVersion,
          source: "review",
        });
        reviewCount += 1;
        break;
      }
    } catch {
      // Skip malformed review lines.
    }
  }
}

// Leak-free 80/20 split at group granularity.
const train = [];
const test = [];
for (const record of records) {
  (hash(record.groupKey) % 10 < 8 ? train : test).push(record);
}

mkdirSync(resolve(project, "ml/data"), { recursive: true });
writeFileSync(
  resolve(project, "ml/data/ambiguity-train.jsonl"),
  train.map((record) => JSON.stringify(record)).join("\n") + "\n",
);
writeFileSync(
  resolve(project, "ml/data/ambiguity-test.jsonl"),
  test.map((record) => JSON.stringify(record)).join("\n") + "\n",
);

const bySource = records.reduce((counts, record) => {
  counts[record.source] = (counts[record.source] ?? 0) + 1;
  return counts;
}, {});
console.log(
  JSON.stringify(
    {
      total: records.length,
      train: train.length,
      test: test.length,
      groups: new Set(records.map((record) => record.groupKey)).size,
      bySource,
      reviewSubmissions: reviewCount,
    },
    null,
    2,
  ),
);
