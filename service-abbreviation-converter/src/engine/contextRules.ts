import {
  hasValidBoundaries,
  normalizeForMatch,
  PhraseTrie,
  type TrieMatch,
} from "./phraseTrie";
import type {
  AbbreviationEntry,
  ConverterConfig,
  WritingContext,
} from "./types";

export interface ContextualMatch extends TrieMatch {
  replacementText: string;
  ruleId: string;
}

interface PrefixDefinition {
  ruleId: string;
  expression: RegExp;
  allowRank: boolean;
  format: (abbreviation: string) => string;
}

const PREFIXES: PrefixDefinition[] = [
  {
    ruleId: "appointment-deputy-assistant",
    expression: /^Deputy\s+Assistant\s+/iu,
    allowRank: false,
    format: (abbreviation) => `DA${abbreviation}`,
  },
  {
    ruleId: "appointment-officiating",
    expression: /^Officiating\s+/iu,
    allowRank: false,
    format: (abbreviation) => `Offg ${abbreviation}`,
  },
  {
    ruleId: "appointment-acting",
    expression: /^Acting\s+/iu,
    allowRank: false,
    format: (abbreviation) => `A/${abbreviation}`,
  },
  {
    ruleId: "appointment-assistant",
    expression: /^Assistant\s+/iu,
    allowRank: false,
    format: (abbreviation) => `A${abbreviation}`,
  },
  {
    ruleId: "appointment-deputy",
    expression: /^Deputy\s+/iu,
    allowRank: false,
    format: (abbreviation) => `Dy ${abbreviation}`,
  },
  {
    ruleId: "appointment-vice",
    expression: /^Vice\s+/iu,
    allowRank: true,
    format: (abbreviation) => `V ${abbreviation}`,
  },
];

const FORMATION_AFTER_NATIONALITY = /^(?:\s+)(?:Fleet|Force|Army|Navy|Air\s+Force|Corps|Division|Brigade|Battalion|Regiment|Squadron|Wing|Group|Formation|Unit)\b/iu;

function selectBaseMatch(matches: TrieMatch[]): TrieMatch | undefined {
  return [...matches].sort((left, right) => {
    const lengthDifference =
      right.endIndex - right.startIndex - (left.endIndex - left.startIndex);
    if (lengthDifference) return lengthDifference;

    const leftExact =
      normalizeForMatch(left.variant).trim() ===
      normalizeForMatch(left.entry.full_form).trim();
    const rightExact =
      normalizeForMatch(right.variant).trim() ===
      normalizeForMatch(right.entry.full_form).trim();
    if (leftExact !== rightExact) return rightExact ? 1 : -1;
    return left.order - right.order;
  })[0];
}

export class ContextRuleMatcher {
  private readonly configuredRuleIds: Set<string>;
  private readonly qualificationAbbreviations: Set<string>;
  private readonly signalOnlyAbbreviations: Set<string>;

  constructor(
    private readonly config: ConverterConfig,
    private readonly fullFormTrie: PhraseTrie,
  ) {
    this.configuredRuleIds = new Set(
      config.context_rules.map((rule) => rule.id),
    );
    this.qualificationAbbreviations = new Set(
      config.context_rules
        .find((rule) => rule.id === "military-qualification")
        ?.examples?.map((value) => value.toLocaleLowerCase("en")) ?? [],
    );
    this.signalOnlyAbbreviations = new Set(
      config.context_rules
        .find((rule) => rule.id === "signal-message-exclusion")
        ?.examples?.map((value) => value.toLocaleLowerCase("en")) ?? [],
    );
  }

  isSignalOnlyEntry(entry: AbbreviationEntry): boolean {
    return this.signalOnlyAbbreviations.has(
      entry.abbreviation.toLocaleLowerCase("en"),
    );
  }

  formatReplacement(
    entry: AbbreviationEntry,
    context: WritingContext | undefined,
  ): { text: string; contextual: boolean } {
    if (
      context === "military-qualification" &&
      this.qualificationAbbreviations.has(
        entry.abbreviation.toLocaleLowerCase("en"),
      )
    ) {
      return { text: entry.abbreviation.toLocaleLowerCase("en"), contextual: true };
    }
    return { text: entry.abbreviation, contextual: false };
  }

  findAt(
    input: string,
    cursor: number,
    isEntryAllowed: (entry: AbbreviationEntry) => boolean,
  ): ContextualMatch[] {
    return [
      ...this.findAppointmentMatches(input, cursor, isEntryAllowed),
      ...this.findNationalForceMatch(input, cursor, isEntryAllowed),
    ];
  }

  private findAppointmentMatches(
    input: string,
    cursor: number,
    isEntryAllowed: (entry: AbbreviationEntry) => boolean,
  ): ContextualMatch[] {
    const sourceFromCursor = input.slice(cursor);
    const results: ContextualMatch[] = [];

    for (const prefix of PREFIXES) {
      if (!this.configuredRuleIds.has(prefix.ruleId)) continue;
      const prefixMatch = prefix.expression.exec(sourceFromCursor);
      if (!prefixMatch) continue;

      const baseStart = cursor + prefixMatch[0].length;
      const base = selectBaseMatch(
        this.fullFormTrie
          .findMatchesAt(input, baseStart)
          .filter((match) => isEntryAllowed(match.entry))
          .filter((match) => hasValidBoundaries(input, match))
          .filter(
            (match) =>
              match.entry.subcategory === "appointment" ||
              (prefix.allowRank && match.entry.subcategory === "rank"),
          ),
      );

      if (!base) continue;
      results.push({
        ...base,
        variant: input.slice(cursor, base.endIndex),
        startIndex: cursor,
        replacementText: prefix.format(base.entry.abbreviation),
        ruleId: prefix.ruleId,
      });
    }

    return results;
  }

  private findNationalForceMatch(
    input: string,
    cursor: number,
    isEntryAllowed: (entry: AbbreviationEntry) => boolean,
  ): ContextualMatch[] {
    if (!this.configuredRuleIds.has("national-force")) return [];

    const numberMatch = /^(\d+(?:st|nd|rd|th)?)(\s+)/iu.exec(input.slice(cursor));
    if (!numberMatch) return [];
    const nationalityStart = cursor + numberMatch[0].length;

    const nationality = selectBaseMatch(
      this.fullFormTrie
        .findMatchesAt(input, nationalityStart)
        .filter((match) => isEntryAllowed(match.entry))
        .filter((match) => hasValidBoundaries(input, match))
        .filter(
          (match) => match.entry.category === "national_distinguishing_letter",
        ),
    );
    if (!nationality) return [];
    if (!FORMATION_AFTER_NATIONALITY.test(input.slice(nationality.endIndex))) {
      return [];
    }

    return [
      {
        ...nationality,
        variant: input.slice(cursor, nationality.endIndex),
        startIndex: cursor,
        replacementText: `${numberMatch[1]}${numberMatch[2]}(${nationality.entry.abbreviation})`,
        ruleId: "national-force",
      },
    ];
  }
}
