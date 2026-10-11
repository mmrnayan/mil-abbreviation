export type ServiceId =
  | "tri-service"
  | "army"
  | "navy"
  | "air-force"
  | "other";

export type WritingContext =
  | "internal-service-writing"
  | "signal-message"
  | "civilian-external-correspondence"
  | "military-qualification"
  | "national-force-designation"
  | "operational-writing"
  | "operational-heading"
  | "formal-letter"
  | "demi-official-letter"
  | "commanded-letter"
  | "service-paper"
  | "air-force-operational-paper"
  | "allied-forces-correspondence"
  | "foreign-correspondence"
  | "paramilitary-operational-writing"
  | "departmental-title"
  | "personnel-line"
  | "address-box";

export type ConversionDirection =
  | "full-to-abbreviation"
  | "abbreviation-to-full";

export interface EntryMatchRules {
  case_sensitive: boolean;
  whole_phrase: boolean;
  word_boundary: boolean;
  priority: number;
}

export interface EntryQuality {
  confidence: "high" | "medium" | string;
  source_line?: number;
}

export interface AbbreviationEntry {
  id: string;
  full_form: string;
  abbreviation: string;
  annex: string;
  category: string;
  service: ServiceId;
  ambiguous: boolean;
  meanings: string[];
  aliases: string[];
  match_variants: string[];
  conversion_enabled: boolean;
  match: EntryMatchRules;
  quality: EntryQuality;
  subcategory?: string;
  notes?: string;
  /** A reversible form derived from a source rule, rather than a printed pair. */
  generated?: { rule: ReplacementRule; root: string };
}

export interface AnnexDefinition {
  id: string;
  title: string;
}

export interface ConflictDefinition {
  abbreviation: string;
  entry_ids: string[];
  possible_meanings: string[];
  reverse_policy: string;
}

export interface ConversionPipelineStep {
  step: number;
  operation: string;
  loop: string;
  rule: string;
}

export interface ContextRule {
  id: string;
  trigger: string;
  action: string;
  example?: { input: string; output: string };
  examples?: string[];
}

export interface ConverterConfig {
  supported_directions: string[];
  default_direction: string;
  replacement_order: string;
  replacement_entry_ids: string[];
  tokenization: Record<string, unknown>;
  morphology: {
    policy: string;
    rule: string;
    example?: Record<string, unknown>;
  };
  conversion_pipeline: ConversionPipelineStep[];
  context_rules: ContextRule[];
  scope_rules: string[];
  reverse_conversion: {
    default_ambiguous_action: string;
    service_filter_precedence: string[];
    never_expand_inside_word: boolean;
  };
}

export interface DatasetStatistics {
  entry_count: number;
  conflicting_abbreviation_count: number;
  entries_by_annex: Record<string, number>;
  entries_requiring_review: number;
}

export interface AbbreviationDataset {
  schema_version: string;
  title: string;
  description: string;
  language: string;
  generated_on: string;
  source: Record<string, unknown>;
  annexes: AnnexDefinition[];
  converter_config: ConverterConfig;
  entries: AbbreviationEntry[];
  conflicts: ConflictDefinition[];
  statistics: DatasetStatistics;
  implementation_notes: string[];
}

export interface ConversionFilters {
  service?: "all" | ServiceId;
  annex?: "all" | string;
  context?: WritingContext;
}

/** Confirmation statistics for one learned meaning choice. */
export interface LearningChoiceStat {
  confirmed: number;
  rejected: number;
}

/**
 * One learned preference: which meaning the user confirms for an
 * abbreviation inside one service + writing context + direction. Choice keys
 * are AmbiguityChoice ids, so a removed dictionary entry simply stops
 * matching any current candidate.
 */
export interface LearningProfileEntry {
  abbreviation: string;
  /** "all" or the service the choice was confirmed in. */
  service: string;
  /** "all" or the writing context the choice was confirmed in. */
  writingContext: string;
  direction: ConversionDirection;
  choices: Record<string, LearningChoiceStat>;
  /**
   * Set only by the user's explicit "Always use this meaning in this
   * context" action — repeated confirmations alone never enable automatic
   * application.
   */
  alwaysApply?: Record<string, boolean>;
  /** Dataset version (schema + generated date) the entry was last recorded under. */
  datasetVersion?: string;
  updatedAt?: string;
  /** Community aggregates only: distinct contributors per choice. */
  contributors?: Record<string, number>;
}

