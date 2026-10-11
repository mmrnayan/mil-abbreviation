import type { AbbreviationEntry, ConversionOptions, WritingContext } from "./types";
import type { ProtectedRange } from "./protector";

export interface DocumentPolicyConfig {
  restricted_contexts?: string[];
  external_contexts?: string[];
  allowed_exception_entry_ids?: string[];
  allowed_exception_subcategories?: string[];
  address_box_suppressed_entry_ids?: string[];
  qualification_abbreviations?: string[];
  decoration_abbreviations?: string[];
}

const RESTRICTED: WritingContext[] = ["formal-letter", "demi-official-letter", "commanded-letter", "service-paper"];
const EXTERNAL: WritingContext[] = ["civilian-external-correspondence", "allied-forces-correspondence", "foreign-correspondence"];
const EXCEPTIONS = ["decoration", "qualification", "branch", "regiment", "corps"];
const QUALIFICATIONS = ["afwc", "awc", "ndc", "ndu", "rcds", "psc", "te", "hdmc"];
const DECORATIONS = ["SGP", "SPP", "BPP", "OSP", "SUP"];
const key = (value: string) => value.replace(/\./gu, "").trim().toLocaleLowerCase("en");

function values(config: DocumentPolicyConfig, field: keyof DocumentPolicyConfig, fallback: string[] = []): string[] {
  const value = config[field];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : fallback;
}

export function fullTextPolicy(options: ConversionOptions, config: DocumentPolicyConfig): string | undefined {
  if (values(config, "external_contexts", EXTERNAL).includes(options.context ?? "")) {
    return "Service abbreviations are excluded for foreign, allied-force, non-service or civilian addressees; the text has been retained in full.";
  }
  if (options.context === "operational-heading") {
    return "Paragraph headings in operational and administrative orders remain in full.";
  }
  return undefined;
}

export function isRestrictedContext(options: ConversionOptions, config: DocumentPolicyConfig): boolean {
  return values(config, "restricted_contexts", RESTRICTED).includes(options.context ?? "") ||
    (options.context === "air-force-operational-paper" && options.service !== "air-force");
}

export function documentPolicyAllowsEntry(entry: AbbreviationEntry, options: ConversionOptions, config: DocumentPolicyConfig): boolean {
  if (options.context === "national-force-designation") return entry.category === "national_distinguishing_letter";
  if (options.context === "address-box") {
    if (values(config, "address_box_suppressed_entry_ids").includes(entry.id)) return false;
    // The source address-box note belongs to Navy ranks, including Commodore.
    if (/^(?:commodore|(?:admiral|vice admiral|rear admiral)(?: of the fleet)?)$/iu.test(entry.full_form.trim()) &&
        (entry.service === "navy" || entry.service === "tri-service")) return false;
  }
  if (!isRestrictedContext(options, config)) return true;
  return entry.annex === "F" ||
    values(config, "allowed_exception_entry_ids").includes(entry.id) ||
    values(config, "allowed_exception_subcategories", EXCEPTIONS).includes(entry.subcategory ?? "") ||
    ["decoration", "military_qualification", "arms_and_service"].includes(entry.category);
}

export interface FormattingEdit { start: number; end: number; text: string }

export function documentProtectedRanges(input: string, options: ConversionOptions, entries: readonly AbbreviationEntry[], config: DocumentPolicyConfig): ProtectedRange[] {
  if (options.context !== "address-box" && !isRestrictedContext(options, config)) return [];
  const ranges: ProtectedRange[] = [];
  const allowedForms = new Set(entries.filter((entry) => documentPolicyAllowsEntry(entry, options, config))
    .flatMap((entry) => entry.match_variants.map(key)));
  for (const entry of entries) {
    if (documentPolicyAllowsEntry(entry, options, config)) continue;
    for (const form of entry.match_variants) {
      if (allowedForms.has(key(form))) continue;
      if (options.context !== "address-box" && !/\s/u.test(form.trim())) continue;
      const escaped = form.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&").replace(/\s+/gu, "\\s+");
      for (const match of input.matchAll(new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, "giu"))) {
        ranges.push({ startIndex: match.index!, endIndex: match.index! + match[0].length, kind: "abbreviation" });
      }
    }
  }
  return ranges;
}

