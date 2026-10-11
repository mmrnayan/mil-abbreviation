import rawDataset from "../../public/data/Bangladesh_Services_Abbreviation_Converter_Dataset.json";
import { ConverterEngine, setDefaultDataset } from "@/engine/converter";
import type { AbbreviationDataset, AbbreviationEntry } from "@/engine/types";

export const dataset = rawDataset as unknown as AbbreviationDataset;
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