/** All learned entries, keyed by profile key (see engine/learning.ts). */
export type LearningProfile = Record<string, LearningProfileEntry>;

/** A learned hint attached to an ambiguity; never auto-applied by itself. */
export interface LearningSuggestion {
  choiceId: string;
  confirmed: number;
  rejected: number;
  /** Where the evidence comes from. */
  source: "personal" | "community";
  /** Community only: distinct contributors behind the counts. */
  contributors?: number;
  /** Personal only: the evidence qualifies to offer "Always use this meaning". */
  canOfferAlways?: boolean;
}

export interface ConversionOptions extends ConversionFilters {
  /** Keys are `occurrence:<startIndex>` or `all:<abbreviation>`; values are choice IDs. */
  resolutions?: Record<string, string>;
  /** Personal learning profile used to rank ambiguity choices. */
  learning?: LearningProfile;
  /**
   * Aggregated community evidence (many users' anonymous choices). Personal
   * evidence always wins; community evidence only fills the gaps.
   */
  communityLearning?: LearningProfile;
}

export type ReplacementResolution =
  | "automatic"
  | "user-selected"
  | "context-rule"
  | "learned";

/**
 * Which Paragraph 0241 rule produced a replacement. Exact matches come from the
 * dataset; the remaining values are generated under the controlled morphology rules.
 */
export type ReplacementRule =
  | "exact-authorized"
  | "exact-exception"
  | "verb-derivative"
  | "noun-plural"
  | "compound-prefix"
  | "compound-suffix"
  | "context-generated"
  | "document-policy"
  | "reviewer-approved"
  | "custom-first-use"
  | "custom-subsequent-use";

export interface ReplacementRecord {
  entryId: string;
  matchedVariant: string;
  sourceText: string;
  replacementText: string;
  startIndex: number;
  endIndex: number;
  /** Output offsets are included to support safe component-based highlighting. */
  outputStartIndex: number;
  outputEndIndex: number;
  annex: string;
  service: string;
  category: string;
  confidence: string;
  resolution: ReplacementResolution;
  /** Paragraph 0241 rule that produced this replacement. */
  rule: ReplacementRule;
  /** Dictionary form the replacement was generated from, when not an exact match. */
  normalizedRoot?: string;
}

export interface AmbiguityChoice {
  id: string;
  entryId: string;
  meaning: string;
  service: string;
  annex: string;
  category: string;
  confidence: string;
  notes?: string;
}

export interface AmbiguityRecord {
  abbreviation: string;
  sourceText: string;
  startIndex: number;
  endIndex: number;
  outputStartIndex: number;
  outputEndIndex: number;
  surroundingSentence: string;
  policy: string;
  choices: AmbiguityChoice[];
  /** Top candidate from the user's previous confirmations; advisory only. */
  suggestion?: LearningSuggestion;
}

export interface UnresolvedRecord {
  sourceText: string;
  startIndex: number;
  endIndex: number;
  outputStartIndex: number;
  outputEndIndex: number;
  reason: "unknown-abbreviation" | "no-authorized-match";
}

export interface ConversionResult {
  originalText: string;
  convertedText: string;
  direction: ConversionDirection;
  replacements: ReplacementRecord[];
  ambiguities: AmbiguityRecord[];
  unresolved: UnresolvedRecord[];
  warnings: string[];
  appliedFilters: {
    service?: string;
    annex?: string;
    context?: string;
  };
}

export interface ValidationDiagnostic {
  severity: "error" | "warning";
  code: string;
  message: string;
  path?: string;
}

export interface DatasetValidationResult {
  valid: boolean;
  schemaVersion?: string;
  entryCount: number;
  diagnostics: ValidationDiagnostic[];
  checkedAt: string;
}

export interface HistoryItem {
  id: string;
  createdAt: string;
  direction: ConversionDirection;
  originalText: string;
  convertedText: string;
  appliedFilters: ConversionResult["appliedFilters"];
  replacementCount: number;
  ambiguityCount: number;
  unresolvedCount: number;
}
