import { describe, expect, it } from "vitest";
import { engine } from "./testDataset";

describe("dataset-declared variants", () => {
  it.each(["Inform", "Informs", "Informed", "Informing", "Information"])(
    "converts the declared %s variant",
    (variant) => {
      // Sentence-initial replacement keeps sentence case (Paragraph 0241).
      expect(engine.convertForward(variant).convertedText).toBe("Info");
    },
  );

  it("generates agent-noun verb derivatives under the Paragraph 0241 verb rule", () => {
    expect(engine.convertForward("Informer").convertedText).toBe("Info");
  });

  it("still leaves unrelated words untouched", () => {
    expect(engine.convertForward("uninformed butterfly").convertedText).toBe(
      "uninformed butterfly",
    );
  });

  it("matches across repeated spaces while leaving unrelated formatting alone", () => {
    expect(
      engine.convertForward("The Air   Defence Operations Centre informed him.")
        .convertedText,
    ).toBe("The ADOC info him.");
  });
});
