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
import { MorphMatcher, type MorphMatch } from "./morphMatcher";
import {
  collectProtectedRanges,
  collectStaticProtectedRanges,
  overlapsProtectedRange,
  type ProtectedRange,
} from "./protector";
import { ExactExceptions } from "./exactExceptions";
import {
  decideFromLearning,
} from "./learning";
import { applyForwardOverrides, rulesOverlay } from "./rulesOverlay";
import {
  applyFormattingEdits,
  compassAt,
  documentPolicyAllowsEntry,
  documentProtectedRanges,
  fullTextPolicy,
  isRestrictedContext,
  personnelFormattingEdits,
  remapFormattingOffset,
  type DocumentPolicyConfig,
} from "./documentPolicies";
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

function normalizedExact(value: string): string {
  return normalizeForMatch(value, false).trim();
}

/**
 * Paragraph 0241 sentence case: when a capitalized source word begins a
 * sentence (start of text or after ., !, ?, : or a newline), its replacement
 * keeps the capital ("Minimum Warning Range" → "Min wng rng"). Already
 * uppercase abbreviations are untouched.
 */
function capitalizeAtSentenceStart(
  input: string,
  startIndex: number,
  replacement: string,
): string {
  if (!replacement) return replacement;
  const firstChar = replacement.charAt(0);
  if (firstChar !== firstChar.toLocaleLowerCase("en")) return replacement;
  const sourceFirst = input.charAt(startIndex);
  if (sourceFirst !== sourceFirst.toLocaleUpperCase("en")) return replacement;
  if (sourceFirst === sourceFirst.toLocaleLowerCase("en")) return replacement;
  let lookback = startIndex - 1;
  while (lookback >= 0 && input[lookback] !== "\n" && /\s/u.test(input[lookback])) lookback -= 1;
  if (lookback < 0 || /[.!?:\n]/u.test(input[lookback])) {
    return firstChar.toLocaleUpperCase("en") + replacement.slice(1);
  }
  return replacement;
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
  private readonly morphMatcher: MorphMatcher;
  private readonly exactExceptions: ExactExceptions;
  private readonly documentPolicies: DocumentPolicyConfig;

  constructor(private readonly dataset: AbbreviationDataset) {
    // The overlay is configured at runtime from the rules and overrides
    // layers. An unconfigured engine would silently drop every paragraph
    // 0241 morphology rule, so refuse to start instead.
    if (rulesOverlay.version === "0.0.0") {
      throw new Error(
        "The paragraph 0241 rules overlay is not configured. Call configureRulesOverlay before constructing a ConverterEngine.",
      );
    }
    dataset.converter_config.replacement_entry_ids.forEach((id, index) => {
      this.orderById.set(id, index);
    });
    // Paragraph 0241 overrides: entries the dataset ships with conversion
    // disabled but which the rules overlay enables are registered with their
    // authorized variants. Reverse conversion keeps the original records.
    const forwardEntries = applyForwardOverrides(dataset.entries, rulesOverlay);
    forwardEntries.forEach((entry, index) => {
      const order = this.orderById.get(entry.id) ?? dataset.entries.length + index;
      if (entry.conversion_enabled) {
        entry.match_variants.forEach((variant) => {
          this.fullFormTrie.add(variant, { entry, variant, order });
        });
      }
    });
    dataset.entries.forEach((entry, index) => {
      this.entriesById.set(entry.id, entry);
      const order = this.orderById.get(entry.id) ?? dataset.entries.length + index;
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
    this.morphMatcher = new MorphMatcher(dataset, this.fullFormTrie);
    this.exactExceptions = new ExactExceptions(rulesOverlay.exact_only_entry_ids);
    this.documentPolicies = rulesOverlay.document_policies as DocumentPolicyConfig;
    for (const entry of [
      ...this.morphMatcher.generatedReverseEntries(),
      ...this.contextMatcher.generatedReverseEntries(forwardEntries),
    ]) {
      this.entriesById.set(entry.id, entry);
      this.abbreviationTrie.add(entry.abbreviation, {
        entry, variant: entry.abbreviation, order: dataset.entries.length + this.entriesById.size,
      });
    }
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
    const retainText = fullTextPolicy(options, this.documentPolicies);
    if (retainText) {
      return this.result(input, input, "full-to-abbreviation", [], [], [], [...warnings, retainText], options);
    }
    const replacements: ReplacementRecord[] = [];
    const parts: string[] = [];
    let outputLength = 0;
    let mediumConfidenceCount = 0;
    const documentChoices = new Map<string, string>();

    const isAllowed = (entry: AbbreviationEntry) =>
      this.isEntryAllowed(entry, options, true);
    const protectedRanges = collectProtectedRanges(
      input,
      this.abbreviationTrie,
      (entry) => this.isEntryAllowed(entry, options, false),
    );
    protectedRanges.push(...documentProtectedRanges(input, options, this.dataset.entries, this.documentPolicies));
    protectedRanges.sort((left, right) => left.startIndex - right.startIndex || right.endIndex - left.endIndex);
    for (let index = protectedRanges.length - 1; index > 0; index -= 1) {
      const earlier = protectedRanges[index - 1];
      const later = protectedRanges[index];
      if (later.startIndex < earlier.endIndex) {
        earlier.endIndex = Math.max(earlier.endIndex, later.endIndex);
        protectedRanges.splice(index, 1);
      }
    }
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
              !this.morphMatcher.isProtectedText(
                input.slice(match.startIndex, match.endIndex),
              ),
          )
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

      const compassCandidate = compassAt(input, cursor, !isRestrictedContext(options, this.documentPolicies));
      const compass = selected && compassCandidate && selected.endIndex > compassCandidate.end ? undefined : compassCandidate;
      const ampersand = options.context === "departmental-title" &&
        (cursor === 0 || !isWordCharacter(input[cursor - 1])) && /^and\b/iu.test(input.slice(cursor));
      const policyText = compass?.text ?? (ampersand ? "&" : undefined);
      const policyEnd = compass?.end ?? (ampersand ? cursor + 3 : undefined);
      if (policyText !== undefined && policyEnd !== undefined && !overlapsProtectedRange(protectedRanges, cursor, policyEnd)) {
        const sourceText = input.slice(cursor, policyEnd);
        const outputStartIndex = outputLength;
        append(policyText);
        if (sourceText !== policyText) replacements.push({
          entryId: compass ? "policy-compass" : "policy-ampersand",
          matchedVariant: sourceText,
          sourceText,
          replacementText: policyText,
          startIndex: cursor,
          endIndex: policyEnd,
          outputStartIndex,
          outputEndIndex: outputLength,
          annex: "",
          service: options.service ?? "all",
          category: "document-policy",
          confidence: "high",
          resolution: "context-rule",
          rule: "document-policy",
        });
        cursor = policyEnd;
        continue;
      }

      // A pluralized authorized phrase (General Officers Commanding -> GOCs)
      // outranks a shorter exact match starting at the same position.
      const morphContext = { isAllowed, protectedRanges, preferredService: options.service };
      let morph = this.morphMatcher.findPhrasePlural(input, cursor, morphContext);
      if (morph && selected && morph.endIndex <= selected.endIndex) {
        morph = undefined;
      }
      if (!morph && !selected) {
        morph = this.findMorphMatch(input, cursor, isAllowed, protectedRanges, options.service);
      }

      if (morph) {
        const morphSource = input.slice(morph.startIndex, morph.endIndex);
        // Generated replacements carry affix letters (demob, ldrship), so the
        // context formatter cannot be used verbatim; only its case rules apply.
        const morphContextual = this.contextMatcher.formatReplacement(
          morph.entry,
          options.context,
        );
        const morphBase = morphContextual.contextual
          ? morph.replacementText.toLocaleLowerCase("en")
          : morph.replacementText;
        const choiceKey = normalizeForMatch(morphSource).trim();
        const chosenBase = documentChoices.get(choiceKey) ?? morphBase;
        documentChoices.set(choiceKey, chosenBase);
        const morphText = capitalizeAtSentenceStart(input, morph.startIndex, chosenBase);
        const morphOutputStart = outputLength;
        append(morphText);
        replacements.push({
          entryId: morph.entry.id,
          matchedVariant: morph.normalizedRoot,
          sourceText: morphSource,
          replacementText: morphText,
          startIndex: morph.startIndex,
          endIndex: morph.endIndex,
          outputStartIndex: morphOutputStart,
          outputEndIndex: outputLength,
          annex: morph.entry.annex,
          service: morph.entry.service,
          category: morph.entry.category,
          confidence: morph.confidence,
          resolution: "automatic",
          rule: morph.rule,
          normalizedRoot: morph.normalizedRoot,
        });
        if (morph.confidence === "medium") mediumConfidenceCount += 1;
        cursor = morph.endIndex;
        continue;
      }

      if (!selected) {
        append(input[cursor]);
        cursor += 1;
        continue;
      }

      const sourceText = input.slice(selected.startIndex, selected.endIndex);
      const formatted = useContext
        ? { text: contextual.replacementText, contextual: true }
        : this.contextMatcher.formatReplacement(selected.entry, options.context);
      const choiceKey = normalizeForMatch(sourceText).trim();
      const chosenBase = documentChoices.get(choiceKey) ?? formatted.text;
      documentChoices.set(choiceKey, chosenBase);
      const qualificationCase = formatted.contextual &&
        (options.context === "military-qualification" || options.context === "personnel-line");
      const outputText = qualificationCase ? chosenBase : capitalizeAtSentenceStart(input, selected.startIndex, chosenBase);
      const outputStartIndex = outputLength;
      append(outputText);

      replacements.push({
        entryId: selected.entry.id,
        matchedVariant: selected.variant,
        sourceText,
        replacementText: outputText,
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
        rule: useContext ? "context-generated" : /^(?:custom|learned)-/u.test(selected.entry.id) ? "reviewer-approved" : this.exactExceptions.isExactOnly(selected.entry.id)
          ? "exact-exception"
          : "exact-authorized",
      });
      if (selected.entry.quality.confidence === "medium") {
        mediumConfidenceCount += 1;
      }
      cursor = selected.endIndex;
    }

    this.addMediumConfidenceWarning(warnings, mediumConfidenceCount);
    this.addNeedsReviewWarning(warnings, replacements);
    let convertedText = parts.join("");
    if (options.context === "personnel-line") {
      const edits = personnelFormattingEdits(convertedText, this.dataset.entries, this.documentPolicies);
      const formattedText = applyFormattingEdits(convertedText, edits);
      if (formattedText !== convertedText) {
        for (const replacement of replacements) {
          const start = remapFormattingOffset(replacement.outputStartIndex, edits);
          const end = remapFormattingOffset(replacement.outputEndIndex, edits, true);
          replacement.outputStartIndex = start;
          replacement.outputEndIndex = end;
          replacement.replacementText = formattedText.slice(start, end);
        }
        warnings.push("Personnel-line initials and qualification punctuation follow the source format.");
      }
      convertedText = formattedText;
    }
    return this.result(
      input,
      convertedText,
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
    let learnedAutoCount = 0;

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
      rawMatches.push(...this.generatedReverseMatchesAt(input, cursor, protectedRanges));
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

        // Learned preference: rank the remaining candidates by previous
        // confirmations in this service + context. Strong personal evidence
        // (repeated clean confirmations) or strong community evidence is
        // applied automatically; weaker evidence is advisory only and still
        // waits for the user's confirmation.
        const learningContext = {
          abbreviation: sourceText,
          service: options.service ?? "all",
          writingContext: options.context ?? "internal-service-writing",
          direction: "abbreviation-to-full" as const,
        };
        const decision = decideFromLearning(
          choices,
          options.learning,
          options.communityLearning,
          learningContext,
        );
        const suggestion = decision?.suggestion;
        const explicitChoice = this.resolveChoice(
          sourceText,
          longest.startIndex,
          choices,
          options,
        );
        const learnedChoice =
          !explicitChoice && decision?.autoApply
            ? choices.find((choice) => choice.id === decision.suggestion.choiceId)
            : undefined;
        if (learnedChoice) learnedAutoCount += 1;
        const selectedChoice = explicitChoice ?? learnedChoice;

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
            resolution: explicitChoice ? "user-selected" : learnedChoice ? "learned" : "automatic",
            rule: entry.generated?.rule ?? (/^(?:custom|learned)-/u.test(entry.id) ? "reviewer-approved" : "exact-authorized"),
            ...(entry.generated ? { normalizedRoot: entry.generated.root } : {}),
          });
          if (entry.quality.confidence === "medium") {
            mediumConfidenceCount += 1;
          }
        } else {
          const outputStartIndex = outputLength;
          append(sourceText);
          const ambiguity: ConversionResult["ambiguities"][number] = {
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
          };
          if (suggestion) ambiguity.suggestion = suggestion;
          ambiguities.push(ambiguity);
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
    if (learnedAutoCount) {
      warnings.push(
        `${learnedAutoCount} meaning${learnedAutoCount === 1 ? " was" : "s were"} chosen automatically from learned preferences — review it and correct it if it does not fit this text.`,
      );
    }
    if (unresolved.length) {
      warnings.push(
        `${unresolved.length} abbreviation-like term${unresolved.length === 1 ? " was" : "s were"} left unchanged because no authorized expansion was available.`,
      );
    }
    this.addMediumConfidenceWarning(warnings, mediumConfidenceCount);
    this.addNeedsReviewWarning(warnings, replacements);

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
          this.validReverseSurface(input, match.startIndex, match.endIndex, match.variant),
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

  private generatedReverseMatchesAt(input: string, cursor: number, protectedRanges: ProtectedRange[]): TrieMatch[] {
    if (cursor > 0 && isWordCharacter(input[cursor - 1])) return [];
    const token = /^[A-Za-z][A-Za-z0-9]*(?:[&/-][A-Za-z0-9]+)*/u.exec(input.slice(cursor))?.[0];
    if (!token || isWordCharacter(input[cursor + token.length])) return [];
    if (overlapsProtectedRange(protectedRanges, cursor, cursor + token.length)) return [];
    return this.morphMatcher.generatedReverseCandidates(token)
      .filter((entry) => this.validReverseSurface(input, cursor, cursor + token.length, entry.abbreviation))
      .map((entry, index) => {
      this.entriesById.set(entry.id, entry);
      return {
        entry,
        variant: token,
        order: this.dataset.entries.length + index,
        startIndex: cursor,
        endIndex: cursor + token.length,
      };
    });
  }

  private validReverseSurface(input: string, start: number, end: number, canonical: string): boolean {
    const source = normalizedExact(input.slice(start, end));
    return source === normalizedExact(canonical) ||
      source === normalizedExact(capitalizeAtSentenceStart(input, start, canonical));
  }

  private entriesForReverseMatch(
    matches: TrieMatch[],
    selected: TrieMatch,
    options: ConversionOptions,
  ): AbbreviationEntry[] {
    const selectedSource = normalizeForMatch(selected.variant);
    const seen = new Set<string>();
    return matches
      .filter((match) => match.endIndex === selected.endIndex)
      .filter((match) => normalizeForMatch(match.variant) === selectedSource)
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

      const selectedService = options.service;
      if (selectedService && selectedService !== "all") {
        const leftService = left.entry.service === selectedService;
        const rightService = right.entry.service === selectedService;
        if (leftService !== rightService) return rightService ? 1 : -1;
      }

      const leftExact =
        normalizeForMatch(left.variant).trim() ===
        normalizeForMatch(left.entry.full_form).trim();
      const rightExact =
        normalizeForMatch(right.variant).trim() ===
        normalizeForMatch(right.entry.full_form).trim();
      if (leftExact !== rightExact) return rightExact ? 1 : -1;

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
    if (forward && !documentPolicyAllowsEntry(entry, options, this.documentPolicies)) return false;
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
    const warnings: string[] = [];
    if (isRestrictedContext(options, this.documentPolicies)) {
      warnings.push("This document type permits abbreviations only for decorations, qualifications and arms or services.");
    }
    if (options.context === "air-force-operational-paper" && options.service !== "air-force") {
      warnings.push("Select Air Force to use the BAF exception for service papers on operational matters.");
    }
    if (options.context === "address-box") {
      warnings.push("Navy ranks of Commodore and above remain in full in the correspondence address box.");
    }
    return warnings;
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

  private addNeedsReviewWarning(
    warnings: string[],
    replacements: ReplacementRecord[],
  ): void {
    const count = replacements.filter(
      (replacement) => replacement.confidence === "needs-review",
    ).length;
    if (!count) return;
    warnings.push(
      `${count} generated replacement${count === 1 ? " needs" : "s need"} review because the compound or derivative form may be unclear.`,
    );
  }

  /**
   * Paragraph 0241 rule priority after exact matching: verb derivatives, then
   * noun plurals, then controlled compounds. The phrase-level plural rule is
   * checked separately so it can outrank shorter exact matches.
   */
  private findMorphMatch(
    input: string,
    cursor: number,
    isAllowed: (entry: AbbreviationEntry) => boolean,
    protectedRanges: ProtectedRange[],
    preferredService?: ConversionOptions["service"],
  ): MorphMatch | undefined {
    return this.morphMatcher.findMatch(input, cursor, {
      isAllowed,
      protectedRanges,
      preferredService,
    });
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
