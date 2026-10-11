import { describe, expect, it } from "vitest";
import { engine } from "./testDataset";

describe("contextual rules", () => {
  it.each([
    ["Assistant Military Secretary", "AMS"],
    ["Acting Military Secretary", "A/MS"],
    ["Deputy Military Secretary", "Dy MS"],
    ["Deputy Assistant Director of Ordnance Services", "DADOS"],
    ["Officiating Commanding Officer", "Offg CO"],
    ["Vice Admiral", "V Adm"],
  ])("converts %s using the authorized pattern", (source, expected) => {
    expect(engine.convertForward(source).convertedText).toBe(expected);
  });

  it("formats national distinguishing letters without abbreviating formation words", () => {
    expect(engine.convertForward("6th United States Fleet", { context: "national-force-designation" }).convertedText).toBe("6th (US) Fleet");
  });

  it("uses qualification case in military-qualification context", () => {
    const result = engine.convertForward("Armed Forces War Course", {
      context: "military-qualification",
    });
    expect(result.convertedText).toBe("afwc");
    expect(result.replacements[0].resolution).toBe("context-rule");
  });

  it("adds a warning when a medium-confidence record is used", () => {
    const result = engine.convertForward("centrally");
    expect(result.convertedText).toBe("cen");
    expect(result.warnings.join(" ")).toMatch(/medium-confidence/i);
  });

  it("excludes service abbreviation conversion for civilian/external correspondence", () => {
    const result = engine.convertForward("Information", {
      context: "civilian-external-correspondence",
    });
    expect(result.convertedText).toBe("Information");
    expect(result.replacements).toHaveLength(0);
    expect(result.warnings.join(" ")).toMatch(/Service abbreviations are excluded/i);
  });
});
