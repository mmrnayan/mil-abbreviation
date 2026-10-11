import { describe, expect, it } from "vitest";
import { dataset, engine } from "./testDataset";

describe("override-driven corrections", () => {
  it("corrects the wrongly extracted Command entry, so command converts to comd", () => {
    const entry = dataset.entries.find((candidate) => candidate.id === "abbr-1980");
    expect(entry?.full_form).toBe("Commodore Special Warfare Diving and Salvage Command");
    expect(engine.convertForward("the command and administrative parts").convertedText).toBe(
      "the comd and admin parts",
    );
  });

  it("keeps the reverse expansion of the corrected entry", () => {
    const result = engine.convertReverse("COMSWADS");
    expect(result.convertedText).toBe("Commodore Special Warfare Diving and Salvage Command");
  });

  it("releases Technology to tech after correcting the DNIT extraction", () => {
    const dnit = dataset.entries.find((candidate) => candidate.id === "abbr-2015");
    expect(dnit?.full_form).toBe("Director (Directorate) of Naval Information and Technology");
    // Sentence-initial replacement keeps sentence case (Paragraph 0241).
    expect(engine.convertForward("Technology").convertedText).toBe("Tech");
    const reverse = engine.convertReverse("DNIT");
    expect(reverse.convertedText).toBe("DNIT");
    expect(reverse.ambiguities[0]?.choices.map((choice) => choice.meaning)).toEqual([
      "Director of Naval Information and Technology",
      "Directorate of Naval Information and Technology",
    ]);
  });

  it("corrects the other wrapped-row fragments", () => {
    for (const [abbreviation, title] of [
      ["DNW&EE", "Naval Weapons and Electrical Engineering"],
      ["DNAI&S", "Naval Armament Inspection and Supply"],
      ["DNST", "Naval Supply and Transport"],
      ["DNSD&C", "Naval Staff Duties and Ceremony"],
    ]) {
      const reverse = engine.convertReverse(abbreviation);
      expect(reverse.convertedText).toBe(abbreviation);
      expect(reverse.ambiguities[0]?.choices.map((choice) => choice.meaning)).toEqual([
        `Director of ${title}`,
        `Directorate of ${title}`,
      ]);
    }
    expect(engine.convertReverse("DAA&QMG").convertedText).toBe(
      "Deputy Assistant Adjutant and Quartermaster General",
    );
    expect(engine.convertReverse("BNHOC").convertedText).toBe(
      "Bangladesh Navy Hydrographic and Oceanographic Centre",
    );
  });

  it("restores the truncated Cyber Warfare directorate abbreviation", () => {
    const entry = dataset.entries.find((candidate) => candidate.id === "abbr-2197");
    expect(entry?.full_form).toBe("Director of Cyber Warfare and Information Technology");
    expect(entry?.abbreviation).toBe("D CW&IT");
    expect(engine.convertForward("Directorate of Cyber Warfare and Information Technology").convertedText).toBe("Dte CW&IT");
    expect(engine.convertForward("the technology rollout").convertedText).toBe("the tech rollout");
  });

  it("adds the reviewer-approved centrally -> cen conversion", () => {
    const entry = dataset.entries.find((candidate) => candidate.id === "custom-centrally");
    expect(entry?.abbreviation).toBe("cen");
    expect(entry?.quality.confidence).toBe("medium");
    expect(engine.convertForward("away centrally under").convertedText).toBe("away cen under");
  });

  it("adds the reviewer-approved arrangement(s) -> arng conversion", () => {
    expect(
      engine.convertForward("under the arrangements of the regiment").convertedText,
    ).toBe("under the arng of the regt");
    expect(engine.convertForward("under the arrangement of the regiment").convertedText).toBe(
      "under the arng of the regt",
    );
  });

  it("marks custom entries as requiring review", () => {
    expect(
      dataset.statistics.entries_requiring_review,
    ).toBe(dataset.entries.filter((entry) => entry.quality.confidence !== "high").length);
    expect(dataset.statistics.entries_requiring_review).toBeGreaterThan(0);
    const result = engine.convertForward("away centrally under the arrangements");
    expect(result.warnings.some((warning) => warning.includes("medium-confidence"))).toBe(true);
  });

  it("keeps the whole review example converting to the expected output", () => {
    const result = engine.convertForward(
      "Depending on the tactical situation, the command and administrative parts may be  separated, and the later part may be established away centrally under the regimental arrangements.",
    );
    expect(result.convertedText).toBe(
      "Depending on the tac sit, the comd and admin parts may be  separated, and the later part may be estb away cen under the regt arng.",
    );
  });
});
