import { normalizeForMatch } from "./phraseTrie";
import type {
  AbbreviationDataset,
  AbbreviationEntry,
  AnnexDefinition,
  ConverterConfig,
  ConflictDefinition,
  DatasetStatistics,
} from "./types";
import type { AbbreviationRulesOverlay, EntrySplitPart } from "./rulesOverlay";

/**
 * Composition of the three curated data layers into the runtime dataset.
 *
 *   Layer A  abbreviations.base.json       — authoritative Section 16 pairs
 *   Layer B  abbreviation-rules.json       — paragraph 0241 grammatical behaviour
 *   Layer C  abbreviation-overrides.json   — special cases and corrections
 *
 * Everything the matching engine needs but the layers do not state explicitly
 * (match priority, category, ambiguous flags, conflict groups, replacement
 * ordering) is derived here from the reviewed layer data. Source pair checks
 * and extraction repairs are maintained in scripts/repair-source-data.py.
 */

export const RUNTIME_SCHEMA_VERSION = "1.1.0";

/** The abbreviation covers one specific form only; no derivatives are generated. */
const EXACT_ONLY = "exact_only";
/** A disabled (annex B) record re-enabled for forward conversion. */
const ENABLE_FORWARD = "enable_forward";
/** A composite record replaced by its individual authorized forms. */
const SPLIT_ENTRY = "split_entry";
/** Exact matchable surface forms for irregular parenthetical notation. */
const MATCH_VARIANTS = "match_variants";
/** A base entry whose full form was extracted wrongly; corrected after verification. */
const CORRECT_ENTRY = "correct_entry";
/** A reviewer-approved conversion that Section 16 does not print. */
const ADD_CONVERSION = "add_conversion";

export interface AnnexProfile {
  title: string;
  category: string;
  service: string | null;
}

export interface BaseLayerEntry {
  id: string;
  full_form: string;
  abbreviation: string;
  annex: string;
  source: string;
  verified: boolean;
  /** Stored only where the annex does not imply the service (annexes C and E). */
  service?: string;
  subcategory?: string;
  /** Extraction provenance note for reconstructed table rows. */
  note?: string;
  /** Location of the printed source row used to verify or repair this pair. */
  source_location?: Record<string, unknown>;
}

export interface AuthoritativeDictionary {
  layer: string;
  schema_version: string;
  title: string;
  description: string;
  language: string;
  generated_on: string;
  source: Record<string, unknown>;
  annexes: AnnexDefinition[];
  annex_profiles: Record<string, AnnexProfile>;
  entries: BaseLayerEntry[];
}

export interface RootRule {
  root: string;
  abbreviation: string;
  part_of_speech: string;
  allowed_rules: string[];
  examples: Record<string, string>;
  /** Present only when the root alone does not resolve to a single entry. */
  entry_id?: string;
}

export interface LanguageRules {
  layer: string;
  schema_version: string;
  description: string;
  default_behaviour: {
    part_of_speech: string;
    allowed_rules: string[];
    note: string;
  };
  global: {
    protected_words: string[];
    irregular_forms: Record<string, string>;
    compound_affixes: { prefixes: string[]; suffixes: string[] };
    compound_head_words: string[];
    document_policies: Record<string, unknown>;
    engine_config: Omit<ConverterConfig, "replacement_entry_ids">;
  };
  rules: RootRule[];
}

export interface OverrideRecord {
  input: string;
  output: string;
  rule: string;
  reason: string;
  blocked_forms?: string[];
  allowed_variants?: string[];
  match_variants?: string[];
  parts?: EntrySplitPart[];
  /** correct_entry: the verified full form replacing the extracted one. */
  corrected_full_form?: string;
  /** correct_entry: the verified abbreviation replacing the extracted one. */
  corrected_abbreviation?: string;
  /** add_conversion: annex for the reviewer-approved entry (default "A"). */
  annex?: string;
  /** Present only when (input, output) does not resolve to a single entry. */
  entry_id?: string;
}

export interface OverridesLayer {
  layer: string;
  schema_version: string;
  description: string;
  overrides: OverrideRecord[];
}

interface ResolvableRecord {
  id: string;
  full_form: string;
  abbreviation: string;
}

