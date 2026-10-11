import { describe, expect, it } from "vitest";
import { configureRulesOverlay, rulesOverlay } from "@/engine/rulesOverlay";
import { ConverterEngine } from "@/engine/converter";
import { dataset } from "./testDataset";

describe("rules overlay guard", () => {
  it("refuses to construct an engine without a configured overlay", () => {
    const configured = rulesOverlay;
    try {
      // Simulate a fresh module realm (e.g. a web worker) where the overlay
      // was never registered — the engine must fail loudly instead of
      // silently dropping every paragraph 0241 morphology rule.
      configureRulesOverlay({ ...configured, version: "0.0.0" });
      expect(() => new ConverterEngine(dataset)).toThrow(
        /rules overlay is not configured/u,
      );
    } finally {
      configureRulesOverlay(configured);
    }
  });
});
