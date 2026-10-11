import { describe, expect, it } from "vitest";
import { ConverterEngine } from "@/engine/converter";
import { configureRulesOverlay, rulesOverlay } from "@/engine/rulesOverlay";
import { createSyntheticDataset, engine, syntheticEntry } from "./testDataset";

describe("audited grammatical conversions", () => {
  it.each([
    ["authorizes", "auth"], ["canalizes", "cnz"], ["generalizes", "gen"],
    ["mechanizes", "mech"], ["organizes", "org"], ["recognizes", "recog"],
    ["specializes", "spl"], ["standardizes", "std"], ["synchronizes", "sync"],
    ["utilizes", "ut"], ["mobilizes", "mob"],
  ])("uses the authorized verb for %s", (input, expected) => {
    expect(engine.convertForward(input).convertedText).toBe(expected);
  });

  it.each([
    ["authorization", "auth"], ["allocation", "alloc"], ["mobilization", "mob"],
    ["abbreviation", "abbr"], ["supporter", "sp"], ["supportive", "sp"],
  ])("recognizes the derivative %s without unrestricted substring matching", (input, expected) => {
    expect(engine.convertForward(input).convertedText).toBe(expected);
  });

  it("leaves words outside authorized families unchanged", () => {
    const source = "uninformed butterfly mother";
    expect(engine.convertForward(source).convertedText).toBe(source);
  });

  it("applies an approved noun compound prefix and records its uncertainty", () => {
    const result = engine.convertForward("postinspection");
    expect(result.convertedText).toBe("postinsp");
    expect(result.replacements[0].rule).toBe("compound-prefix");
    expect(result.replacements[0].confidence).toBe("medium");
  });

  it.each([
    ["controlled controlling", "ctrl ctrl"],
    ["patrolled patrolling", "ptl ptl"],
    ["propelled propelling", "prop prop"],
  ])("recognizes doubled final consonants in %s", (input, expected) => {
    expect(engine.convertForward(input).convertedText).toBe(expected);
  });

  it.each(["General  Officers Commanding", "General\nOfficers Commanding", "General\tOfficers Commanding"])(
    "recognizes plural phrases with arbitrary whitespace: %s", (input) => {
      expect(engine.convertForward(input).convertedText).toBe("GOCs");
    },
  );

  it("does not let a later protected abbreviation block an earlier plural phrase", () => {
    expect(engine.convertForward("General Officers Commanding and CAS").convertedText).toBe("GOCs and CAS");
  });

  it("uses the selected service consistently for exact and plural forms", () => {
    expect(engine.convertForward("commander commanders", { service: "navy" }).convertedText).toBe("Cdr Cdrs");
  });

  it("preserves the confidence of a generated plural", () => {
    const entry = syntheticEntry("audit-widget", "Widget", "wgt");
    entry.quality.confidence = "medium";
    const result = new ConverterEngine(createSyntheticDataset([entry])).convertForward("widgets");
    expect(result.convertedText).toBe("wgts");
    expect(result.replacements[0].confidence).toBe("medium");
    expect(result.warnings.join(" ")).toMatch(/medium-confidence/u);
  });

  it("executes explicit rule scopes instead of inheriting every operation", () => {
    const configured = rulesOverlay;
    const support = syntheticEntry("audit-support", "Support", "sp");
    const leader = syntheticEntry("audit-leader", "Leader", "ldr");
    try {
      configureRulesOverlay({
        ...configured,
        verb_entry_ids: [...configured.verb_entry_ids, support.id],
        entry_rules: { ...configured.entry_rules, [support.id]: [], [leader.id]: ["noun_plural"] },
      });
      const scoped = new ConverterEngine(createSyntheticDataset([support, leader]));
      expect(scoped.convertForward("support supported supporters leadership leaders").convertedText)
        .toBe("sp supported supporters leadership ldrs");
    } finally {
      configureRulesOverlay(configured);
    }
  });

  it("prefers the complete authorized verb over a shorter prefixed root", () => {
    const configured = rulesOverlay;
    const form = syntheticEntry("audit-form", "Form", "fm");
    const reform = syntheticEntry("audit-reform", "Reform", "ref");
    try {
      configureRulesOverlay({
        ...configured,
        verb_entry_ids: [...configured.verb_entry_ids, form.id, reform.id],
        entry_rules: {
          ...configured.entry_rules,
          [form.id]: ["verb_forms", "compound_prefix"],
          [reform.id]: ["verb_forms", "compound_prefix"],
        },
      });
      const scoped = new ConverterEngine(createSyntheticDataset([form, reform]));
      expect(scoped.convertForward("reformed reforming").convertedText).toBe("ref ref");
    } finally {
      configureRulesOverlay(configured);
    }
  });
});
