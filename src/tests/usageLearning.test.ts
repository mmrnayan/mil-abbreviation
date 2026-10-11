import { describe, expect, it } from "vitest";
import { dataset, engine } from "./testDataset";
import { composeDataset } from "@/engine/datasetLayers";
import { suggestEntry, type AnalysisDictionary } from "@/utils/correctionAnalysis";
import { rulesOverlay } from "@/engine/rulesOverlay";
import baseLayer from "../../public/data/abbreviations.base.json";
import rulesLayer from "../../public/data/abbreviation-rules.json";
import overridesLayer from "../../public/data/abbreviation-overrides.json";
import type {
  AuthoritativeDictionary,
  LanguageRules,
  OverridesLayer,
} from "@/engine/datasetLayers";

describe("reviewer-reported data defects", () => {
  it("no longer converts the common word response to HADR", () => {
    const result = engine.convertForward("Radar response time");
    expect(result.convertedText).toBe("Radar response time");
    // The full authorized phrases still convert.
    const phrase = engine.convertForward(
      "Humanitarian Assistance and Disaster Relief deployed.",
    );
    expect(phrase.convertedText).toContain("HADR");
    const responsePhrase = engine.convertForward(
      "Humanitarian Assistance and Disaster Response deployed.",
    );
    expect(responsePhrase.convertedText).toContain("HADR");
  });

  it("converts Minimum to Min at sentence start after enabling the annex B record", () => {
    // Matches the reviewer's expected output: sentence case for the
    // sentence-initial replacement.
    expect(engine.convertForward("Minimum Warning Range").convertedText).toBe(
      "Min wng rng",
    );
    expect(engine.convertForward("the Minimum Warning Range").convertedText).toBe(
      "the min wng rng",
    );
  });

  it("converts terrain to terr after enabling the annex B record", () => {
    expect(engine.convertForward("terrain limitations").convertedText).toBe(
      "terr limitations",
    );
  });
});

describe("learned word conversions (review corrections → dictionary)", () => {
  const base = baseLayer as unknown as AuthoritativeDictionary;
  const rules = rulesLayer as unknown as LanguageRules;
  const overrides = overridesLayer as unknown as OverridesLayer;

  it("composes learned pairs as medium-confidence entries that convert", () => {
    const learned = composeDataset(base, rules, overrides, [
      { word: "centrally", abbreviation: "cen", count: 3 },
    ]);
    const entry = learned.entries.find((candidate) => candidate.id === "learned-centrally");
    expect(entry?.abbreviation).toBe("cen");
    expect(entry?.quality.confidence).toBe("medium");
    const learnedEngine = new (engine.constructor as ReturnType<() => unknown> & typeof Object)(
      learned,
    ) as typeof engine;
    expect(learnedEngine.convertForward("away centrally under").convertedText).toBe(
      "away cen under",
    );
  });

  it("skips words the dictionary already converts", () => {
    const learned = composeDataset(base, rules, overrides, [
      { word: "establish", abbreviation: "estb", count: 1 },
      { word: "terrain", abbreviation: "terr", count: 1 },
    ]);
    expect(learned.entries.find((candidate) => candidate.id === "learned-establish")).toBeUndefined();
    expect(learned.entries.find((candidate) => candidate.id === "learned-terrain")).toBeUndefined();
  });
});

describe("suggestion ranking associates the right entry", () => {
  const dict: AnalysisDictionary = {
    entries: dataset.entries
      .filter((entry) => /minimum|minute/i.test(entry.full_form) || entry.abbreviation === "min")
      .map((entry) => {
        const forward = rulesOverlay.forward_overrides[entry.id];
        return {
          id: entry.id,
          full_form: entry.full_form,
          abbreviation: entry.abbreviation,
          match_variants: forward?.variants ?? entry.match_variants,
          ambiguous: entry.ambiguous,
          conversion_enabled: entry.conversion_enabled || Boolean(forward),
        };
      }),
    compound_affixes: { prefixes: [], suffixes: ["ship"] },
    verb_entry_ids: [],
  };

  it("roots Minimum at minimum, not minute", () => {
    const suggestion = suggestEntry("min", "Minimum", dict);
    expect(suggestion?.entry.id).toBe("abbr-1675");
    expect(suggestion?.root).toBe("minimum");
  });
});