/** Mirror of MorphMatcher.baseWordOf: first slash/semicolon segment, parens removed. */
function baseWordOf(fullForm: string): string {
  return fullForm
    .replace(/\(([^)]*)\)/g, "")
    .replace(/\s+/g, " ")
    .split(/[\/;]/)[0]
    .trim();
}

function normalizedKey(value: string): string {
  return normalizeForMatch(value).trim();
}

/** Source notation is expanded by reviewed overrides, never by substring splitting. */
function simpleVariants(fullForm: string): string[] {
  return [fullForm];
}

function distinctForms(forms: string[]): string[] {
  const seen = new Set<string>();
  return forms.map((form) => form.trim()).filter((form) => {
    const key = normalizedKey(form);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Reverse choices name the usable forms, rather than a slash-delimited source row. */
function meaningsFor(fullForm: string, variants: string[]): string[] {
  const alternatives = distinctForms(variants).filter((variant) =>
    normalizedKey(variant) !== normalizedKey(fullForm),
  );
  if (alternatives.length && /[\/;]|\([^)]*\)/u.test(fullForm)) return alternatives;
  return distinctForms([fullForm, ...alternatives]);
}

/**
 * match.priority: highest alphanumeric token count across the variants, where
 * parenthesised groups count separately ("Article(s) in use" -> Article, s,
 * in, use = 4).
 */
function priorityOf(variants: string[]): number {
  const tokens = (value: string) =>
    value.replace(/\(([^)]*)\)/g, " $1 ").split(/[^A-Za-z0-9]+/).filter(Boolean);
  return Math.max(...variants.map((variant) => tokens(variant).length));
}

/**
 * Resolves an override record to the entry it applies to. Records carry an
 * explicit entry_id whenever (input, output) alone would be ambiguous.
 */
function resolveOverrideTarget(
  record: OverrideRecord,
  records: Map<string, ResolvableRecord>,
): ResolvableRecord {
  if (record.entry_id) {
    const entry = records.get(record.entry_id);
    if (!entry) {
      throw new Error(`Override “${record.rule}” references unknown entry “${record.entry_id}”.`);
    }
    return entry;
  }
  const input = normalizedKey(record.input);
  const output = normalizedKey(record.output);
  const matches = [...records.values()].filter(
    (entry) =>
      normalizedKey(entry.full_form) === input &&
      normalizedKey(entry.abbreviation) === output,
  );
  if (matches.length !== 1) {
    throw new Error(
      `Override “${record.rule}” for “${record.input}” resolves to ${matches.length} entries; add an entry_id.`,
    );
  }
  return matches[0];
}

/**
 * Collects the per-entry overrides keyed by entry id. Records are resolved
 * against the given entry records (the authoritative layer when composing the
 * dataset, the composed entries when composing the rules overlay).
 */
function collectOverrideMaps(overrides: OverridesLayer, records: ResolvableRecord[]): {
  variantOverrides: Map<string, string[]>;
  forwardVariants: Map<string, string[]>;
} {
  const byId = new Map<string, ResolvableRecord>(
    records.map((entry) => [entry.id, entry]),
  );
  const variantOverrides = new Map<string, string[]>();
  const forwardVariants = new Map<string, string[]>();
  for (const record of overrides.overrides) {
    if (record.rule !== MATCH_VARIANTS && record.rule !== ENABLE_FORWARD) continue;
    const target = resolveOverrideTarget(record, byId);
    if (record.rule === MATCH_VARIANTS) {
      if (!record.match_variants?.length) {
        throw new Error(`match_variants override for “${record.input}” is empty.`);
      }
      if (variantOverrides.has(target.id)) {
        throw new Error(`Entry “${target.id}” has more than one match_variants override.`);
      }
      variantOverrides.set(target.id, distinctForms(record.match_variants));
    } else if (record.rule === ENABLE_FORWARD) {
      if (!record.allowed_variants?.length) {
        throw new Error(`enable_forward override for “${record.input}” has no allowed_variants.`);
      }
      if (forwardVariants.has(target.id)) {
        throw new Error(`Entry “${target.id}” has more than one enable_forward override.`);
      }
      forwardVariants.set(target.id, distinctForms(record.allowed_variants));
    }
  }
  return { variantOverrides, forwardVariants };
}

export interface LearnedConversionPair {
  word: string;
  abbreviation: string;
  count: number;
}

const ANNEX_B_NOTE =
  "Reverse expansion requires user/context selection; never auto-expand this abbreviation.";

export function composeDataset(
  base: AuthoritativeDictionary,
  rules: LanguageRules,
  overrides: OverridesLayer,
  learnedConversions: LearnedConversionPair[] = [],
): AbbreviationDataset {
  const ids = new Set<string>();
  for (const record of base.entries) {
    if (ids.has(record.id)) throw new Error(`Duplicate authoritative entry id “${record.id}”.`);
    ids.add(record.id);
  }
  const baseById = new Map<string, ResolvableRecord>(
    base.entries.map((entry) => [entry.id, entry]),
  );
  const { variantOverrides, forwardVariants } = collectOverrideMaps(overrides, base.entries);

  // correct_entry: verified replacements for wrongly extracted full forms
  // and abbreviations, applied before any field is derived from them.
  const correctedFullForms = new Map<string, string>();
  const correctedAbbreviations = new Map<string, string>();
  const customConversions: OverrideRecord[] = [];
  for (const record of overrides.overrides) {
    if (record.rule === CORRECT_ENTRY) {
      const target = resolveOverrideTarget(record, baseById);
      if (!record.corrected_full_form?.trim() && !record.corrected_abbreviation?.trim()) {
        throw new Error(`correct_entry override for “${record.input}” has nothing to correct.`);
      }
      if (record.corrected_full_form?.trim()) {
        correctedFullForms.set(target.id, record.corrected_full_form.trim());
      }
      if (record.corrected_abbreviation?.trim()) {
        correctedAbbreviations.set(target.id, record.corrected_abbreviation.trim());
      }
    } else if (record.rule === ADD_CONVERSION) {
      customConversions.push(record);
    }
  }

  const byId = new Map<string, AbbreviationEntry>();
  const entries: AbbreviationEntry[] = base.entries.map((record) => {
    const profile = base.annex_profiles[record.annex];
    if (!profile) {
      throw new Error(`Entry “${record.id}” references undeclared annex “${record.annex}”.`);
    }
    const service = (record.service ?? profile.service) as AbbreviationEntry["service"];
    if (!service) {
      throw new Error(`Entry “${record.id}” has no service and annex ${record.annex} implies none.`);
    }
    const fullForm = correctedFullForms.get(record.id) ?? record.full_form;
    const variants = forwardVariants.get(record.id) ?? variantOverrides.get(record.id) ?? simpleVariants(fullForm);
    const meanings = meaningsFor(fullForm, variants);

    const entry: AbbreviationEntry = {
      id: record.id,
      full_form: fullForm,
      abbreviation: correctedAbbreviations.get(record.id) ?? record.abbreviation,
      annex: record.annex,
      category: profile.category,
      service,
      // Refined below: abbreviation collisions with a different full form
      // also flag an entry ambiguous.
      ambiguous: meanings.length > 1,
      meanings,
      aliases: [],
      match_variants: variants,
      conversion_enabled: record.annex !== "B" || forwardVariants.has(record.id) || variantOverrides.has(record.id),
      match: {
        case_sensitive: false,
        whole_phrase: true,
        word_boundary: true,
        priority: priorityOf(variants),
      },
      quality: { confidence: record.verified ? "high" : "medium" },
    };
    const note = record.note ?? (record.annex === "B" ? ANNEX_B_NOTE : undefined);
    if (note) entry.notes = note;
    if (record.subcategory) entry.subcategory = record.subcategory;
    byId.set(entry.id, entry);
    return entry;
  });

  // Paired alternatives must exist in both directions. Preserve the original ID
  // for the first pair, so saved choices and root rules retain their references.
  for (const record of overrides.overrides) {
    if (record.rule !== SPLIT_ENTRY) continue;
    const target = resolveOverrideTarget(record, baseById);
    const original = byId.get(target.id)!;
    if (!record.parts?.length) throw new Error(`split_entry override for “${record.input}” has no parts.`);
    const parts = record.parts.map((part, index): AbbreviationEntry => {
      if (!part.full_form.trim() || !part.abbreviation.trim()) {
        throw new Error(`split_entry override for “${record.input}” contains an empty pair.`);
      }
      return {
        ...original,
        id: index === 0 ? original.id : `${original.id}#${index + 1}`,
        full_form: part.full_form.trim(),
        abbreviation: part.abbreviation.trim(),
        meanings: [part.full_form.trim()],
        match_variants: [part.full_form.trim()],
        conversion_enabled: true,
        ambiguous: false,
        match: { ...original.match, priority: priorityOf([part.full_form]) },
      };
    });
    entries.splice(entries.indexOf(original), 1, ...parts);
    for (const part of parts) byId.set(part.id, part);
  }

  // add_conversion: reviewer-approved conversions that Section 16 does not
  // print. They join the runtime dataset as medium-confidence entries so
  // conversions using them carry the verification warning, and their note
  // records why they exist.
  const existingWords = new Set<string>();
  for (const entry of entries) {
    for (const variant of entry.match_variants) {
      if (!/\s/u.test(variant.trim())) existingWords.add(variant.trim().toLowerCase());
    }
    const base = baseWordOf(entry.full_form);
    if (!/\s/u.test(base)) existingWords.add(base.toLowerCase());
  }
  const learnedEntries: AbbreviationEntry[] = [];
  for (const learned of learnedConversions) {
    const word = learned.word.trim();
    if (!word || existingWords.has(word.toLowerCase())) continue;
    const id = `learned-${word.toLowerCase().replace(/[^a-z0-9]+/gu, "-")}`;
    if (byId.has(id)) continue;
    const variants = [word.charAt(0).toUpperCase() + word.slice(1)];
    const learnedEntry: AbbreviationEntry = {
      id,
      full_form: variants[0],
      abbreviation: learned.abbreviation,
      annex: "A",
      category: "general",
      service: "tri-service",
      ambiguous: false,
      meanings: [variants[0]],
      aliases: [],
      match_variants: variants,
      conversion_enabled: true,
      match: {
        case_sensitive: false,
        whole_phrase: true,
        word_boundary: true,
        priority: 1,
      },
      quality: { confidence: "medium" },
      notes: `Learned from reviewer corrections (${learned.count} confirmation${learned.count === 1 ? "" : "s"}). Reviewer-approved usage; not a printed Section 16 entry.`,
    };
    learnedEntries.push(learnedEntry);
    byId.set(learnedEntry.id, learnedEntry);
  }
  entries.push(...learnedEntries);

  // add_conversion: reviewer-approved conversions recorded as explicit
  // override records (with their own reasons).
  for (const record of customConversions) {
    const fullForm = record.input;
    const variants = distinctForms(record.match_variants?.length ? record.match_variants : [fullForm]);
    const slug = fullForm
      .toLocaleLowerCase("en")
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-,|-$/gu, "");
    const id = record.entry_id ?? `custom-${slug}`;
    if (byId.has(id)) {
      throw new Error(`add_conversion override produces duplicate entry id “${id}”.`);
    }
    const entry: AbbreviationEntry = {
      id,
      full_form: fullForm,
      abbreviation: record.output,
      annex: record.annex ?? "A",
      category: "general",
      service: "tri-service",
      ambiguous: false,
      meanings: meaningsFor(fullForm, variants),
      aliases: [],
      match_variants: variants,
      conversion_enabled: true,
      match: {
        case_sensitive: false,
        whole_phrase: true,
        word_boundary: true,
        priority: priorityOf(variants),
      },
      quality: { confidence: "medium" },
      notes: record.reason,
    };
    entries.push(entry);
    byId.set(entry.id, entry);
  }

  const byAbbreviation = new Map<string, AbbreviationEntry[]>();
  for (const entry of entries) {
    const key = normalizedKey(entry.abbreviation);
    const group = byAbbreviation.get(key) ?? [];
    group.push(entry);
    byAbbreviation.set(key, group);
  }
  for (const group of byAbbreviation.values()) {
    for (const entry of group) {
      if (entry.ambiguous) continue;
      if (
        group.some(
          (other) =>
            other.id !== entry.id &&
            normalizedKey(other.full_form) !== normalizedKey(entry.full_form),
        )
      ) {
        entry.ambiguous = true;
      }
    }
  }

  // Conflict groups: abbreviations shared by entries with different full
  // forms. The reverse policy is the global default; the ambiguity UI always
  // offers the collected meaning choices.
  const conflicts: ConflictDefinition[] = [];
  for (const group of byAbbreviation.values()) {
    const distinctForms = new Set(group.map((entry) => normalizedKey(entry.full_form)));
    if (group.length < 2 || distinctForms.size < 2) continue;
    const surfaces = new Map<string, number>();
    for (const entry of group) {
      surfaces.set(entry.abbreviation, (surfaces.get(entry.abbreviation) ?? 0) + 1);
    }
    const surface = [...group].sort(
      (left, right) =>
        (surfaces.get(right.abbreviation) ?? 0) - (surfaces.get(left.abbreviation) ?? 0),
    )[0].abbreviation;
    const meanings: string[] = [];
    for (const entry of group) {
      for (const meaning of entry.meanings) {
        if (!meanings.includes(meaning)) meanings.push(meaning);
      }
    }
    conflicts.push({
      abbreviation: surface,
      entry_ids: group.map((entry) => entry.id),
      possible_meanings: meanings,
      reverse_policy: "require_context_or_user_selection",
    });
  }

  const converterConfig: ConverterConfig = {
    ...rules.global.engine_config,
    replacement_entry_ids: entries
      .filter((entry) => entry.conversion_enabled)
      .map((entry) => entry.id),
  };

  const entriesByAnnex: Record<string, number> = {};
  for (const entry of entries) {
    entriesByAnnex[entry.annex] = (entriesByAnnex[entry.annex] ?? 0) + 1;
  }
  const statistics: DatasetStatistics = {
    entry_count: entries.length,
    conflicting_abbreviation_count: conflicts.length,
    entries_by_annex: entriesByAnnex,
    entries_requiring_review: entries.filter(
      (entry) => entry.quality.confidence !== "high",
    ).length,
  };

  return {
    schema_version: RUNTIME_SCHEMA_VERSION,
    title: base.title,
    description: base.description,
    language: base.language,
    generated_on: base.generated_on,
    source: base.source,
    annexes: base.annexes,
    converter_config: converterConfig,
    entries,
    conflicts,
    statistics,
    implementation_notes: [],
  };
}

