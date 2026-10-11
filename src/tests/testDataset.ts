import baseLayer from "../../public/data/abbreviations.base.json";
import rulesLayer from "../../public/data/abbreviation-rules.json";
import overridesLayer from "../../public/data/abbreviation-overrides.json";
import {
  composeDataset,
  composeRulesOverlay,
  type AuthoritativeDictionary,
  type LanguageRules,
  type OverridesLayer,
} from "@/engine/datasetLayers";
import { configureRulesOverlay } from "@/engine/rulesOverlay";
import { ConverterEngine, setDefaultDataset } from "@/engine/converter";
import type { AbbreviationDataset, AbbreviationEntry } from "@/engine/types";

const base = baseLayer as unknown as AuthoritativeDictionary;
const rules = rulesLayer as unknown as LanguageRules;
const overrides = overridesLayer as unknown as OverridesLayer;

export const dataset: AbbreviationDataset = composeDataset(base, rules, overrides);
configureRulesOverlay(composeRulesOverlay(rules, overrides, dataset));
export const engine = new ConverterEngine(dataset);
setDefaultDataset(dataset);

export function createSyntheticDataset(
  entries: AbbreviationEntry[],
): AbbreviationDataset {
  return {
    ...dataset,
    entries,
    conflicts: [],
    converter_config: {
      ...dataset.converter_config,
      replacement_entry_ids: entries
        .filter((entry) => entry.conversion_enabled)
        .map((entry) => entry.id),
    },
    statistics: {
      entry_count: entries.length,
      conflicting_abbreviation_count: 0,
      entries_by_annex: { A: entries.length },
      entries_requiring_review: 0,
    },
  };
}

export function syntheticEntry(
  id: string,
  fullForm: string,
  abbreviation: string,
  variants: string[] = [fullForm],
): AbbreviationEntry {
  return {
    id,
    full_form: fullForm,
    abbreviation,
    annex: "A",
    category: "general",
    service: "tri-service",
    ambiguous: false,
    meanings: [fullForm],
    aliases: [],
    match_variants: variants,
    conversion_enabled: true,
    match: {
      case_sensitive: false,
      whole_phrase: true,
      word_boundary: true,
      priority: fullForm.split(/\s+/u).length,
    },
    quality: { confidence: "high" },
  };
}
