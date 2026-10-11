import { describe, expect, it } from "vitest";
import { resolutionKeyForOccurrence } from "@/engine/converter";
import { engine } from "./testDataset";

const possibleMeanings = (abbreviation: string) => {
  const result = engine.convertReverse(abbreviation);
  return [...result.replacements.map((replacement) => replacement.replacementText),
    ...result.ambiguities.flatMap((ambiguity) => ambiguity.choices.map((choice) => choice.meaning))];
};

describe("source and grammar reverse coverage", () => {
  it.each(["GOCs", "redepl", "ldrship"])("recognizes the bounded generated abbreviation %s", (abbreviation) => {
    const result = engine.convertReverse(abbreviation);
    expect(result.unresolved).toHaveLength(0);
    expect(result.replacements.length + result.ambiguities.length).toBeGreaterThan(0);
  });

  it("preserves an obsolete unauthorized plural rather than inventing an expansion", () => {
    expect(engine.convertReverse("depls").convertedText).toBe("depls");
  });

  it("recognizes the authorized case of a service-specific rank plural", () => {
    const result = engine.convertReverse("Comds", { service: "army" });
    const meanings = [...result.replacements.map((replacement) => replacement.replacementText),
      ...result.ambiguities.flatMap((ambiguity) => ambiguity.choices.map((choice) => choice.meaning))];
    expect(meanings.map((meaning) => meaning.toLocaleLowerCase("en"))).toContain("commanders");
    expect(engine.convertReverse("comds").convertedText).toBe("comds");
  });

  it("offers individual support forms without guessing the lost tense", () => {
    const choices = possibleMeanings("sp").map((meaning) => meaning.toLocaleLowerCase("en"));
    expect(choices).toContain("support");
    expect(choices).toContain("supporting");
    expect(choices).toContain("supported");
    expect(choices.every((meaning) => !meaning.includes("support/"))).toBe(true);
    expect(engine.convertReverse("sp").convertedText).toBe("sp");
  });

  it("expands generated appointment prefixes through authorized appointments", () => {
    expect(possibleMeanings("AMS")).toContain("Assistant Military Secretary");
    expect(possibleMeanings("A/MS")).toContain("Acting Military Secretary");
  });

  it("recognizes sentence capitalization while retaining canonical case elsewhere", () => {
    for (const source of ["Info", "Ldrship", "Redepl", "Text. Info", "Text\nLdrship"]) {
      const result = engine.convertReverse(source);
      expect(result.replacements.length + result.ambiguities.length).toBeGreaterThan(0);
    }
    const midSentence = engine.convertReverse("the Ldrship");
    expect(midSentence.convertedText).toBe("the Ldrship");
    expect(midSentence.replacements).toHaveLength(0);
  });

  it("applies an explicit grammar choice and reports its rule provenance", () => {
    const pending = engine.convertReverse("depl");
    const choice = pending.ambiguities.flatMap((ambiguity) => ambiguity.choices)
      .find((candidate) => candidate.meaning.toLocaleLowerCase("en") === "deployed");
    expect(choice).toBeDefined();
    const selected = engine.convertReverse("depl", { resolutions: { [resolutionKeyForOccurrence(0)]: choice!.id } });
    expect(selected.convertedText.toLocaleLowerCase("en")).toBe("deployed");
    expect(selected.replacements[0].rule).toBe("verb-derivative");
    expect(selected.replacements[0].normalizedRoot?.toLocaleLowerCase("en")).toBe("deploy");
    expect(selected.replacements[0].resolution).toBe("user-selected");
  });
});
