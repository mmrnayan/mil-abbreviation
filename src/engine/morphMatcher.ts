import type { ProtectedRange } from "./protector";
import { isWordCharacter, normalizeForMatch, type PhraseTrie } from "./phraseTrie";
import { resolveCompound } from "./compoundWords";
import { ExactExceptions, type GeneratedMatch } from "./exactExceptions";
import {
  isPlainWord,
  generatedConfidence,
  phraseSingularCandidates,
  type WordModel,
} from "./morphology";
import { resolveNounPlural } from "./nounPlurals";
import { rulesOverlay, applyForwardOverrides } from "./rulesOverlay";
import type {
  AbbreviationDataset,
  AbbreviationEntry,
  ReplacementRule,
  ServiceId,
} from "./types";
import { resolveVerbDerivative } from "./verbDerivatives";

/**
 * Applies the Paragraph 0241 linguistic rules at positions where no exact
 * authorized match exists: verb derivatives, noun plurals and controlled
 * compounds, in that priority order. Every generated form is validated against
 * the authorized dataset; nothing is invented freely.
 */

export interface MorphMatch {
  startIndex: number;
  endIndex: number;
  replacementText: string;
  entry: AbbreviationEntry;
  rule: ReplacementRule;
  normalizedRoot: string;
  confidence: "high" | "medium" | "needs-review";
}

export interface MorphContext {
  isAllowed: (entry: AbbreviationEntry) => boolean;
  protectedRanges: ProtectedRange[];
  preferredService?: "all" | ServiceId;
}

export class MorphMatcher {
  private readonly overlay = rulesOverlay;
  private readonly exceptions: ExactExceptions;
  private readonly verbIds: ReadonlySet<string>;
  private readonly pluralInvariantIds: ReadonlySet<string>;
  private readonly measurementIds: ReadonlySet<string>;
  private readonly protectedWords: ReadonlySet<string>;
  private readonly irregularForms: Record<string, string>;
  private readonly headWords: ReadonlySet<string>;
  private readonly wordToEntries = new Map<string, AbbreviationEntry[]>();
  private readonly forwardEntries: AbbreviationEntry[];
  private readonly reverseCompoundCache = new Map<string, AbbreviationEntry[]>();

  constructor(
    dataset: AbbreviationDataset,
    private readonly fullFormTrie: PhraseTrie,
  ) {
    this.exceptions = new ExactExceptions(rulesOverlay.exact_only_entry_ids);
    this.verbIds = new Set(rulesOverlay.verb_entry_ids);
    this.pluralInvariantIds = new Set(rulesOverlay.plural_invariant_entry_ids);
    this.measurementIds = new Set(rulesOverlay.measurement_entry_ids);
    this.protectedWords = new Set(
      rulesOverlay.protected_words.map((word) => word.toLocaleLowerCase("en")),
    );
    this.irregularForms = Object.fromEntries(
      Object.entries(rulesOverlay.irregular_forms).map(([form, base]) => [
        form.toLocaleLowerCase("en"),
        base.toLocaleLowerCase("en"),
      ]),
    );
    this.headWords = new Set(rulesOverlay.compound_head_words);

    this.forwardEntries = applyForwardOverrides(dataset.entries, this.overlay);
    for (const entry of this.forwardEntries) {
      if (!entry.conversion_enabled) continue;
      const keys = entry.match_variants;
      for (const key of keys) {
        const normalized = normalizeForMatch(key).trim();
        if (!normalized || /\s/u.test(normalized)) continue;
        const group = this.wordToEntries.get(normalized) ?? [];
        if (!group.some((candidate) => candidate.id === entry.id)) group.push(entry);
        this.wordToEntries.set(normalized, group);
      }
    }
  }

  isProtectedText(text: string): boolean {
    return this.protectedWords.has(normalizeForMatch(text).trim());
  }

