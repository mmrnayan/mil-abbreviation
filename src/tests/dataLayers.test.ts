import { describe, expect, it } from "vitest";
import baseJson from "../../public/data/abbreviations.base.json";
import rulesJson from "../../public/data/abbreviation-rules.json";
import overridesJson from "../../public/data/abbreviation-overrides.json";
import {
  composeDataset, composeRulesOverlay,
  type AuthoritativeDictionary, type LanguageRules, type OverridesLayer,
} from "@/engine/datasetLayers";
import { configureRulesOverlay } from "@/engine/rulesOverlay";
import { ConverterEngine } from "@/engine/converter";

const base = baseJson as unknown as AuthoritativeDictionary;
const rules = rulesJson as unknown as LanguageRules;
const overrides = overridesJson as unknown as OverridesLayer;

describe("reviewed data layer composition", () => {
  it("does not invent standalone fragments from shared-prefix slash notation", () => {
    const isolated = structuredClone(base);
    isolated.entries = [{
      id: "shared", full_form: "Humanitarian Assistance and Disaster Relief/Response",
      abbreviation: "HADR", annex: "A", source: "Section 16", verified: true,
    }];
    const composed = composeDataset(isolated, rules, { ...overrides, overrides: [] });
    expect(composed.entries[0].match_variants).not.toContain("Response");
  });

  it("materializes paired alternatives for forward and reverse conversion", () => {
    const isolated = structuredClone(base);
    isolated.entries = [{
      id: "task", full_form: "Commander Task Element/Force", abbreviation: "CTE/F",
      annex: "A", source: "Section 16", verified: true,
    }];
    const emptyRules = { ...rules, rules: [] };
    const split: OverridesLayer = { ...overrides, overrides: [{
      entry_id: "task", input: "Commander Task Element/Force", output: "CTE/F",
      rule: "split_entry", reason: "Printed paired alternatives",
      parts: [
        { full_form: "Commander Task Element", abbreviation: "CTE" },
        { full_form: "Commander Task Force", abbreviation: "CTF" },
      ],
    }] };
    const composed = composeDataset(isolated, emptyRules, split);
    configureRulesOverlay(composeRulesOverlay(emptyRules, split, composed));
    const engine = new ConverterEngine(composed);
    expect(engine.convertForward("Commander Task Force").convertedText).toBe("CTF");
    expect(engine.convertReverse("CTF").convertedText).toBe("Commander Task Force");
    expect(composed.entries.map((entry) => entry.id)).toEqual(["task", "task#2"]);
  });

  it("rejects duplicate authoritative IDs instead of silently selecting a record", () => {
    const broken = structuredClone(base);
    broken.entries[1].id = broken.entries[0].id;
    expect(() => composeDataset(broken, rules, overrides)).toThrow("Duplicate authoritative entry id");
  });

  it("rejects rule abbreviations that disagree with their authorized entry", () => {
    const composed = composeDataset(base, rules, overrides);
    const broken = structuredClone(rules);
    broken.rules[0].abbreviation = "unapproved";
    expect(() => composeRulesOverlay(broken, overrides, composed)).toThrow("authorizes");
  });

  it("uses the configured rule permissions and exposes usable reverse meanings", () => {
    const composed = composeDataset(base, rules, overrides);
    const overlay = composeRulesOverlay(rules, overrides, composed);
    expect(overlay.default_allowed_rules).toEqual(rules.default_behaviour.allowed_rules);
    for (const rule of rules.rules) {
      if (!rule.entry_id) continue;
      expect(overlay.entry_rules?.[rule.entry_id]).toEqual(rule.allowed_rules);
    }
    const support = composed.entries.find((entry) => entry.abbreviation === "sp" && entry.full_form.startsWith("Support"));
    expect(support?.meanings).toContain("Support");
    expect(support?.meanings.some((meaning) => meaning.includes("/"))).toBe(false);
  });
});

describe("declared grammatical examples", () => {
  it("converts every example with the rule's authorized service scope", () => {
    const composed = composeDataset(base, rules, overrides);
    const overlay = composeRulesOverlay(rules, overrides, composed);
    configureRulesOverlay(overlay);
    const engine = new ConverterEngine(composed);
    const failures: string[] = [];
    for (const rule of rules.rules) {
      const target = rule.entry_id
        ? composed.entries.find((entry) => entry.id === rule.entry_id)
        : composed.entries.find((entry) => entry.match_variants.some((variant) => variant.toLowerCase() === rule.root));
      for (const [input, expected] of Object.entries(rule.examples)) {
        const actual = engine.convertForward(input, { service: target?.service ?? "all" }).convertedText;
        if (actual !== expected) failures.push(`${rule.root}: ${input} → ${actual}; expected ${expected}`);
      }
    }
    expect(failures).toEqual([]);
  });
});
