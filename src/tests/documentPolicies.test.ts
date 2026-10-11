import { describe, expect, it } from "vitest";
import { ConverterEngine } from "@/engine/converter";
import {
  applyFormattingEdits,
  documentPolicyAllowsEntry,
  personnelFormattingEdits,
} from "@/engine/documentPolicies";
import { createSyntheticDataset, engine, syntheticEntry } from "./testDataset";
import type { WritingContext } from "@/engine/types";

describe("source document policies", () => {
  it.each<WritingContext>(["civilian-external-correspondence", "allied-forces-correspondence", "foreign-correspondence"])("retains full text for %s", (context) => {
    const original = "The Commanding Officer  deployed north-east.\nhttps://example.com/North";
    const result = engine.convertForward(original, { context });
    expect(result.convertedText).toBe(original);
    expect(result.replacements).toHaveLength(0);
    expect(result.warnings.some((warning) => warning.includes("excluded"))).toBe(true);
  });

  it("keeps operational paragraph headings in full", () => {
    const original = "1. Administration and Logistics";
    expect(engine.convertForward(original, { context: "operational-heading" }).convertedText).toBe(original);
  });

  it.each<WritingContext>(["formal-letter", "demi-official-letter", "commanded-letter", "service-paper"])("restricts %s to source exceptions", (context) => {
    const ordinary = syntheticEntry("ordinary", "Deployment", "depl");
    const arm = { ...syntheticEntry("arm", "Infantry", "Inf"), annex: "F", subcategory: "regiment" };
    const decoration = { ...syntheticEntry("medal", "Service Medal", "SM"), subcategory: "decoration" };
    const qualification = { ...syntheticEntry("qualification", "Qualified Staff", "psc"), subcategory: "qualification" };
    expect(documentPolicyAllowsEntry(ordinary, { context }, {})).toBe(false);
    for (const exception of [arm, decoration, qualification]) expect(documentPolicyAllowsEntry(exception, { context }, {})).toBe(true);
    const converter = new ConverterEngine(createSyntheticDataset([ordinary, arm]));
    expect(converter.convertForward("Deployment Infantry", { context }).convertedText).toBe("Deployment Inf");
  });

  it("requires the Air Force for the operational service-paper exception", () => {
    const entry = syntheticEntry("ordinary", "Deployment", "depl");
    expect(documentPolicyAllowsEntry(entry, { context: "air-force-operational-paper", service: "army" }, {})).toBe(false);
    expect(documentPolicyAllowsEntry(entry, { context: "air-force-operational-paper", service: "air-force" }, {})).toBe(true);
  });

  it("permits abbreviations for operational para-military addressees", () => {
    expect(engine.convertForward("We deploy.", { context: "paramilitary-operational-writing" }).convertedText).toBe("We depl.");
  });

  it("keeps complete senior Navy ranks in the address box", () => {
    expect(engine.convertForward("Admiral of the Fleet", { context: "address-box", service: "navy" }).convertedText).toBe("Admiral of the Fleet");
    expect(engine.convertForward("Commodore", { context: "address-box", service: "navy" }).convertedText).toBe("Commodore");
  });

  it("uses lowercase cardinals and authorized intermediate initials without altering URLs", () => {
    expect(engine.convertForward("North, SOUTH and west; northeast, south-southwest. https://example.com/North").convertedText)
      .toBe("north, south and west; NE, SSW. https://example.com/North");
  });

  it("uses an ampersand only in the requested departmental-title context", () => {
    expect(engine.convertForward("Messrs Rahman and Sons", { context: "departmental-title" }).convertedText).toBe("Messrs Rahman & Sons");
    expect(engine.convertForward("Rahman and Sons").convertedText).toBe("Rahman and Sons");
  });

  it("gives a longer approved proper title precedence over compass rules", () => {
    const title = syntheticEntry("proper-title", "North East Frontier Agency", "NEFA");
    const converter = new ConverterEngine(createSyntheticDataset([title]));
    expect(converter.convertForward(title.full_form).convertedText).toBe("NEFA");
  });

  it("retains a disallowed full title instead of converting an embedded allowed arm", () => {
    const title = syntheticEntry("title", "Infantry Training Centre", "ITC");
    const arm = { ...syntheticEntry("arm", "Infantry", "Inf"), annex: "F", subcategory: "regiment" };
    const converter = new ConverterEngine(createSyntheticDataset([title, arm]));
    expect(converter.convertForward(title.full_form, { context: "formal-letter" }).convertedText).toBe(title.full_form);
  });

  it("formats initials and qualification separators only on recognizable personnel lines", () => {
    const rank = { ...syntheticEntry("rank", "Brigadier General", "Brig Gen"), subcategory: "rank" };
    const entries = [rank];
    const line = "Brig Gen H. M. Masihur Rahman S.G.P. S.P.P. n.d.c. a.f.w.c. p.s.c.";
    const policies = { allowed_exception_entry_ids: ["sgp", "spp"] };
    entries.push({ ...syntheticEntry("sgp", "Sena Gaurab Padak", "SGP"), subcategory: "decoration" });
    entries.push({ ...syntheticEntry("spp", "Sena Parodorshita Padak", "SPP"), subcategory: "decoration" });
    expect(applyFormattingEdits(line, personnelFormattingEdits(line, entries, policies)))
      .toBe("Brig Gen H M Masihur Rahman, SGP, SPP, ndc, afwc, psc");
    const prose = "Mr. H. M. Rahman writes at 3.5 pm. p.s.c.";
    expect(personnelFormattingEdits(prose, entries, policies)).toHaveLength(0);
    expect(engine.convertForward("H. M. Rahman p.s.c.").convertedText).toBe("H. M. Rahman p.s.c.");
  });

  it("retains valid output highlight offsets after personnel formatting", () => {
    const result = engine.convertForward("Brigadier General H. M. Rahman National Defence College", { context: "personnel-line" });
    for (const replacement of result.replacements) {
      expect(result.convertedText.slice(replacement.outputStartIndex, replacement.outputEndIndex)).toBe(replacement.replacementText);
    }
  });
});