  /** Finite approved surfaces and ordinary noun plurals, with grammar choices. */
  generatedReverseEntries(): AbbreviationEntry[] {
    const results = new Map<string, AbbreviationEntry>();
    for (const entry of this.forwardEntries) {
      if (!entry.conversion_enabled) continue;
      const context: MorphContext = {
        isAllowed: (candidate) => candidate.service === "tri-service" || candidate.service === entry.service,
        protectedRanges: [],
        preferredService: entry.service,
      };
      const surfaces = new Set([
        ...entry.match_variants,
        ...(this.overlay.entry_variants?.[entry.id] ?? []),
      ]);
      for (const surface of surfaces) {
        if (!/^[A-Za-z]+(?:[ -][A-Za-z]+)*$/u.test(surface) || this.isProtectedText(surface)) continue;
        const exact = entry.match_variants.some((value) => normalizeForMatch(value) === normalizeForMatch(surface));
        const generated = exact ? undefined : this.resolveWord(surface, context);
        const phrase = !exact && !generated ? this.findSingularizedPhrase(surface, context) : undefined;
        if (exact || generated || phrase) {
          const source = generated?.entry ?? phrase?.entry ?? entry;
          if (source.id === entry.id) {
            const alias = this.reverseEntry(source, surface,
              generated?.replacementText ?? phrase?.replacementText ?? entry.abbreviation,
              generated?.rule ?? (phrase ? "noun-plural" : "exact-authorized"),
              generated?.normalizedRoot ?? phrase?.normalizedRoot ?? surface,
              generated?.confidence ?? generatedConfidence(source));
            results.set(alias.id, alias);
          }
        }
        if (this.exceptions.isExactOnly(entry.id) || this.verbIds.has(entry.id) ||
            (!this.permitsRule(entry.id, "noun_plural") && !this.permitsRule(entry.id, "plural_invariant"))) continue;
        for (const plural of this.pluralSurfaces(surface)) {
          const generatedPlural = plural.includes(" ")
            ? this.findSingularizedPhrase(plural, context)
            : resolveNounPlural(plural, this.wordModel(context), this.irregularForms);
          if (!generatedPlural || generatedPlural.entry.id !== entry.id) continue;
          const alias = this.reverseEntry(entry, plural, generatedPlural.replacementText,
            "noun-plural", generatedPlural.normalizedRoot, generatedConfidence(entry));
          results.set(alias.id, alias);
        }
      }
    }
    return [...results.values()];
  }

  /** Only construct compounds for the requested abbreviation, then prove them forward. */
  generatedReverseCandidates(abbreviation: string): AbbreviationEntry[] {
    if (!/^[A-Za-z]+$/u.test(abbreviation)) return [];
    const normalized = abbreviation.toLocaleLowerCase("en");
    const cached = this.reverseCompoundCache.get(normalized);
    if (cached) return cached;
    const results = new Map<string, AbbreviationEntry>();
    const context: MorphContext = { isAllowed: () => true, protectedRanges: [] };
    for (const [root, entries] of this.wordToEntries) {
      for (const entry of entries) {
        if (this.exceptions.isExactOnly(entry.id)) continue;
        const abbr = entry.abbreviation.toLocaleLowerCase("en");
        if (!/^[a-z]+$/u.test(abbr) || normalized.length <= abbr.length) continue;
        const couldSuffix = normalized.startsWith(abbr);
        const couldPrefix = normalized.endsWith(abbr);
        if (!couldSuffix && !couldPrefix) continue;
        const surfaces: string[] = [];
        if (this.permitsRule(entry.id, "compound_suffix")) {
          for (const suffix of this.overlay.compound_affixes.suffixes) {
            if (couldSuffix && normalized === `${abbr}${suffix}`) surfaces.push(`${root}${suffix}`);
          }
          for (const head of this.headWords) {
            if (couldPrefix && normalized === `${head}${abbr}`) surfaces.push(`${head}${root}`);
          }
        }
        if (couldPrefix && this.permitsRule(entry.id, "compound_prefix")) {
          for (const prefix of this.overlay.compound_affixes.prefixes) {
            if (normalized !== `${prefix}${abbr}`) continue;
            surfaces.push(`${prefix}${root}`);
            const family = [...entry.match_variants, ...(this.overlay.entry_variants?.[entry.id] ?? [])];
            for (const variant of family) {
              if (/^[A-Za-z]+$/u.test(variant)) surfaces.push(`${prefix}${variant.toLocaleLowerCase("en")}`);
            }
          }
        }
        for (const surface of surfaces) {
          const generated = this.resolveWord(surface, {
            ...context,
            preferredService: entry.service,
            isAllowed: (candidate) => candidate.id === entry.id,
          });
          if (!generated || generated.replacementText.toLocaleLowerCase("en") !== normalized) continue;
          const alias = this.reverseEntry(entry, surface, generated.replacementText,
            generated.rule, generated.normalizedRoot, generated.confidence);
          results.set(alias.id, alias);
        }
      }
    }
    const candidates = [...results.values()];
    if (this.reverseCompoundCache.size >= 256) this.reverseCompoundCache.delete(this.reverseCompoundCache.keys().next().value!);
    this.reverseCompoundCache.set(normalized, candidates);
    return candidates;
  }

