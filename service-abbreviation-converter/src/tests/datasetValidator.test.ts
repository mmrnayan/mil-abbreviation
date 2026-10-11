import { describe, expect, it } from "vitest";
import { validateDataset } from "@/engine/datasetValidator";
import { dataset } from "./testDataset";

describe("dataset validation", () => {
  it("accepts the supplied schema 1.1.0 dataset", () => {
    const result = validateDataset(dataset);
    expect(result.valid).toBe(true);
    expect(result.entryCount).toBe(2633);
    expect(result.diagnostics.some((item) => item.code === "MEDIUM_CONFIDENCE_RECORDS")).toBe(true);
  });

  it("rejects duplicate entry IDs and broken references", () => {
    const broken = structuredClone(dataset);
    broken.entries[1].id = broken.entries[0].id;
    broken.converter_config.replacement_entry_ids[0] = "missing-entry";
    broken.conflicts[0].entry_ids.push("missing-conflict-entry");
    const result = validateDataset(broken);
    expect(result.valid).toBe(false);
    expect(result.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "DUPLICATE_ENTRY_ID",
        "UNKNOWN_REPLACEMENT_ENTRY_ID",
        "UNKNOWN_CONFLICT_ENTRY_ID",
      ]),
    );
  });

  it("rejects duplicate variants within an entry", () => {
    const broken = structuredClone(dataset);
    broken.entries[0].match_variants.push(
      broken.entries[0].match_variants[0].toUpperCase(),
    );
    const result = validateDataset(broken);
    expect(result.valid).toBe(false);
    expect(result.diagnostics.some((item) => item.code === "DUPLICATE_MATCH_VARIANT")).toBe(true);
  });
});
