/**
 * One-time migration: splits the legacy monolithic dataset into the three
 * curated data layers served by the app.
 *
 *   A  public/data/abbreviations.base.json     authoritative Section 16 dictionary
 *   B  public/data/abbreviation-rules.json     paragraph 0241 language rules
 *   C  public/data/abbreviation-overrides.json exceptions, re-enablements, splits
 *
 * Every derivation below was verified field-by-field against the legacy file
 * (see scripts/verify claims asserted at the bottom of the file). The script
 * reads the legacy dataset from the git history revision it was committed in:
 *   git show 6d95426d:abbre/abb/service-abbreviation-converter/public/data/Bangladesh_Services_Abbreviation_Converter_Dataset.json
 *
 * Usage: node scripts/split-dataset.mjs [legacyDatasetPath]
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const project = resolve(here, "..");
const outDir = resolve(project, "public/data");

const LEGACY_COMMIT = "6d95426d";
const LEGACY_PATH =
  "abbre/abb/service-abbreviation-converter/public/data/Bangladesh_Services_Abbreviation_Converter_Dataset.json";

function loadLegacy() {
  const argPath = process.argv[2];
  if (argPath) return JSON.parse(readFileSync(resolve(process.cwd(), argPath), "utf8"));
  const text = execFileSync("git", ["show", `${LEGACY_COMMIT}:${LEGACY_PATH}`], {
    cwd: resolve(project, "../../.."),
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(text);
}

const legacy = loadLegacy();
const entries = legacy.entries;

// Mirror of src/engine/phraseTrie.normalizeForMatch (apostrophe folding + NFC +
// whitespace collapse + lower case), used only for grouping keys here.
function norm(value) {
  return value
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .normalize("NFC")
    .replace(/\s+/gu, " ")
    .toLowerCase()
    .trim();
}

// Mirror of MorphMatcher.baseWordOf: first slash/semicolon segment, parens removed.
function baseWordOf(fullForm) {
  return fullForm
    .replace(/\(([^)]*)\)/g, "")
    .replace(/\s+/g, " ")
    .split(/[\/;]/)[0]
    .trim();
}

// Default match_variants derivation: the full form plus its slash-separated
// alternatives. Parenthetical source notation ("(ly)", "(ed/ing)", verb
// glosses like "Inform(ation)") expands irregularly, so those entries get an
// exact match_variants record in the overrides layer instead.
function simpleVariants(fullForm) {
  if (!fullForm.includes("/")) return [fullForm];
  return [fullForm, ...fullForm.split("/").map((part) => part.trim())];
}

const overlay = JSON.parse(
  readFileSync(resolve(project, "src/data/abbreviation-rules.json"), "utf8"),
);

const variantOverrides = new Map(); // entry id -> exact legacy match_variants
for (const entry of entries) {
  if (JSON.stringify(simpleVariants(entry.full_form)) !== JSON.stringify(entry.match_variants)) {
    variantOverrides.set(entry.id, entry.match_variants);
  }
}
function variantsOf(entry) {
  return variantOverrides.get(entry.id) ?? simpleVariants(entry.full_form);
}

// Verified exact: meanings = full_form split on semicolons. One legacy record
// (abbr-0056) keeps its semicolon-separated string as a single meaning.
const MEANING_FIXES = new Set(["abbr-0056"]);
function meaningsOf(id, fullForm) {
  if (MEANING_FIXES.has(id)) return [fullForm];
  return fullForm.split(";").map((part) => part.trim());
}

// Verified exact on all 2633 entries: match.priority = highest alphanumeric
// token count across variants, where parenthesised groups count separately
// ("Article(s) in use" -> Article, s, in, use = 4).
function priorityOf(variants) {
  const tokens = (value) =>
    value.replace(/\(([^)]*)\)/g, " $1 ").split(/[^A-Za-z0-9]+/).filter(Boolean);
  return Math.max(...variants.map((variant) => tokens(variant).length));
}

// ---------------------------------------------------------------------------
// Layer A — authoritative dictionary
// ---------------------------------------------------------------------------

const annexProfiles = {
  A: { title: "General Abbreviations", category: "general", service: "tri-service" },
  B: { title: "Abbreviations with Multiple Meaning", category: "multiple_meaning", service: "tri-service" },
  C: { title: "Ranks and Appointments", category: "rank_and_appointment", service: null },
  D: { title: "National Distinguishing Letters", category: "national_distinguishing_letter", service: "tri-service" },
  E: { title: "Training Institutions", category: "training_institution", service: null },
  F: { title: "Regiments and Corps in the Army", category: "army_unit_corps", service: "army" },
  G: { title: "Bases, Units and Branches of Bangladesh Navy", category: "navy_base_unit_branch", service: "navy" },
  H: { title: "Bases, Units and Branches of Bangladesh Air Force", category: "air_force_base_unit_branch", service: "air-force" },
};

const ANNEX_B_NOTE =
  "Reverse expansion requires user/context selection; never auto-expand this abbreviation.";

// Group entries by normalized abbreviation to derive the ambiguous flag:
// ambiguous = shares its abbreviation with a different full form, or carries
// several meanings itself (verified exact on the legacy data).
const byAbbreviation = new Map();
for (const entry of entries) {
  const key = norm(entry.abbreviation);
  if (!byAbbreviation.has(key)) byAbbreviation.set(key, []);
  byAbbreviation.get(key).push(entry);
}

const baseEntries = entries.map((entry) => {
  const profile = annexProfiles[entry.annex];
  if (!profile) throw new Error(`Unknown annex ${entry.annex} on ${entry.id}`);
  if (entry.category !== profile.category) {
    throw new Error(`Category drift on ${entry.id}: ${entry.category} != ${profile.category}`);
  }
  if (profile.service && entry.service !== profile.service) {
    throw new Error(`Service drift on ${entry.id}: ${entry.service} != ${profile.service}`);
  }

  const record = {
    id: entry.id,
    full_form: entry.full_form,
    abbreviation: entry.abbreviation,
    annex: entry.annex,
    source: "Section 16",
    verified: entry.quality.confidence === "high",
  };
  if (!profile.service) record.service = entry.service;
  if (entry.subcategory) record.subcategory = entry.subcategory;
  if (entry.notes && entry.notes !== ANNEX_B_NOTE) {
    if (entry.annex === "B") {
      throw new Error(`Annex B entry ${entry.id} carries a non-standard note`);
    }
    record.note = entry.notes;
  }
  return record;
});

const base = {
  layer: "authoritative-dictionary",
  schema_version: "1.0.0",
  title: "Bangladesh Services Abbreviations — Authoritative Dictionary",
  description:
    "Only the abbreviation pairs published in Chapter VI, Section 16 of the source manual. " +
    "Entries are never edited to fix a sentence; corrections belong in abbreviation-overrides.json.",
  language: "en",
  generated_on: legacy.generated_on,
  source: legacy.source,
  annexes: legacy.annexes,
  annex_profiles: annexProfiles,
  entries: baseEntries,
};

// ---------------------------------------------------------------------------
// Layer B — language rules
// ---------------------------------------------------------------------------

// Single-word keys the morphology matcher registers per entry (base word of the
// full form plus every single-word match variant). Used to decide when a
// root->entry resolution is ambiguous and needs an explicit entry_id.
const wordKeys = new Map(); // normalized word -> Set<entry id>
function keysFor(entry) {
  const keys = new Set();
  const base = baseWordOf(entry.full_form);
  if (base && !/\s/.test(base)) keys.add(norm(base));
  for (const variant of variantsOf(entry)) {
    if (!/\s/.test(variant.trim())) keys.add(norm(variant.trim()));
  }
  return keys;
}
for (const entry of entries) {
  const forwardVariants = overlay.forward_overrides[entry.id]?.variants;
  const allKeys = new Set(keysFor(entry));
  if (forwardVariants) {
    for (const variant of forwardVariants) {
      if (!/\s/.test(variant.trim())) allKeys.add(norm(variant.trim()));
    }
  }
  for (const key of allKeys) {
    if (!wordKeys.has(key)) wordKeys.set(key, new Set());
    wordKeys.get(key).add(entry.id);
  }
}

function needsExplicitId(entry) {
  for (const key of keysFor(entry)) {
    const holders = wordKeys.get(key);
    if (holders && [...holders].some((id) => id !== entry.id)) return true;
  }
  return false;
}

function pluralize(word) {
  if (/(?:s|x|z|ch|sh)$/.test(word)) return `${word}es`;
  if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}

// For phrase roots the plural marker sits on the last word.
function pluralizePhrase(phrase) {
  const words = phrase.split(" ");
  const last = words.pop();
  words.push(pluralize(last));
  return words.join(" ");
}

function pastOf(word) {
  if (/e$/.test(word)) return `${word}d`;
  return `${word}ed`;
}

function gerundOf(word) {
  if (/e$/.test(word)) return `${word.slice(0, -1)}ing`;
  return `${word}ing`;
}

const verbIds = new Set(overlay.verb_entry_ids);
const invariantIds = new Set(overlay.plural_invariant_entry_ids);
const ruleIds = [...new Set([...verbIds, ...invariantIds])];
// The one verb whose base word is not the first slash segment of its full form.
const ROOT_FIXES = { "abbr-1678": "mobilize" };

const rules = ruleIds.map((id) => {
  const entry = entries.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`Rule id ${id} not found`);
  const root = (ROOT_FIXES[id] ?? baseWordOf(entry.full_form)).toLowerCase();
  const isPhrase = /\s/.test(root);

  const isVerb = verbIds.has(id);
  const isInvariant = invariantIds.has(id);
  const allowedRules = [];
  if (isVerb) allowedRules.push("verb_forms");
  if (isInvariant) allowedRules.push("plural_invariant");
  if (!isVerb && !isInvariant) allowedRules.push("noun_plural");
  // Closed compounds convert through the root word only; phrase roots cannot
  // head a compound.
  if (!isPhrase) allowedRules.push("compound_suffix");

  const abbreviation = entry.abbreviation;
  const examples = {};
  if (isVerb) {
    // Paragraph 0241b(4): every ordinary derivative shares the base
    // abbreviation, and a verb abbreviation never takes a plural "s".
    examples[root] = abbreviation;
    examples[`${root}s`] = abbreviation;
    examples[pastOf(root)] = abbreviation;
    examples[gerundOf(root)] = abbreviation;
  } else {
    const plural = isPhrase ? pluralizePhrase(root) : pluralize(root);
    examples[root] = abbreviation;
    examples[plural] = isInvariant ? abbreviation : `${abbreviation}s`;
    if (!isPhrase) examples[`${root}ship`] = `${abbreviation}ship`;
  }

  const rule = { root, abbreviation, part_of_speech: isVerb ? "verb" : "noun", allowed_rules: allowedRules, examples };
  // Phrase roots never pass through the single-word index, so they always
  // carry an explicit entry id.
  if (isPhrase || needsExplicitId(entry)) rule.entry_id = id;
  return rule;
});

const baseRules = {
  layer: "language-rules",
  schema_version: "1.0.0",
  description:
    "Paragraph 0241 grammatical behaviour, one rule per root word. Authoritative " +
    "meanings stay in abbreviations.base.json. Roots not listed here take the " +
    "default noun behaviour: plural adds \"s\" to the abbreviation and closed " +
    "compounds may convert through the root.",
  default_behaviour: {
    part_of_speech: "noun",
    allowed_rules: ["noun_plural", "compound_suffix"],
    note: "Applies to every dictionary entry without an explicit rule below.",
  },
  global: {
    protected_words: overlay.protected_words,
    irregular_forms: overlay.irregular_forms,
    compound_affixes: overlay.compound_affixes,
    compound_head_words: overlay.compound_head_words,
    document_policies: overlay.document_policies,
    // Engine linguistic configuration carried over from the legacy
    // converter_config (matching, context and scope behaviour).
    engine_config: {
      supported_directions: legacy.converter_config.supported_directions,
      default_direction: legacy.converter_config.default_direction,
      replacement_order: legacy.converter_config.replacement_order,
      tokenization: legacy.converter_config.tokenization,
      morphology: legacy.converter_config.morphology,
      conversion_pipeline: legacy.converter_config.conversion_pipeline,
      context_rules: legacy.converter_config.context_rules,
      scope_rules: legacy.converter_config.scope_rules,
      reverse_conversion: legacy.converter_config.reverse_conversion,
    },
  },
  rules,
};

// ---------------------------------------------------------------------------
// Layer C — exceptions and overrides
// ---------------------------------------------------------------------------

// (full_form, abbreviation) pairs shared by more than one entry need an
// explicit entry_id so runtime resolution stays exact.
const pairCount = new Map();
for (const entry of entries) {
  const pair = `${norm(entry.full_form)}|${norm(entry.abbreviation)}`;
  pairCount.set(pair, (pairCount.get(pair) ?? 0) + 1);
}
function pairIsAmbiguous(entry) {
  return (pairCount.get(`${norm(entry.full_form)}|${norm(entry.abbreviation)}`) ?? 0) > 1;
}

const overrideRecords = [];

// 0. match_variants: parenthetical source notation expands irregularly, so the
//    exact matchable surface forms are carried verbatim for those entries.
for (const [id, variants] of variantOverrides) {
  const entry = entries.find((candidate) => candidate.id === id);
  const record = {
    input: entry.full_form,
    output: entry.abbreviation,
    rule: "match_variants",
    match_variants: variants,
    reason:
      "Parenthetical source notation expands irregularly; the exact authorized surface forms are carried verbatim.",
  };
  if (pairIsAmbiguous(entry)) record.entry_id = id;
  overrideRecords.push(record);
}

// 1. exact_only: the abbreviation covers one specific form only; derivatives
//    of its base word must never be generated.
const EXACT_ONLY = [
  {
    id: "abbr-1576",
    input: "Building",
    blocked: ["build", "builds", "builder", "builders"],
    reason:
      "The authorized abbreviation bldg applies to Building only; other derivatives of the base word build are written in full.",
  },
  {
    id: "abbr-1218",
    input: "Retired",
    blocked: ["retire", "retires", "retiring", "retirement", "retiree"],
    reason:
      "The authorized abbreviation retd applies to Retired only; other derivatives of the base word retire are written in full.",
  },
  {
    id: "abbr-0013",
    input: "Additional",
    blocked: ["addition", "additions"],
    reason:
      "The authorized abbreviation addl covers Additional (and Additionally) only; the noun addition is written in full.",
  },
];
for (const item of EXACT_ONLY) {
  const entry = entries.find((candidate) => candidate.id === item.id);
  overrideRecords.push({
    input: item.input,
    output: entry.abbreviation,
    rule: "exact_only",
    blocked_forms: item.blocked,
    reason: item.reason,
    entry_id: item.id,
  });
}

// 2. enable_forward: annex B records (and special variant sets) re-enabled for
//    forward conversion with an explicit authorized variant list.
const FORWARD_REASONS = {
  "abbr-1576": "Annex B record re-enabled for forward conversion; bldg applies to the exact authorized form only.",
  "abbr-1678": "Annex B record re-enabled for forward conversion; both Mobile and Mobilize convert to mob.",
  "abbr-0822": "Variant set restricted to the exact authorized LCT(U) phrases.",
  "abbr-1274": "Variant set restricted to the exact authorized STOL/VTOL phrases.",
  "abbr-1450": "Variant set restricted to the exact authorized UAV/UAS phrases.",
  "abbr-1484": "Variant set restricted to the exact authorized V/STOL phrases.",
  "abbr-1487": "Variant set restricted to the exact authorized VIP phrases.",
  "abbr-0451": "Verb entry re-enabled with its authorized tense variants.",
  "abbr-0674": "Verb entry re-enabled with its authorized tense variants.",
  "abbr-0677": "Verb entry re-enabled with its authorized tense variants.",
  "abbr-0726": "Verb entry re-enabled with its authorized tense and noun variants.",
  "abbr-0366": "Verb entry re-enabled with its authorized tense and noun variants.",
  "abbr-0473": "Verb entry re-enabled with its authorized tense and noun variants.",
};
for (const [id, override] of Object.entries(overlay.forward_overrides)) {
  const entry = entries.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`forward_overrides id ${id} not found`);
  const record = {
    input: entry.full_form,
    output: entry.abbreviation,
    rule: "enable_forward",
    allowed_variants: override.variants,
    reason: FORWARD_REASONS[id] ?? "Re-enabled with an explicit authorized variant list.",
  };
  if (pairIsAmbiguous(entry)) record.entry_id = id;
  overrideRecords.push(record);
}

// 3. split_entry: composite records replaced by their individual authorized forms.
for (const [id, parts] of Object.entries(overlay.entry_splits)) {
  const entry = entries.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`entry_splits id ${id} not found`);
  const record = {
    input: entry.full_form,
    output: entry.abbreviation,
    rule: "split_entry",
    parts,
    reason:
      "Composite record replaced by its individual authorized forms so each phrase converts to its own abbreviation.",
  };
  if (pairIsAmbiguous(entry)) record.entry_id = id;
  overrideRecords.push(record);
}

const overridesFile = {
  layer: "overrides",
  schema_version: "1.0.0",
  description:
    "Special cases and corrections applied on top of the authoritative dictionary. " +
    "Official entries are never edited; a fix lands here with its reason.",
  overrides: overrideRecords,
};

// ---------------------------------------------------------------------------
// Assertions against the legacy data (fail loudly on any drift)
// ---------------------------------------------------------------------------

for (const entry of entries) {
  const variants = variantsOf(entry);
  const meanings = meaningsOf(entry.id, entry.full_form);
  const priority = priorityOf(variants);
  if (JSON.stringify(variants) !== JSON.stringify(entry.match_variants)) {
    throw new Error(`Variant derivation drifted on ${entry.id}`);
  }
  if (JSON.stringify(meanings) !== JSON.stringify(entry.meanings)) {
    throw new Error(`Meaning derivation drifted on ${entry.id}`);
  }
  if (priority !== entry.match.priority) {
    throw new Error(`Priority derivation drifted on ${entry.id}`);
  }
  const enabled = entry.annex !== "B";
  if (enabled !== entry.conversion_enabled) {
    throw new Error(`Conversion-enabled derivation drifted on ${entry.id}`);
  }
  const others = byAbbreviation.get(norm(entry.abbreviation)).filter(
    (other) => other.id !== entry.id && norm(other.full_form) !== norm(entry.full_form),
  );
  const ambiguous = others.length > 0 || meanings.length > 1;
  if (ambiguous !== entry.ambiguous) {
    throw new Error(`Ambiguous derivation drifted on ${entry.id}`);
  }
  if (entry.annex === "B" && entry.notes !== ANNEX_B_NOTE) {
    throw new Error(`Annex B note drifted on ${entry.id}`);
  }
  const medium = entry.quality.confidence !== "high";
  if (medium !== Boolean(entry.notes && entry.notes.startsWith("Reconstructed"))) {
    throw new Error(`Confidence/note pairing drifted on ${entry.id}`);
  }
}

mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, "abbreviations.base.json"), `${JSON.stringify(base, null, 2)}\n`);
writeFileSync(resolve(outDir, "abbreviation-rules.json"), `${JSON.stringify(baseRules, null, 2)}\n`);
writeFileSync(resolve(outDir, "abbreviation-overrides.json"), `${JSON.stringify(overridesFile, null, 2)}\n`);

console.log(`Layer A: ${baseEntries.length} entries`);
console.log(`Layer B: ${rules.length} root rules (+ global configuration)`);
console.log(`Layer C: ${overrideRecords.length} overrides`);