  private reverseEntry(entry: AbbreviationEntry, surface: string, abbreviation: string,
    rule: ReplacementRule, root: string, confidence: "high" | "medium" | "needs-review"): AbbreviationEntry {
    const meaning = surface.charAt(0).toLocaleUpperCase("en") + surface.slice(1);
    return {
      ...entry,
      id: `generated-${entry.id}-${normalizeForMatch(surface).replace(/[^a-z0-9]+/gu, "-")}`,
      full_form: meaning,
      abbreviation,
      meanings: [meaning],
      match_variants: [meaning],
      ambiguous: false,
      quality: { ...entry.quality, confidence },
      generated: { rule, root },
    };
  }

  private pluralSurfaces(surface: string): string[] {
    const words = surface.split(" ");
    const results: string[] = [];
    const lastNoun = words.findLastIndex((word) => !/^(?:of|in|the|to|and|off)$/iu.test(word) && !/ing$/iu.test(word));
    if (lastNoun < 0) return [];
    const noun = words[lastNoun];
    const irregulars = Object.entries(this.irregularForms)
      .filter(([, base]) => base === noun.toLocaleLowerCase("en"))
      .map(([plural]) => plural);
    const plural = /[^aeiou]y$/iu.test(noun) ? `${noun.slice(0, -1)}ies`
      : /(?:ch|sh|ss|x|z)$/iu.test(noun) ? `${noun}es` : `${noun}s`;
    for (const form of [plural, ...irregulars]) {
      const rebuilt = [...words];
      rebuilt[lastNoun] = form;
      results.push(rebuilt.join(" "));
    }
    return results;
  }

  /**
   * Tries to match morphologically at a word start. Returns undefined when the
   * position is inside a word, inside a protected range, a protected word, or
   * when no authorized rule produces a form.
   */
  findMatch(input: string, cursor: number, context: MorphContext): MorphMatch | undefined {
    const before = cursor > 0 ? input[cursor - 1] : undefined;
    if (isWordCharacter(before)) return undefined;

    const token = this.wordTokenAt(input, cursor);
    if (!token) return undefined;
    const after = input[cursor + token.length];
    if (isWordCharacter(after)) return undefined;

    if (this.overlapsProtected(input, cursor, cursor + token.length, context)) {
      return undefined;
    }

    const sourceText = input.slice(cursor, cursor + token.length);
    if (this.isProtectedText(sourceText)) return undefined;

    if (token.includes("-")) {
      return this.matchHyphenatedToken(input, cursor, token, context);
    }

    const generated = this.resolveWord(sourceText, context);
    if (!generated) return undefined;

    return {
      startIndex: cursor,
      endIndex: cursor + token.length,
      replacementText: generated.replacementText,
      entry: generated.entry,
      rule: generated.rule,
      normalizedRoot: generated.normalizedRoot,
      confidence: generated.confidence,
    };
  }

