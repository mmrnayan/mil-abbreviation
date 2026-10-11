#!/usr/bin/env node
/**
 * Append a gold regression case to data/gold-test-cases.jsonl.
 *
 * Usage:
 *   node scripts/add-gold-case.mjs --direction forward \
 *     --input "The Major informed the Commanding Officer." \
 *     --expected "The Maj info the CO." \
 *     [--note "..."] [--source "..."]
 *
 * Ids (g-nnnn) are assigned automatically. Duplicate input+direction pairs
 * update the existing case instead of adding a new one.
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const goldPath = fileURLToPath(new URL("../data/gold-test-cases.jsonl", import.meta.url));

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1 || index + 1 >= process.argv.length) return undefined;
  return process.argv[index + 1];
}

const direction = arg("direction");
const input = arg("input");
const expected = arg("expected");
if (!direction || !["forward", "reverse"].includes(direction) || input === undefined || expected === undefined) {
  console.error("Required: --direction forward|reverse --input <text> --expected <text> [--note <text>] [--source <text>]");
  process.exit(1);
}

const lines = existsSync(goldPath)
  ? readFileSync(goldPath, "utf-8").split("\n").map((l) => l.trim()).filter(Boolean)
  : [];
const cases = lines.map((l) => JSON.parse(l));

const existing = cases.find((c) => c.direction === direction && c.input === input);
if (existing) {
  existing.expected = expected;
  if (arg("note")) existing.note = arg("note");
  if (arg("source")) existing.source = arg("source");
  writeFileSync(goldPath, cases.map((c) => JSON.stringify(c)).join("\n") + "\n");
  console.log(`updated ${existing.id}`);
  process.exit(0);
}

const nextNumber = cases.reduce((max, c) => {
  const match = /^g-(\d+)$/.exec(c.id ?? "");
  return match ? Math.max(max, Number(match[1])) : max;
}, 0) + 1;
const record = {
  id: `g-${String(nextNumber).padStart(4, "0")}`,
  direction,
  input,
  expected,
  ...(arg("note") ? { note: arg("note") } : {}),
  ...(arg("source") ? { source: arg("source") } : {}),
};
appendFileSync(goldPath, JSON.stringify(record) + "\n");
console.log(`appended ${record.id}`);
