import { describe, expect, it } from "vitest";
import { engine } from "./testDataset";

describe("dataset-declared variants", () => {
  it.each(["Inform", "Informs", "Informed", "Informing", "Information"])(
    "converts the declared %s variant",
    (variant) => {
      expect(engine.convertForward(variant).convertedText).toBe("info");
    },
  );

  it("does not invent undeclared grammatical forms", () => {
    expect(engine.convertForward("Informer").convertedText).toBe("Informer");
  });

  it("matches across repeated spaces while leaving unrelated formatting alone", () => {
    expect(
      engine.convertForward("The Air   Defence Operations Centre informed him.")
        .convertedText,
    ).toBe("The ADOC info him.");
  });
});
