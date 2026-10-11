import { describe, expect, it } from "vitest";
import { buildConversionFeedback, readConversionFeedbackContext } from "@/utils/conversionFeedback";
import { engine } from "./testDataset";

describe("conversion feedback evidence", () => {
  it("captures the displayed conversion, scope and rule evidence", () => {
    const result = engine.convertForward("deployed", { service: "navy", context: "operational-writing" });
    const payload = buildConversionFeedback({ result, datasetVersion: "reviewed-version" }, "deployment", "Check the meaning");
    expect(payload.category).toBe("incorrect-conversion");
    expect(payload.context).toMatchObject({ input: "deployed", actual: "depl", expected: "deployment", direction: "full-to-abbreviation", datasetVersion: "reviewed-version", filters: { service: "navy", context: "operational-writing" } });
    expect(payload.context.replacementEvidence[0]).toMatchObject({ rule: "verb-derivative", normalizedRoot: "deploy" });
    expect(readConversionFeedbackContext(payload.context)).toEqual(payload.context);
  });

  it("allows reports without a suggested correction", () => {
    const seed = { result: engine.convertForward("deploy") };
    expect(buildConversionFeedback(seed).context.expected).toBe("");
    expect(buildConversionFeedback(seed, seed.result.convertedText).context.expected).toBe("depl");
  });

  it("rejects malformed records and ignores invalid scope and evidence", () => {
    expect(readConversionFeedbackContext({ input: "x", actual: "y", expected: "z", direction: "invalid" })).toBeUndefined();
    const context = readConversionFeedbackContext({ input: "x", actual: "y", expected: "z", direction: "abbreviation-to-full", filters: { service: "invalid", context: "unknown", annex: "Z" }, replacementEvidence: [{ rule: 1 }] });
    expect(context?.filters).toEqual({});
    expect(context?.replacementEvidence).toEqual([]);
  });
});