/**
 * Builds the engine's id-keyed rules overlay (paragraph 0241 behaviour) from
 * the word-keyed language rules and the overrides layer. Roots resolve to
 * entries through the same first-match word index the morphology matcher
 * uses; ambiguous resolutions carry an explicit entry_id in the layer data.
 */
export function composeRulesOverlay(
  rules: LanguageRules,
  overrides: OverridesLayer,
  dataset: AbbreviationDataset,
): AbbreviationRulesOverlay {
  const byId = new Map<string, ResolvableRecord>(
    dataset.entries.map((entry) => [entry.id, entry]),
  );
  const { forwardVariants } = collectOverrideMaps(
    overrides,
    dataset.entries.map((entry) => ({
      id: entry.id,
      full_form: entry.full_form,
      abbreviation: entry.abbreviation,
    })),
  );

  // Forward-adjusted view used for word resolution: re-enabled annex B
  // records participate with their allowed variants.
  const wordIndex = new Map<string, string>();
  for (const entry of dataset.entries) {
    const enabled = entry.conversion_enabled || forwardVariants.has(entry.id);
    if (!enabled) continue;
    const variants = forwardVariants.get(entry.id) ?? entry.match_variants;
    const keys = new Set<string>([baseWordOf(entry.full_form), ...variants]);
    for (const key of keys) {
      const normalized = normalizedKey(key);
      if (!normalized || /\s/u.test(normalized)) continue;
      if (!wordIndex.has(normalized)) wordIndex.set(normalized, entry.id);
    }
  }

  function resolveRoot(rule: RootRule): string {
    if (rule.entry_id) {
      if (!byId.has(rule.entry_id)) {
        throw new Error(`Rule root “${rule.root}” references unknown entry “${rule.entry_id}”.`);
      }
      return rule.entry_id;
    }
    if (/\s/u.test(rule.root)) {
      // Phrase root: resolve by the base segment of the full form.
      const wanted = normalizedKey(rule.root);
      for (const entry of dataset.entries) {
        const enabled = entry.conversion_enabled || forwardVariants.has(entry.id);
        if (enabled && normalizedKey(baseWordOf(entry.full_form)) === wanted) {
          return entry.id;
        }
      }
      throw new Error(`Rule root “${rule.root}” does not resolve to a dictionary entry.`);
    }
    const id = wordIndex.get(normalizedKey(rule.root));
    if (!id) {
      throw new Error(`Rule root “${rule.root}” does not resolve to a dictionary entry.`);
    }
    return id;
  }

  const verbEntryIds: string[] = [];
  const pluralInvariantEntryIds: string[] = [];
  const measurementEntryIds: string[] = [];
  const compoundEnabledEntryIds: string[] = [];
  const entryRules: Record<string, string[]> = {};
  const entryVariants: Record<string, string[]> = {};
  const allowedRuleNames = new Set([
    "verb_forms", "noun_plural", "plural_invariant", "compound_root", "compound_prefix", "compound_suffix", "exact_only",
  ]);
  for (const rule of rules.rules) {
    const id = resolveRoot(rule);
    const target = byId.get(id)!;
    if (normalizedKey(rule.abbreviation) !== normalizedKey(target.abbreviation)) {
      throw new Error(`Rule root “${rule.root}” expects “${rule.abbreviation}”, but entry “${id}” authorizes “${target.abbreviation}”.`);
    }
    for (const name of rule.allowed_rules) {
      if (!allowedRuleNames.has(name)) throw new Error(`Unknown grammatical rule “${name}” for “${rule.root}”.`);
    }
    if (entryRules[id] && JSON.stringify(entryRules[id]) !== JSON.stringify(rule.allowed_rules)) {
      throw new Error(`Entry “${id}” has conflicting grammatical rules.`);
    }
    entryRules[id] = [...rule.allowed_rules];
    entryVariants[id] = distinctForms([...(entryVariants[id] ?? []), ...Object.keys(rule.examples)]);
    if (rule.part_of_speech === "verb" && !verbEntryIds.includes(id)) {
      verbEntryIds.push(id);
    }
    if (rule.allowed_rules.includes("plural_invariant") && !pluralInvariantEntryIds.includes(id)) {
      pluralInvariantEntryIds.push(id);
    }
    if (rule.part_of_speech === "measurement" && !measurementEntryIds.includes(id)) {
      measurementEntryIds.push(id);
    }
    if (rule.allowed_rules.includes("compound_root") && !compoundEnabledEntryIds.includes(id)) {
      compoundEnabledEntryIds.push(id);
    }
  }

  const forwardOverrides: AbbreviationRulesOverlay["forward_overrides"] = {};
  const entrySplits: Record<string, EntrySplitPart[]> = {};
  const exactOnlyIds: string[] = [];
  for (const record of overrides.overrides) {
    if (record.rule === ENABLE_FORWARD) {
      const target = resolveOverrideTarget(record, byId);
      forwardOverrides[target.id] = { variants: record.allowed_variants ?? [] };
    } else if (record.rule === SPLIT_ENTRY) {
      // composeDataset already materialized these pairs for both directions.
      continue;
    } else if (record.rule === EXACT_ONLY) {
      const target = resolveOverrideTarget(record, byId);
      if (!exactOnlyIds.includes(target.id)) exactOnlyIds.push(target.id);
    }
  }

  return {
    version: rules.schema_version,
    description: rules.description,
    exact_only_entry_ids: exactOnlyIds,
    verb_entry_ids: verbEntryIds,
    plural_invariant_entry_ids: pluralInvariantEntryIds,
    measurement_entry_ids: measurementEntryIds,
    compound_enabled_entry_ids: compoundEnabledEntryIds,
    entry_rules: entryRules,
    entry_variants: entryVariants,
    default_allowed_rules: [...rules.default_behaviour.allowed_rules],
    protected_words: rules.global.protected_words,
    irregular_forms: rules.global.irregular_forms,
    compound_affixes: rules.global.compound_affixes,
    compound_head_words: rules.global.compound_head_words,
    forward_overrides: forwardOverrides,
    entry_splits: entrySplits,
    document_policies: rules.global.document_policies,
  };
}
