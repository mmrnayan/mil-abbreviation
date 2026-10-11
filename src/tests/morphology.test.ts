import { describe, expect, it } from "vitest";
import { engine } from "./testDataset";

const convert = (text: string) => engine.convertForward(text).convertedText;

describe("Paragraph 0241b(1) composite nouns, verbs, prefixes and suffixes", () => {
  it("abbreviates the authorized part of leadership", () => {
    expect(convert("leadership")).toBe("ldrship");
  });

  it("abbreviates the authorized part of demobilize and its tenses", () => {
    expect(convert("demobilize")).toBe("demob");
    expect(convert("demobilized")).toBe("demob");
    expect(convert("demobilizing")).toBe("demob");
  });

  it("abbreviates the authorized part of minefield", () => {
    expect(convert("minefield")).toBe("minefd");
  });

  it("keeps the authorized prefix abbreviation for counter attack", () => {
    expect(convert("Counter attack")).toBe("C attk");
  });
});

describe("Paragraph 0241b(4) verb rule", () => {
  it.each([
    "support",
    "supports",
    "supported",
    "supporting",
    "supporter",
    "supporters",
    "supportive",
  ])("uses sp for %s", (form) => {
    expect(convert(form)).toBe("sp");
  });

  it.each(["follow", "follows", "followed", "following", "follower", "followers"])(
    "uses fol for %s",
    (form) => {
      expect(convert(form)).toBe("fol");
    },
  );

  it("uses the same abbreviation for mobilize and its tenses", () => {
    expect(convert("mobilize")).toBe("mob");
    expect(convert("mobilized")).toBe("mob");
    expect(convert("mobilizing")).toBe("mob");
  });

  it("does not apply restricted derivatives to their base words", () => {
    expect(convert("build")).not.toBe("bldg");
    expect(convert("retiring")).not.toBe("retd");
    expect(convert("addition")).not.toBe("addl");
    expect(convert("buildings")).not.toContain("bldg");
  });

  it("leaves words without an authorized root unchanged", () => {
    expect(convert("uninformed butterfly")).toBe(
      "uninformed butterfly",
    );
  });
});

describe("Paragraph 0241b(3) plurals", () => {
  it("keeps the rat abbreviation for both singular and plural", () => {
    expect(convert("ration")).toBe("rat");
    expect(convert("rations")).toBe("rat");
  });

  it("adds the plural s at the end of a noun phrase abbreviation", () => {
    expect(convert("General Officers Commanding")).toBe("GOCs");
  });

  it("finds the pluralized phrase inside a longer sentence", () => {
    expect(
      convert("The General Officers Commanding attended the conference."),
    ).toBe("The GOCs atnd the conf.");
  });

  it("adds the plural s to authorized noun abbreviations", () => {
    expect(convert("leaders")).toBe("ldrs");
  });
});

describe("Paragraph 0241b(4) exact-exception rule", () => {
  it("uses bldg only for building", () => {
    expect(convert("building")).toBe("bldg");
  });

  it("uses retd only for retired", () => {
    expect(convert("retired")).toBe("retd");
  });

  it("uses addl only for additional", () => {
    expect(convert("additional")).toBe("addl");
  });
});

describe("Paragraph 0241 Section 6 full-sentence conversion", () => {
  it("converts every authorized expression in the sentence", () => {
    expect(
      convert("The Air Defence Operations Centre informed the Commanding Officer."),
    ).toBe("The ADOC info the CO.");
  });

  it("converts the required leadership sentence", () => {
    expect(
      convert("The leadership supported the Commanding Officer."),
    ).toBe("The ldrship sp the CO.");
  });

  it("preserves punctuation and spacing exactly", () => {
    const output = convert(
      "The leadership supported the Commanding Officer; the Officer concurred.",
    );
    expect(output).not.toContain("  ");
    expect(output).toContain(";");
  });
});

describe("Composite dataset records (CTE/F/G/U and similar)", () => {
  it("converts each Commander Task phrase to its own abbreviation", () => {
    expect(convert("Commander Task Element")).toBe("CTE");
    expect(convert("Commander Task Force")).toBe("CTF");
    expect(convert("Commander Task Group")).toBe("CTG");
    expect(convert("Commander Task Unit")).toBe("CTU");
  });

  it("leaves the lone words force and unit unchanged", () => {
    expect(convert("unit")).toBe("unit");
    expect(convert("units")).toBe("units");
    expect(convert("force")).toBe("force");
    expect(convert("forces")).toBe("forces");
    // "element" is separately authorized: Element (al)(ary) -> elm.
  });

  it("still converts words with their own authorized entries", () => {
    // Vehicle/Vehicular -> veh is a separate authorized entry.
    expect(convert("vehicle")).toBe("veh");
    // Group (ed/ing) -> gp with the verb rule from its notation.
    expect(convert("group")).toBe("gp");
    expect(convert("groups")).toBe("gp");
    expect(convert("grouped")).toBe("gp");
  });

  it("does not match stray bare-word variants of other composite entries", () => {
    expect(convert("very")).toBe("very");
    expect(convert("short")).toBe("short");
    expect(convert("utility")).toBe("utility");
  });
});

describe("Paragraph 0241 replacement metadata", () => {
  it("records which rule produced each replacement", () => {
    // "supports" is not a dataset variant, so the verb rule generates it.
    const result = engine.convertForward(
      "The leadership supports the Commanding Officer.",
    );
    const rules = result.replacements.map((replacement) => replacement.rule);
    expect(rules).toContain("compound-suffix");
    expect(rules).toContain("verb-derivative");
    expect(rules).toContain("exact-authorized");
    // Generated replacements must record the root they were built from.
    expect(
      result.replacements
        .filter((r) => !r.rule.startsWith("exact"))
        .every((r) => Boolean(r.normalizedRoot)),
    ).toBe(true);
  });

  it("flags generated compounds whose meaning may be unclear", () => {
    const result = engine.convertForward("The minefield was cleared.");
    const minefield = result.replacements.find(
      (replacement) => replacement.sourceText === "minefield",
    );
    expect(minefield?.confidence).toBe("needs-review");
    expect(result.warnings.some((warning) => warning.includes("review"))).toBe(
      true,
    );
  });
});

describe("Paragraph 0241b(7) compass point protection", () => {
  it("never abbreviates the four cardinal points", () => {
    expect(convert("north")).toBe("north");
    expect(convert("south")).toBe("south");
    expect(convert("east")).toBe("east");
    expect(convert("west")).toBe("west");
    // Sentence-initial replacements keep sentence case (Paragraph 0241);
    // the lowercase "west" mid-sentence is untouched.
    expect(convert("Advance to the north and west.")).toBe(
      "Adv to the north and west.",
    );
  });
});

describe("Paragraph 0241b(8) capitalization preservation", () => {
  it("keeps the authorized casing of abbreviations", () => {
    expect(convert("Attack")).toBe("Attk");
    expect(convert("Leader")).toBe("Ldr");
    expect(convert("Air Defence Operations Centre")).toBe("ADOC");
  });
});
