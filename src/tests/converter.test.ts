import { describe, expect, it } from "vitest";
import {
  convertFullFormToAbbreviation,
  ConverterEngine,
} from "@/engine/converter";
import { createSyntheticDataset, engine, syntheticEntry } from "./testDataset";

describe("full sentence conversion", () => {
  it("converts every authorized match in the mandatory sentence", () => {
    expect(
      convertFullFormToAbbreviation(
        "The Air Defence Operations Centre informed the Commanding Officer.",
      ),
    ).toBe("The ADOC info the CO.");
  });

  it("continues after the first replacement", () => {
    expect(
      convertFullFormToAbbreviation(
        "The Major informed the Commanding Officer about the After Action Review.",
      ),
    ).toBe("The Maj info the CO about the AAR.");
  });

  it("prefers the longest authorized phrase", () => {
    const result = engine.convertForward("Air Defence Operations Centre");
    expect(result.convertedText).toBe("ADOC");
    expect(result.replacements).toHaveLength(1);
    expect(result.replacements[0].sourceText).toBe(
      "Air Defence Operations Centre",
    );
  });

  it("preserves punctuation exactly", () => {
    expect(
      engine.convertForward(
        "The Commanding Officer, after the inspection, informed the Major.",
      ).convertedText,
    ).toBe("The CO, after the insp, info the Maj.");
  });

  it("introduces neither extra spaces nor a duplicate full stop", () => {
    const output = engine.convertForward(
      "The Major informed the Commanding Officer.",
    ).convertedText;
    expect(output).toBe("The Maj info the CO.");
    expect(output).not.toContain("  ");
    expect(output).not.toContain("..");
  });

  it("honours case-insensitive entry configuration", () => {
    expect(
      engine.convertForward(
        "the air defence operations centre INFORMED the commanding officer.",
      ).convertedText,
    ).toBe("the ADOC info the CO.");
  });

  it("does not replace inside unrelated words", () => {
    expect(engine.convertForward("uninformed butterfly").convertedText).toBe(
      "uninformed butterfly",
    );
  });

  it("protects existing authorized abbreviations while converting the rest", () => {
    expect(
      engine.convertForward("The ADOC informed the CO.").convertedText,
    ).toBe("The ADOC info the CO.");
  });

  it("protects URLs and email addresses", () => {
    const source =
      "Visit https://example.com/Information and email Information@example.com.";
    expect(engine.convertForward(source).convertedText).toBe(source);
  });

  it("leaves unknown text unchanged", () => {
    const source = "A completely ordinary sentence.";
    expect(engine.convertForward(source).convertedText).toBe(source);
  });

  it("converts multiple occurrences", () => {
    expect(engine.convertForward("Major informed Major.").convertedText).toBe(
      "Maj info Maj.",
    );
  });

  it("does not cascade into unintended secondary replacements", () => {
    const synthetic = createSyntheticDataset([
      syntheticEntry("one", "Alpha", "Bravo"),
      syntheticEntry("two", "Bravo", "Charlie"),
    ]);
    expect(new ConverterEngine(synthetic).convertForward("Alpha").convertedText).toBe(
      "Bravo",
    );
  });

  it("returns an empty successful result for empty input", () => {
    const result = engine.convertForward("");
    expect(result.convertedText).toBe("");
    expect(result.replacements).toEqual([]);
    expect(result.ambiguities).toEqual([]);
    expect(result.unresolved).toEqual([]);
  });
});
