import {
  buildMeaningChoices,
  getConflictPolicy,
  sentenceAround,
} from "./ambiguityResolver";
import { ContextRuleMatcher, type ContextualMatch } from "./contextRules";
import {
  hasValidBoundaries,
  isWordCharacter,
  normalizeForMatch,
  PhraseTrie,
  type TrieMatch,
} from "./phraseTrie";
import {
  collectProtectedRanges,
  collectStaticProtectedRanges,
  overlapsProtectedRange,
  type ProtectedRange,
} from "./protector";
import type {
  AbbreviationDataset,
  AbbreviationEntry,
  AmbiguityChoice,
  ConversionDirection,
  ConversionOptions,
  ConversionResult,
  ReplacementRecord,
  UnresolvedRecord,
} from "./types";

const CIVILIAN_WARNING =
  "The source discourages Service abbreviations when addressing foreign, non-service or civilian authorities. Review the result before use.";

function normalizedExact(value: string): string {
  return normalizeForMatch(value, false).trim();
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function resolutionKeyForOccurrence(startIndex: number): string {
  return `occurrence:${startIndex}`;
}

export function resolutionKeyForAll(abbreviation: string): string {
  return `all:${normalizeForMatch(abbreviation).trim()}`;
}

export class ConverterEngine {
  private readonly fullFormTrie = new PhraseTrie();
  private readonly abbreviationTrie = new PhraseTrie();
  private readonly orderById = new Map<string, number>();
  private readonly entriesById = new Map<string, AbbreviationEntry>();
  private readonly conflictsByAbbreviation = new Map(
    this.dataset.conflicts.map((conflict) => [
      normalizeForMatch(conflict.abbreviation).trim(),
      conflict,
    ]),
  );
  private readonly contextMatcher: ContextRuleMatcher;
  private readonly standardEnglishAbbreviations: Set<string>;

  constructor(private readonly dataset: AbbreviationDataset) {
    dataset.converter_config.replacement_entry_ids.forEach((id, index) => {
      this.orderById.set(id, index);
    });
    dataset.entries.forEach((entry, index) => {
      this.entriesById.set(entry.id, entry);
      const order = this.orderById.get(entry.id) ?? dataset.entries.length + index;
      if (entry.conversion_enabled) {
        entry.match_variants.forEach((variant) => {
          this.fullFormTrie.add(variant, { entry, variant, order });
        });
      }
      this.abbreviationTrie.add(entry.abbreviation, {
        entry,
        variant: entry.abbreviation,
        order,
      });
    });
    this.contextMatcher = new ContextRuleMatcher(
      dataset.converter_config,
      this.fullFormTrie,
    );
    this.standardEnglishAbbreviations = this.readStandardEnglishAbbreviations();
  }

  convert(
    input: string,
    direction: ConversionDirection,
    options: ConversionOptions = {},
  ): ConversionResult {
    return direction === "full-to-abbreviation"
      ? this.convertForward(input, options)
      : this.convertReverse(input, options);
  }

  convertForward(
    input: string,
    options: ConversionOptions = {},
  ): ConversionResult {
    const warnings = this.initialWarnings(options);
    const replacements: ReplacementRecord[] = [];
    const parts: string[] = [];
    let outputLength = 0;
    let mediumConfidenceCount = 0;

    const isAllowed = (entry: AbbreviationEntry) =>
      this.isEntryAllowed(entry, options, true);
    const protectedRanges = collectProtectedRanges(
      input,
      this.abbreviationTrie,
      (entry) => this.isEntryAllowed(entry, options, false),
    );
    let protectedIndex = 0;
    let cursor = 0;

    const append = (value: string) => {
      parts.push(value);
      outputLength += value.length;
    };

    while (cursor < input.length) {
      while (
        protectedIndex < protectedRanges.length &&
        protectedRanges[protectedIndex].endIndex <= cursor
      ) {
        protectedIndex += 1;
      }
      const protectedRange = protectedRanges[protectedIndex];
      if (
        protectedRange &&
        cursor >= protectedRange.startIndex &&
        cursor < protectedRange.endIndex
      ) {
        const protectedText = input.slice(cursor, protectedRange.endIndex);
        append(protectedText);
        cursor = protectedRange.endIndex;
        continue;
      }

      const ordinary = this.selectForwardMatch(
        this.fullFormTrie
          .findMatchesAt(input, cursor)
          .filter((match) => isAllowed(match.entry))
          .filter((match) => hasValidBoundaries(input, match))
          .filter(
            (match) =>
              !overlapsProtectedRange(
                protectedRanges,
                match.startIndex,
                match.endIndex,
              ),
          ),
        options,
      );

      const contextual = this.selectContextualMatch(
        this.contextMatcher
          .findAt(input, cursor, isAllowed)
          .filter(
            (match) =>
              !overlapsProtectedRange(
                protectedRanges,
                match.startIndex,
                match.endIndex,
              ),
          ),
      );

      const useContext =
        contextual &&
        (!ordinary ||
          contextual.endIndex - contextual.startIndex >
            ordinary.endIndex - ordinary.startIndex);
      const selected = useContext ? contextual : ordinary;

      if (!selected) {
        append(input[cursor]);
        cursor += 1;
        continue;
      }

      const sourceText = input.slice(selected.startIndex, selected.endIndex);
      const formatted = useContext
        ? { text: contextual.replacementText, contextual: true }
        : this.contextMatcher.formatReplacement(selected.entry, options.context);
      const outputStartIndex = outputLength;
      append(formatted.text);

      replacements.push({
        entryId: selected.entry.id,
        matchedVariant: selected.variant,
        sourceText,
        replacementText: formatted.text,
        startIndex: selected.startIndex,
        endIndex: selected.endIndex,
        outputStartIndex,
        outputEndIndex: outputLength,
        annex: selected.entry.annex,
        service: selected.entry.service,
        category: selected.entry.category,
        confidence: selected.entry.quality.confidence,
        resolution:
          useContext || formatted.contextual ? "context-rule" : "automatic",
      });
      if (selected.entry.quality.confidence === "medium") {
        mediumConfidenceCount += 1;
      }
      cursor = selected.endIndex;
    }

    this.addMediumConfidenceWarning(warnings, mediumConfidenceCount);
    return this.result(
      input,
      parts.join(""),
      "full-to-abbreviation",
      replacements,
      [],
      [],
      warnings,
      options,
    );
  }

  convertReverse(
    input: string,
    options: ConversionOptions = {},
  ): ConversionResult {
    const warnings = this.initialWarnings(options);
    const replacements: ReplacementRecord[] = [];
    const ambiguities: ConversionResult["ambiguities"] = [];
    const unresolved: UnresolvedRecord[] = [];
    const parts: string[] = [];
    const protectedRanges = collectStaticProtectedRanges(input);
    let protectedIndex = 0;
    let outputLength = 0;
    let cursor = 0;
    let mediumConfidenceCount = 0;

    const append = (value: string) => {
      parts.push(value);
      outputLength += value.length;
    };

    while (cursor < input.length) {
      while (
        protectedIndex < protectedRanges.length &&
        protectedRanges[protectedIndex].endIndex <= cursor
      ) {
        protectedIndex += 1;
      }
      const protectedRange = protectedRanges[protectedIndex];
      if (
        protectedRange &&
        cursor >= protectedRange.startIndex &&
        cursor < protectedRange.endIndex
      ) {
        const protectedText = input.slice(cursor, protectedRange.endIndex);
        append(protectedText);
        cursor = protectedRange.endIndex;
        continue;
      }

      const rawMatches = this.exactAbbreviationMatchesAt(
        input,
        cursor,
        protectedRanges,
      );
      const allowedMatches = rawMatches.filter((match) =>
        this.isEntryAllowed(match.entry, options, false),
      );
      const longest = this.selectLongestAbbreviation(allowedMatches);

      if (longest) {
        const sameAbbreviationEntries = this.entriesForReverseMatch(
          allowedMatches,
          longest,
          options,
        );
        const choices = buildMeaningChoices(sameAbbreviationEntries);
        const sourceText = input.slice(longest.startIndex, longest.endIndex);
        const selectedChoice = this.resolveChoice(
          sourceText,
          longest.startIndex,
          choices,
          options,
        );

        if (choices.length === 1 || selectedChoice) {
          const choice = selectedChoice ?? choices[0];
          const entry = this.entriesById.get(choice.entryId) ?? longest.entry;
          const replacementText = choice.meaning;
          const outputStartIndex = outputLength;
          append(replacementText);
          replacements.push({
            entryId: entry.id,
            matchedVariant: longest.variant,
            sourceText,
            replacementText,
            startIndex: longest.startIndex,
            endIndex: longest.endIndex,
            outputStartIndex,
            outputEndIndex: outputLength,
            annex: entry.annex,
            service: entry.service,
            category: entry.category,
            confidence: entry.quality.confidence,
            resolution: selectedChoice ? "user-selected" : "automatic",
          });
          if (entry.quality.confidence === "medium") {
            mediumConfidenceCount += 1;
          }
        } else {
          const outputStartIndex = outputLength;
          append(sourceText);
          ambiguities.push({
            abbreviation: sourceText,
            sourceText,
            startIndex: longest.startIndex,
            endIndex: longest.endIndex,
            outputStartIndex,
            outputEndIndex: outputLength,
            surroundingSentence: sentenceAround(
              input,
              longest.startIndex,
              longest.endIndex,
            ),
            policy: getConflictPolicy(
              sourceText,
              this.conflictsByAbbreviation,
            ),
            choices,
          });
        }
        cursor = longest.endIndex;
        continue;
      }

      const unknown = this.unknownAbbreviationAt(input, cursor);
      if (unknown) {
        const outputStartIndex = outputLength;
        append(unknown);
        unresolved.push({
          sourceText: unknown,
          startIndex: cursor,
          endIndex: cursor + unknown.length,
          outputStartIndex,
          outputEndIndex: outputLength,
          reason: rawMatches.length
            ? "no-authorized-match"
            : "unknown-abbreviation",
        });
        cursor += unknown.length;
        continue;
      }

      append(input[cursor]);
      cursor += 1;
    }

    if (ambiguities.length) {
      warnings.push(
        `${ambiguities.length} ambiguous occurrence${ambiguities.length === 1 ? " requires" : "s require"} user selection; no meaning was guessed.`,
      );
    }
    if (unresolved.length) {
      warnings.push(
        `${unresolved.length} abbreviation-like term${unresolved.length === 1 ? " was" : "s were"} left unchanged because no authorized expansion was available.`,
      );
    }
    this.addMediumConfidenceWarning(warnings, mediumConfidenceCount);

    return this.result(
      input,
      parts.join(""),
      "abbreviation-to-full",
      replacements,
      ambiguities,
      unresolved,
      warnings,
      options,
    );
  }

  private exactAbbreviationMatchesAt(
    input: string,
    cursor: number,
    protectedRanges: ProtectedRange[],
  ): TrieMatch[] {
    return this.abbreviationTrie
      .findMatchesAt(input, cursor)
      .filter((match) => hasValidBoundaries(input, match))
      .filter(
        (match) =>
          normalizedExact(input.slice(match.startIndex, match.endIndex)) ===
          normalizedExact(match.variant),
      )
      .filter(
        (match) =>
          !overlapsProtectedRange(
            protectedRanges,
            match.startIndex,
            match.endIndex,
          ),
      );
  }

  private entriesForReverseMatch(
    matches: TrieMatch[],
    selected: TrieMatch,
    options: ConversionOptions,
  ): AbbreviationEntry[] {
    const selectedSource = normalizedExact(selected.variant);
    const seen = new Set<string>();
    return matches
      .filter((match) => match.endIndex === selected.endIndex)
      .filter((match) => normalizedExact(match.variant) === selectedSource)
      .sort((left, right) => this.compareEntryPreference(left, right, options))
      .map((match) => match.entry)
      .filter((entry) => {
        if (seen.has(entry.id)) return false;
        seen.add(entry.id);
        return true;
      });
  }

  private resolveChoice(
    abbreviation: string,
    startIndex: number,
    choices: AmbiguityChoice[],
    options: ConversionOptions,
  ): AmbiguityChoice | undefined {
    const choiceId =
      options.resolutions?.[resolutionKeyForOccurrence(startIndex)] ??
      options.resolutions?.[resolutionKeyForAll(abbreviation)];
    return choices.find((choice) => choice.id === choiceId);
  }

  private selectForwardMatch(
    matches: TrieMatch[],
    options: ConversionOptions,
  ): TrieMatch | undefined {
    return [...matches].sort((left, right) => {
      const lengthDifference =
        right.endIndex - right.startIndex -
        (left.endIndex - left.startIndex);
      if (lengthDifference) return lengthDifference;

      const leftExact =
        normalizeForMatch(left.variant).trim() ===
        normalizeForMatch(left.entry.full_form).trim();
      const rightExact =
        normalizeForMatch(right.variant).trim() ===
        normalizeForMatch(right.entry.full_form).trim();
      if (leftExact !== rightExact) return rightExact ? 1 : -1;

      const selectedService = options.service;
      if (selectedService && selectedService !== "all") {
        const leftService = left.entry.service === selectedService;
        const rightService = right.entry.service === selectedService;
        if (leftService !== rightService) return rightService ? 1 : -1;
      }

      const priorityDifference =
        right.entry.match.priority - left.entry.match.priority;
      if (priorityDifference) return priorityDifference;
      return left.order - right.order;
    })[0];
  }

  private compareEntryPreference(
    left: TrieMatch,
    right: TrieMatch,
    options: ConversionOptions,
  ): number {
    const selectedService = options.service;
    if (selectedService && selectedService !== "all") {
      const leftService = left.entry.service === selectedService;
      const rightService = right.entry.service === selectedService;
      if (leftService !== rightService) return rightService ? 1 : -1;
    }
    return left.order - right.order;
  }

  private selectContextualMatch(
    matches: ContextualMatch[],
  ): ContextualMatch | undefined {
    return [...matches].sort(
      (left, right) =>
        right.endIndex - right.startIndex -
          (left.endIndex - left.startIndex) ||
        left.order - right.order,
    )[0];
  }

  private selectLongestAbbreviation(
    matches: TrieMatch[],
  ): TrieMatch | undefined {
    return [...matches].sort(
      (left, right) =>
        right.endIndex - right.startIndex -
          (left.endIndex - left.startIndex) ||
        left.order - right.order,
    )[0];
  }

  private isEntryAllowed(
    entry: AbbreviationEntry,
    options: ConversionOptions,
    forward: boolean,
  ): boolean {
    if (forward && !entry.conversion_enabled) return false;
    if (
      options.annex &&
      options.annex !== "all" &&
      entry.annex !== options.annex
    ) {
      return false;
    }
    if (options.service && options.service !== "all") {
      if (options.service === "tri-service") {
        if (entry.service !== "tri-service") return false;
      } else if (
        entry.service !== "tri-service" &&
        entry.service !== options.service
      ) {
        return false;
      }
    }
    if (
      options.context !== "signal-message" &&
      this.contextMatcher.isSignalOnlyEntry(entry)
    ) {
      return false;
    }
    return true;
  }

  private unknownAbbreviationAt(input: string, cursor: number): string | undefined {
    const before = cursor > 0 ? input[cursor - 1] : undefined;
    if (isWordCharacter(before)) return undefined;

    const match = /^[A-Z][A-Z0-9]*(?:[&/.-][A-Z0-9]+)*/u.exec(
      input.slice(cursor),
    );
    if (!match || match[0].length < 2) return undefined;
    const after = input[cursor + match[0].length];
    if (isWordCharacter(after)) return undefined;
    const normalized = match[0].replace(/\./g, "").toLocaleLowerCase("en");
    if (this.standardEnglishAbbreviations.has(normalized)) return undefined;
    return match[0];
  }

  private initialWarnings(options: ConversionOptions): string[] {
    return options.context === "civilian-external-correspondence"
      ? [CIVILIAN_WARNING]
      : [];
  }

  private addMediumConfidenceWarning(
    warnings: string[],
    count: number,
  ): void {
    if (!count) return;
    warnings.push(
      `${count} replacement${count === 1 ? " uses" : "s use"} a medium-confidence dataset record. Verify against the source manual before operational use.`,
    );
  }

  private readStandardEnglishAbbreviations(): Set<string> {
    const rule = this.dataset.converter_config.scope_rules.find((value) =>
      value.toLocaleLowerCase("en").includes("standard english abbreviations"),
    );
    if (!rule) return new Set();
    const start = rule.toLocaleLowerCase("en").indexOf("such as");
    const end = rule.toLocaleLowerCase("en").lastIndexOf("unchanged");
    const examples = rule.slice(start >= 0 ? start + 7 : 0, end > start ? end : undefined);
    const values = examples.match(/(?:[A-Za-z]\.){2,}|[A-Za-z]{2,}/g) ?? [];
    return new Set(
      values
        .map((value) => value.replace(/\./g, "").toLocaleLowerCase("en"))
        .filter((value) => value !== "and"),
    );
  }

  private result(
    originalText: string,
    convertedText: string,
    direction: ConversionDirection,
    replacements: ReplacementRecord[],
    ambiguities: ConversionResult["ambiguities"],
    unresolved: UnresolvedRecord[],
    warnings: string[],
    options: ConversionOptions,
  ): ConversionResult {
    return {
      originalText,
      convertedText,
      direction,
      replacements,
      ambiguities,
      unresolved,
      warnings: unique(warnings),
      appliedFilters: {
        service: options.service ?? "all",
        annex: options.annex ?? "all",
        context: options.context ?? "internal-service-writing",
      },
    };
  }
}

let defaultEngine: ConverterEngine | undefined;

/** Registers the dynamically loaded dataset for concise integration and tests. */
export function setDefaultDataset(dataset: AbbreviationDataset): ConverterEngine {
  defaultEngine = new ConverterEngine(dataset);
  return defaultEngine;
}

export function convertFullFormToAbbreviation(
  input: string,
  options: ConversionOptions = {},
): string {
  if (!defaultEngine) {
    throw new Error("The abbreviation dataset has not been initialized.");
  }
  return defaultEngine.convertForward(input, options).convertedText;
}

export function convertAbbreviationToFullForm(
  input: string,
  options: ConversionOptions = {},
): ConversionResult {
  if (!defaultEngine) {
    throw new Error("The abbreviation dataset has not been initialized.");
  }
  return defaultEngine.convertReverse(input, options);
}
