import { describe, expect, it } from "vitest";
import { validateDataset } from "@/engine/datasetValidator";
import { dataset } from "./testDataset";

describe("dataset validation", () => {
  it("accepts the supplied schema 1.1.0 dataset", () => {
    const result = validateDataset(dataset);
    expect(result.valid).toBe(true);
    expect(result.entryCount).toBeGreaterThan(2600);
    expect(result.entryCount).toBe(dataset.statistics.entry_count);
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

  it("rejects editorial notes and literal optional output endings", () => {
    const broken = structuredClone(dataset);
    broken.entries[0].full_form = "Note:";
    broken.entries[0].abbreviation = "Usually abbreviations are not used in an address box.";
    broken.entries[1].abbreviation = "Ref(s)";
    const result = validateDataset(broken);
    expect(result.valid).toBe(false);
    expect(result.diagnostics.map((item) => item.code)).toEqual(expect.arrayContaining([
      "SOURCE_NOTE_AS_ENTRY", "UNEXPANDED_OUTPUT_NOTATION",
    ]));
  });

  it("preserves legitimate uppercase qualification letters in abbreviations", () => {
    const valid = structuredClone(dataset);
    valid.entries[0].abbreviation = "CPO (S)";
    expect(validateDataset(valid).diagnostics.some((item) => item.code === "UNEXPANDED_OUTPUT_NOTATION")).toBe(false);
  });
});