/** Explicit personnel context plus an authorized leading rank scopes punctuation rules. */
export function personnelFormattingEdits(text: string, entries: readonly AbbreviationEntry[], config: DocumentPolicyConfig): FormattingEdit[] {
  const ranks = entries.filter((entry) => entry.subcategory === "rank").map((entry) => entry.abbreviation);
  const isPersonnelLine = ranks.some((rank) => text.startsWith(`${rank} `));
  if (!isPersonnelLine || /[\r\n]/u.test(text)) return [];
  const qualificationKeys = new Set(values(config, "qualification_abbreviations", QUALIFICATIONS).map(key));
  const suffixKeys = new Set(qualificationKeys);
  const suffixLabels = new Map(values(config, "decoration_abbreviations", DECORATIONS).map((value) => [key(value), value]));
  for (const decoration of suffixLabels.keys()) suffixKeys.add(decoration);
  for (const entry of entries) {
    if (values(config, "allowed_exception_entry_ids").includes(entry.id) ||
        EXCEPTIONS.includes(entry.subcategory ?? "") || entry.annex === "F") {
      suffixKeys.add(key(entry.abbreviation));
      suffixLabels.set(key(entry.abbreviation), entry.abbreviation);
    }
  }
  // Source examples also permit a naval branch in parentheses and BN/Inf.
  ["bn", "inf", "gd(p)", "(l)"].forEach((value) => suffixKeys.add(value));
  const tokens = [...text.matchAll(/\S+/gu)];
  let firstSuffix = tokens.length;
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const normalized = key(tokens[index][0].replace(/,+$/gu, ""));
    if (!suffixKeys.has(normalized)) break;
    firstSuffix = index;
  }
  const edits: FormattingEdit[] = [];
  const suffixStart = firstSuffix < tokens.length ? tokens[firstSuffix].index! : text.length;
  if (firstSuffix < tokens.length && firstSuffix >= 2) {
    let start = suffixStart;
    while (start > 0 && /[\s,]/u.test(text[start - 1])) start -= 1;
    edits.push({ start, end: suffixStart, text: ", " });
    tokens.slice(firstSuffix).forEach((token, index) => {
      const withoutComma = token[0].replace(/,+$/gu, "");
      const normalized = key(withoutComma);
      const formatted = qualificationKeys.has(normalized) ? normalized : suffixLabels.get(normalized) ?? withoutComma.replace(/\./gu, "");
      if (formatted !== token[0]) edits.push({ start: token.index!, end: token.index! + token[0].length, text: formatted });
      if (index > 0) {
        const previous = tokens[firstSuffix + index - 1];
        edits.push({ start: previous.index! + previous[0].length, end: token.index!, text: ", " });
      }
    });
  }
  for (const match of text.slice(0, suffixStart).matchAll(/\b([A-Z])\.(?=\s|[A-Z]\.|,)/gu)) {
    edits.push({ start: match.index! + 1, end: match.index! + 2, text: "" });
  }
  return edits.sort((left, right) => left.start - right.start);
}

export function applyFormattingEdits(text: string, edits: FormattingEdit[]): string {
  let cursor = 0;
  let result = "";
  for (const edit of edits) {
    result += text.slice(cursor, edit.start) + edit.text;
    cursor = edit.end;
  }
  return result + text.slice(cursor);
}

export function remapFormattingOffset(offset: number, edits: FormattingEdit[], end = false): number {
  let delta = 0;
  for (const edit of edits) {
    if (offset < edit.start || (offset === edit.start && !end)) break;
    if (offset < edit.end) return edit.start + delta + (end ? edit.text.length : 0);
    delta += edit.text.length - (edit.end - edit.start);
  }
  return offset + delta;
}

const INTERMEDIATE: Record<string, string> = {
  northnortheast: "NNE", eastnortheast: "ENE", eastsoutheast: "ESE", southsoutheast: "SSE",
  southsouthwest: "SSW", westsouthwest: "WSW", westnorthwest: "WNW", northnorthwest: "NNW",
  northeast: "NE", southeast: "SE", southwest: "SW", northwest: "NW",
};

export function compassAt(input: string, cursor: number, abbreviateIntermediate: boolean): { end: number; text: string } | undefined {
  if (cursor > 0 && /[\p{L}\p{N}_]/u.test(input[cursor - 1])) return undefined;
  const match = /^(?:north|south|east|west)(?:[ -]?(?:north|south|east|west)){0,2}\b/iu.exec(input.slice(cursor));
  if (!match) return undefined;
  const normalized = match[0].replace(/[ -]/gu, "").toLocaleLowerCase("en");
  const intermediate = INTERMEDIATE[normalized];
  if (intermediate && abbreviateIntermediate) return { end: cursor + match[0].length, text: intermediate };
  const cardinal = /^(?:north|south|east|west)\b/iu.exec(input.slice(cursor));
  return cardinal ? { end: cursor + cardinal[0].length, text: cardinal[0].toLocaleLowerCase("en") } : undefined;
}
