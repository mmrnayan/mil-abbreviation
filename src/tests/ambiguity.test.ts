import { describe, expect, it } from "vitest";
import { resolutionKeyForAll } from "@/engine/converter";
import { engine } from "./testDataset";

describe("reverse conversion ambiguity", () => {
  it("returns choices instead of guessing an ambiguous abbreviation", () => {
    const result = engine.convertReverse("AAR");
    expect(result.convertedText).toBe("AAR");
    expect(result.ambiguities).toHaveLength(1);
    expect(result.ambiguities[0].choices.map((choice) => choice.meaning)).toEqual(
      expect.arrayContaining(["After Action Review", "Air to Air Refuelling"]),
    );
  });

  it("uses service filters to reduce ambiguity", () => {
    const unfiltered = engine.convertReverse("AU");
    expect(unfiltered.ambiguities.length).toBeGreaterThan(0);

    const army = engine.convertReverse("AU", { service: "army" });
    expect(army.ambiguities).toHaveLength(0);
    expect(army.convertedText).toBe("Accounting Unit");
  });

  it("applies an explicit meaning to all occurrences", () => {
    const unresolved = engine.convertReverse("AAR and AAR");
    const choice = unresolved.ambiguities[0].choices.find(
      (item) => item.meaning === "After Action Review",
    );
    expect(choice).toBeDefined();
    const resolved = engine.convertReverse("AAR and AAR", {
      resolutions: {
        [resolutionKeyForAll("AAR")]: choice!.id,
      },
    });
    expect(resolved.convertedText).toBe(
      "After Action Review and After Action Review",
    );
    expect(resolved.replacements.every((item) => item.resolution === "user-selected")).toBe(true);
  });

  it("presents Annex B meanings rather than the combined printed full form", () => {
    const result = engine.convertReverse("a/m", { annex: "B" });
    expect(result.ambiguities).toHaveLength(1);
    const meanings = result.ambiguities[0].choices.map((choice) => choice.meaning);
    expect(meanings).toEqual(expect.arrayContaining(["Above mentioned", "Aforementioned"]));
    expect(meanings).not.toContain("Above mentioned; Aforementioned");
  });

  it("does not expand inside an ordinary word", () => {
    expect(engine.convertReverse("SCAR").convertedText).toBe("SCAR");
  });
});
