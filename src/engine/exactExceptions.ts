import type { AbbreviationEntry, ReplacementRule } from "./types";

/**
 * Paragraph 0241b(4) exception rule: some abbreviations represent one specific
 * derivative only (bldg, retd, addl) and must never be extended to other
 * derivatives of their base word.
 */
export class ExactExceptions {
  private readonly ids: ReadonlySet<string>;

  constructor(entryIds: readonly string[]) {
    this.ids = new Set(entryIds);
  }

  isExactOnly(entryId: string): boolean {
    return this.ids.has(entryId);
  }
}

export interface GeneratedMatch {
  /** The authorized entry backing the generated replacement. */
  entry: AbbreviationEntry;
  replacementText: string;
  rule: ReplacementRule;
  /** Dictionary form the replacement was generated from. */
  normalizedRoot: string;
  confidence: "high" | "medium" | "needs-review";
}
