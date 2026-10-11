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
    ["6th United States Fleet", "6th (US) Fleet"],
  ])("converts %s using the authorized pattern", (source, expected) => {
    expect(engine.convertForward(source).convertedText).toBe(expected);
  });

  it("uses qualification case in military-qualification context", () => {
    const result = engine.convertForward("Armed Forces War Course", {
      context: "military-qualification",
    });
    expect(result.convertedText).toBe("afwc");
    expect(result.replacements[0].resolution).toBe("context-rule");
  });

  it("adds a warning when a medium-confidence record is used", () => {
    const result = engine.convertForward("Army Dental Corps");
    expect(result.convertedText).toBe("ADC");
    expect(result.warnings.join(" ")).toMatch(/medium-confidence/i);
  });

  it("adds civilian/external correspondence guidance", () => {
    const result = engine.convertForward("Information", {
      context: "civilian-external-correspondence",
    });
    expect(result.warnings.join(" ")).toMatch(/discourages Service abbreviations/i);
  });
});