  /**
   * Phrase-level plural rule: singularizing one word of a multi-word phrase
   * produces an exact authorized phrase (General Officers Commanding -> GOCs).
   */
  findPhrasePlural(input: string, cursor: number, context: MorphContext): MorphMatch | undefined {
    const before = cursor > 0 ? input[cursor - 1] : undefined;
    if (isWordCharacter(before)) return undefined;

    const run = this.phraseRunAt(input, cursor);
    if (!run || !run.trim().includes(" ")) return undefined;
    const words = [...run.matchAll(/[A-Za-z]+/gu)];

    // The pluralized phrase may end before later words, so try every prefix
    // sub-run, longest first (longest authorized phrase wins).
    for (let end = words.length; end >= 2; end -= 1) {
      const last = words[end - 1];
      const subRun = run.slice(0, last.index! + last[0].length);
      if (this.overlapsProtected(input, cursor, cursor + subRun.length, context)) continue;
      const match = this.findSingularizedPhrase(subRun, context);
      if (match) {
        return {
          startIndex: cursor,
          endIndex: cursor + subRun.length,
          replacementText: match.replacementText,
          entry: match.entry,
          rule: "noun-plural",
          normalizedRoot: match.normalizedRoot,
          confidence: generatedConfidence(match.entry),
        };
      }
    }
    return undefined;
  }

  private findSingularizedPhrase(
    phrase: string,
    context: MorphContext,
  ): { replacementText: string; entry: AbbreviationEntry; normalizedRoot: string } | undefined {
    for (const candidate of phraseSingularCandidates(phrase, this.irregularForms)) {
      const matches = this.fullFormTrie
        .findMatchesAt(candidate, 0)
        .filter((match) => match.endIndex === candidate.length)
        .filter((match) =>
          normalizeForMatch(match.variant).trim() ===
          normalizeForMatch(candidate).trim(),
        );
      const match = matches
        .filter((candidate) => context.isAllowed(candidate.entry))
        .sort((left, right) => this.compareEntries(left.entry, right.entry, candidate, context))[0];
      if (!match) continue;
      const entry = match.entry;
      if (!context.isAllowed(entry)) continue;
      if (this.exceptions.isExactOnly(entry.id)) continue;
      if (this.verbIds.has(entry.id) || this.measurementIds.has(entry.id) ||
          (!this.permitsRule(entry.id, "noun_plural") && !this.permitsRule(entry.id, "plural_invariant"))) {
        continue;
      }
      const suffix = this.pluralInvariantIds.has(entry.id) ? "" : "s";
      return {
        replacementText: `${entry.abbreviation}${suffix}`,
        entry,
        normalizedRoot: match.variant,
      };
    }
    return undefined;
  }

  private resolveWord(
    sourceText: string,
    context: MorphContext,
  ): (GeneratedMatch & { entry: AbbreviationEntry }) | undefined {
    const model = this.wordModel(context);
    const verb = resolveVerbDerivative(sourceText, model, this.irregularForms);
    const noun = resolveNounPlural(sourceText, model, this.irregularForms);
    // A printed rank/noun such as Commander must outrank the generic
    // Command(er) verb family, just as it does for exact forward matching.
    if (verb && noun && verb.entry.id !== noun.entry.id) {
      const exactNoun = normalizeForMatch(noun.entry.full_form).trim() === normalizeForMatch(noun.normalizedRoot).trim();
      const selectedNoun = context.preferredService && context.preferredService !== "all" &&
        noun.entry.service === context.preferredService && verb.entry.service !== context.preferredService;
      if (exactNoun || selectedNoun) return noun;
    }
    return verb ?? noun ?? resolveCompound(sourceText, model);
  }

