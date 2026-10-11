import { composeDataset, composeRulesOverlay, type AuthoritativeDictionary, type LanguageRules, type OverridesLayer } from "@/engine/datasetLayers";
import { validateDataset } from "@/engine/datasetValidator";
import { APP_VERSION } from "@/version";

export interface DatasetPackage {
  format: "sac-dataset-v1"; version: string; engineVersion: string; digest: string;
  layers: { base: AuthoritativeDictionary; rules: LanguageRules; overrides: OverridesLayer };
}
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
export async function packageDigest(layers: DatasetPackage["layers"]): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(layers));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export function composePackage(pkg: DatasetPackage) {
  if (pkg.format !== "sac-dataset-v1" || pkg.engineVersion !== APP_VERSION || !pkg.version) throw new Error("This dataset requires a different app version.");
  const { base, rules, overrides } = pkg.layers;
  if (!Array.isArray(base.entries) || !base.entries.length || !Array.isArray(rules.rules) || !rules.rules.length || !Array.isArray(overrides.overrides)) throw new Error("Incomplete dataset package.");
  const operations = ["verb_forms", "noun_plural", "plural_invariant", "compound_prefix", "compound_suffix"];
  if (rules.rules.some((rule) => !rule.root || !rule.abbreviation || !Array.isArray(rule.allowed_rules) || rule.allowed_rules.some((operation) => !operations.includes(operation)))) throw new Error("Invalid language rules.");
  const exceptions = ["exact_only", "enable_forward", "split_entry", "match_variants", "correct_entry", "add_conversion"];
  if (overrides.overrides.some((override) => !override.input || !override.output || !exceptions.includes(override.rule))) throw new Error("Invalid normalization overrides.");
  if (base.entries.some((entry) => !entry.id || !entry.full_form || !entry.abbreviation || !entry.verified || !entry.source_location) || new Set(base.entries.map((e) => e.id)).size !== base.entries.length) throw new Error("Invalid or unverified dictionary entries.");
  const dataset = composeDataset(base, rules, overrides);
  const overlay = composeRulesOverlay(rules, overrides, dataset);
  const validation = validateDataset(dataset);
  if (!validation.valid) throw new Error("Dataset validation failed.");
  return { dataset, overlay, validation };
}
export async function validatePackage(value: unknown): Promise<DatasetPackage> {
  const pkg = value as DatasetPackage;
  if (!pkg || typeof pkg !== "object" || !pkg.layers || typeof pkg.digest !== "string") throw new Error("Invalid dataset package.");
  if (await packageDigest(pkg.layers) !== pkg.digest) throw new Error("Dataset integrity check failed.");
  composePackage(pkg);
  return pkg;
}
