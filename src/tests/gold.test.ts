import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  convertAbbreviationToFullForm,
  convertFullFormToAbbreviation,
} from "@/engine/converter";
// Importing testDataset composes the real layers and sets the default dataset.
import "./testDataset";

/**
 * Gold regression suite — dataset layer D.
 *
 * Every case in data/gold-test-cases.jsonl must convert to its recorded
 * expected output. A mismatch fails the run: fixed conversions can never
 * silently regress. New gold cases are appended when a correction is
 * approved in review mode (scripts/add-gold-case.mjs).
 */

interface GoldCase {
  id: string;
  direction: "forward" | "reverse";
  input: string;
  expected: string;
  note?: string;
  source?: string;
}

const goldPath = new URL("../../data/gold-test-cases.jsonl", import.meta.url);

export function loadGoldCases(): GoldCase[] {
  return readFileSync(goldPath, "utf-8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line, index) => {
      const parsed = JSON.parse(line) as GoldCase;
      if (!parsed.id || !parsed.direction || typeof parsed.input !== "string" || typeof parsed.expected !== "string") {
        throw new Error(`Malformed gold case at line ${index + 1}: ${line}`);
      }
      return parsed;
    });
}

const cases = loadGoldCases();

describe("gold regression cases", () => {
  it("dataset layer D is non-empty", () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  it.each(cases.map((c) => [c.id, c] as const))("%s converts to the recorded expectation", (_id, c) => {
    const actual =
      c.direction === "forward"
        ? convertFullFormToAbbreviation(c.input)
        : convertAbbreviationToFullForm(c.input);
    expect(actual).toBe(c.expected);
  });
});
