/**
 * Typed access to the paragraph 0241 rules overlay. The overlay only declares
 * linguistic behaviour; authoritative abbreviation meanings stay in the base
 * layer. The overlay is composed at load time from abbreviation-rules.json
 * and abbreviation-overrides.json (see engine/datasetLayers) and registered
 * through configureRulesOverlay before any engine is constructed.
 */
export interface ForwardOverride {
  variants: string[];
}

/** One authoritative form produced by splitting a composite dataset entry. */
export interface EntrySplitPart {
  full_form: string;
  abbreviation: string;
}

export interface AbbreviationRulesOverlay {
  version: string;
  description?: string;
  /** Entries used only for their exact authorized word; no derivatives are generated. */
  exact_only_entry_ids: string[];
  /** Entries authorized in the present indefinite (base) verb form. */
  verb_entry_ids: string[];
  /** Entries whose abbreviation already covers both singular and plural. */
  plural_invariant_entry_ids: string[];
  /** Measurement abbreviations, which never change in the plural. */
  measurement_entry_ids: string[];
  /**
   * Entries allowed to act as compound roots. An empty list means every
   * single-word, conversion-enabled entry may serve as a root.
   */
  compound_enabled_entry_ids: string[];
  /** Words that must never be abbreviated, e.g. the four cardinal compass points. */
  protected_words: string[];
  /** Irregular inflected form to base-form mapping, e.g. "withdrew" -> "withdraw". */
  irregular_forms: Record<string, string>;
  compound_affixes: {
    prefixes: string[];
    suffixes: string[];
  };
  /** Common words that may head a closed compound, e.g. "mine" in "minefield". */
  compound_head_words: string[];
  /** Forward-conversion overrides for dataset entries disabled by default. */
  forward_overrides: Record<string, ForwardOverride>;
  /**
   * Composite dataset entries (e.g. CTE/F/G/U) replaced by their individual
   * authorized forms, so each phrase converts to its own abbreviation.
   */
  entry_splits: Record<string, EntrySplitPart[]>;
  /** Allowed grammatical operations for roots with an explicit rule. */
  entry_rules?: Record<string, string[]>;
  /** Curated examples of grammatical surfaces, used for reverse choices. */
  entry_variants?: Record<string, string[]>;
  /** Operations inherited by entries without an explicit root rule. */
  default_allowed_rules?: string[];
  document_policies: Record<string, unknown>;
}

const EMPTY_OVERLAY: AbbreviationRulesOverlay = {
  version: "0.0.0",
  exact_only_entry_ids: [],
  verb_entry_ids: [],
  plural_invariant_entry_ids: [],
  measurement_entry_ids: [],
  compound_enabled_entry_ids: [],
  protected_words: [],
  irregular_forms: {},
  compound_affixes: { prefixes: [], suffixes: [] },
  compound_head_words: [],
  forward_overrides: {},
  entry_splits: {},
  document_policies: {},
};

let rulesOverlay: AbbreviationRulesOverlay = EMPTY_OVERLAY;

/**
 * Registers the overlay composed from the language-rules and overrides
 * layers. Must be called before any ConverterEngine is constructed.
 */
export function configureRulesOverlay(overlay: AbbreviationRulesOverlay): void {
  rulesOverlay = overlay;
}

export { rulesOverlay };

import type { AbbreviationEntry } from "./types";

/**
 * Applies the overlay's forward overrides: entries the dataset ships with
 * conversion disabled (e.g. annex B multiple-meaning records) but which
 * Paragraph 0241 requires for forward conversion, restricted to the given
 * authorized variants. Original dataset records are left untouched.
 */
export function applyForwardOverrides(
  entries: readonly AbbreviationEntry[],
  overlay: AbbreviationRulesOverlay,
): AbbreviationEntry[] {
  return entries.flatMap((entry) => {
    const parts = overlay.entry_splits[entry.id];
    if (parts) {
      return parts.map((part, index) => ({
        ...entry,
        id: `${entry.id}#${index + 1}`,
        full_form: part.full_form,
        abbreviation: part.abbreviation,
        meanings: [part.full_form],
        match_variants: [part.full_form],
        conversion_enabled: true,
      }));
    }
    const override = overlay.forward_overrides[entry.id];
    if (!override) return [entry];
    return [
      {
        ...entry,
        conversion_enabled: true,
        match_variants: override.variants,
      },
    ];
  });
}