  private matchHyphenatedToken(
    input: string,
    cursor: number,
    token: string,
    context: MorphContext,
  ): MorphMatch | undefined {
    const segments = token.split("-");
    const pieces: Array<{ text: string; converted: boolean; exact: boolean }> = [];
    let convertedAny = false;
    let allExact = true;
    let entry: AbbreviationEntry | undefined;
    let rule: ReplacementRule = "compound-prefix";
    let root = token.toLocaleLowerCase("en");

    for (const segment of segments) {
      const exact = this.entriesForWord(segment, context)[0];
      if (exact && context.isAllowed(exact)) {
        pieces.push({ text: exact.abbreviation, converted: true, exact: true });
        convertedAny = true;
        entry = entry ?? exact;
        rule = "compound-suffix";
        continue;
      }
      const generated = isPlainWord(segment)
        ? this.resolveWord(segment, context)
        : undefined;
      if (generated) {
        pieces.push({
          text: generated.replacementText,
          converted: true,
          exact: false,
        });
        convertedAny = true;
        allExact = false;
        entry = entry ?? generated.entry;
        rule = generated.rule;
        root = generated.normalizedRoot;
      } else {
        pieces.push({ text: segment, converted: false, exact: false });
        allExact = false;
      }
    }

    if (!convertedAny || !entry) return undefined;
    return {
      startIndex: cursor,
      endIndex: cursor + token.length,
      replacementText: pieces.map((piece) => piece.text).join("-"),
      entry,
      rule,
      normalizedRoot: root,
      confidence: generatedConfidence(entry, allExact ? "medium" : "needs-review"),
    };
  }

  private wordModel(context: MorphContext): WordModel {
    return {
      entryForWord: (word) =>
        this.entriesForWord(word, context)[0],
      entriesForWord: (word) => this.entriesForWord(word, context),
      permitsRule: (id, rule) => this.permitsRule(id, rule),
      isVerb: (id) => this.verbIds.has(id),
      isExactOnly: (id) => this.exceptions.isExactOnly(id),
      isPluralInvariant: (id) => this.pluralInvariantIds.has(id),
      isMeasurement: (id) => this.measurementIds.has(id),
      irregularBaseOf: (word) => this.irregularForms[word],
      isAllowed: context.isAllowed,
      prefixes: this.overlay.compound_affixes.prefixes,
      suffixes: this.overlay.compound_affixes.suffixes,
      headWords: this.headWords,
    };
  }

  private wordTokenAt(input: string, cursor: number): string | undefined {
    const match = /^[A-Za-z]+(?:-[A-Za-z]+)*/u.exec(input.slice(cursor));
    return match?.[0];
  }

  private phraseRunAt(input: string, cursor: number): string | undefined {
    const match = /^[A-Za-z]+(?:\s+[A-Za-z]+){0,7}/u.exec(input.slice(cursor));
    return match?.[0];
  }

  private permitsRule(entryId: string, rule: string): boolean {
    if (rule.startsWith("compound_") && this.overlay.compound_enabled_entry_ids.length &&
        !this.overlay.compound_enabled_entry_ids.includes(entryId)) return false;
    const configured = this.overlay.entry_rules?.[entryId];
    const inherited = this.overlay.default_allowed_rules ?? ["noun_plural", "compound_suffix"];
    const allowed = configured ?? (this.verbIds.has(entryId) ? ["verb_forms", "compound_suffix", "compound_prefix"] : inherited);
    return allowed.includes(rule) || (rule.startsWith("compound_") && allowed.includes("compound_root"));
  }

  private entriesForWord(word: string, context: MorphContext): AbbreviationEntry[] {
    return [...(this.wordToEntries.get(normalizeForMatch(word).trim()) ?? [])]
      .filter((entry) => context.isAllowed(entry))
      .sort((left, right) => this.compareEntries(left, right, word, context));
  }

  private compareEntries(left: AbbreviationEntry, right: AbbreviationEntry, word: string, context: MorphContext): number {
    const normalized = normalizeForMatch(word).trim();
    if (context.preferredService && context.preferredService !== "all") {
      const leftService = left.service === context.preferredService;
      const rightService = right.service === context.preferredService;
      if (leftService !== rightService) return rightService ? 1 : -1;
    }
    const leftExact = normalizeForMatch(left.full_form).trim() === normalized;
    const rightExact = normalizeForMatch(right.full_form).trim() === normalized;
    if (leftExact !== rightExact) return rightExact ? 1 : -1;
    return right.match.priority - left.match.priority;
  }

  private overlapsProtected(
    input: string,
    startIndex: number,
    endIndex: number,
    context: MorphContext,
  ): boolean {
    return context.protectedRanges.some(
      (range) => startIndex < range.endIndex && endIndex > range.startIndex,
    );
  }
}
