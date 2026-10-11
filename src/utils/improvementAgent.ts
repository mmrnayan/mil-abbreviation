/**
 * Improvement-pipeline agent (stage: Collector + Analyst, followed by
 * ordinary validation code). Groups recurring corrections, cites passages
 * from owner-supplied manuals as evidence, and produces structured proposals
 * for owner review.
 *
 * Hard rules:
 * - Manuals are EVIDENCE only: the pipeline quotes lines with file and line
 *   numbers; retrieved text is never treated as instructions.
 * - Proposals are never applied here. Approval records a review status and
 *   nothing else; writing to the data layers is a separate, later step.
 * - No external model is involved: grouping, search and drafting are
 *   deterministic, so no correction text leaves the server.
 */

export interface CorrectionInput {
  feedback_id?: string;
  input_sentence?: string;
  actual_output?: string;
  expected_output?: string;
  corrections?: {
    source?: string;
    actual?: string;
    expected?: string;
    error_type?: string;
    root?: string;
    entry_id?: string;
    required_rule?: string;
  }[];
  review_status?: string;
  created_at?: string;
}

export interface DictionaryEntry {
  id: string;
  full_form: string;
  abbreviation: string;
  annex: string;
}

export interface ExistingOverride {
  rule?: string;
  entry_id?: string;
  input?: string;
  output?: string;
  corrected_full_form?: string;
  corrected_abbreviation?: string;
}

export interface ManualDocument {
  slug: string;
  lines: string[];
  sourceFile?: string;
}

export interface EvidenceItem {
  manual: string;
  line: number;
  quotation: string;
  matched: string;
}

export type ProposalRule = "correct_entry" | "add_conversion";

export type ProposalReviewStatus = "proposed" | "approved" | "rejected";

export interface ImprovementProposal {
  id: string;
  /** What the pattern is: recurring error group or single verified defect. */
  pattern: string;
  error_types: string[];
  occurrences: number;
  feedback_ids: string[];
  sample_sentence?: string;
  rule: ProposalRule;
  entry_id?: string;
  input: string;
  output: string;
  current_full_form?: string;
  suggested_full_form?: string;
  reason: string;
  evidence: EvidenceItem[];
  validation: {
    entryExists: boolean;
    notDuplicate: boolean;
    noConflict: boolean;
    manualSupport: boolean;
  };
  reviewStatus: ProposalReviewStatus;
}

export interface AnalysisGroup {
  key: string;
  error_types: string[];
  occurrences: number;
  feedback_ids: string[];
  entry_id?: string;
  root?: string;
  source?: string;
  actual?: string;
  expected?: string;
  sample_sentence?: string;
}

function norm(value: string | undefined): string {
  return (value ?? "")
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .normalize("NFC")
    .replace(/\s+/gu, " ")
    .toLowerCase()
    .trim();
}

function titleCase(value: string): string {
  return value.replace(/\b\p{L}+/gu, (word) =>
    word.length <= 3 && /^(of|the|and|in|for)$/i.test(word)
      ? word.toLowerCase()
      : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
  );
}

/** Collector: groups corrections by entry id, falling back to source word. */
export function collectGroups(corrections: CorrectionInput[]): AnalysisGroup[] {
  const groups = new Map<string, AnalysisGroup>();
  for (const record of corrections) {
    for (const correction of record.corrections ?? []) {
      const key = correction.entry_id
        ? `entry:${correction.entry_id}`
        : `word:${norm(correction.source) || record.input_sentence?.slice(0, 40) || "unknown"}`;
      const group = groups.get(key) ?? {
        key,
        error_types: [],
        occurrences: 0,
        feedback_ids: [],
        entry_id: correction.entry_id,
        root: correction.root,
        source: correction.source,
        actual: correction.actual,
        expected: correction.expected,
      };
      group.occurrences += 1;
      if (!group.error_types.includes(correction.error_type ?? "unknown")) {
        group.error_types.push(correction.error_type ?? "unknown");
      }
      if (record.feedback_id && !group.feedback_ids.includes(record.feedback_id)) {
        group.feedback_ids.push(record.feedback_id);
      }
      group.sample_sentence = group.sample_sentence ?? record.input_sentence;
      groups.set(key, group);
    }
  }
  return [...groups.values()].sort((left, right) => right.occurrences - left.occurrences);
}

/** Searches a manual for a term and returns cited line evidence. */
export function searchManual(
  manual: ManualDocument | undefined,
  term: string,
  maxHits = 4,
): EvidenceItem[] {
  if (!manual || !term.trim()) return [];
  const wanted = norm(term);
  if (!wanted) return [];
  const hits: EvidenceItem[] = [];
  for (let index = 0; index < manual.lines.length && hits.length < maxHits; index += 1) {
    if (norm(manual.lines[index]).includes(wanted)) {
      hits.push({
        manual: manual.slug,
        line: index + 1,
        quotation: manual.lines[index].replace(/\s+/gu, " ").trim().slice(0, 220),
        matched: term,
      });
    }
  }
  return hits;
}

/** Looks for the printed full form sitting in the lines before an abbreviation. */
function suggestFullFormNear(manual: ManualDocument | undefined, abbreviation: string): string | undefined {
  if (!manual) return undefined;
  const wanted = norm(abbreviation);
  for (let index = 0; index < manual.lines.length; index += 1) {
    if (norm(manual.lines[index]) !== wanted) continue;
    // Walk upwards over the wrapped full-form lines.
    const parts: string[] = [];
    let cursor = index - 1;
    while (cursor >= 0 && parts.length < 4) {
      const line = manual.lines[cursor].replace(/\s+/gu, " ").trim();
      if (!line) {
        if (parts.length) break;
        cursor -= 1;
        continue;
      }
      // Abbreviation rows are short and uppercase-heavy; full forms are not.
      if (line.length <= 12 && line === line.toUpperCase()) break;
      parts.unshift(line);
      // Stop once the assembled phrase starts with a title-ish word.
      if (/^(Director|Deputy|General|Senior|Junior|Principal|Officer|Commander|Commodore|Captain|Major|Colonel|Bangladesh|Army|Navy|Air|Chief|School|College|Institute|Directorate|Station|Headquarters)\b/i.test(parts.join(" "))) {
        break;
      }
      cursor -= 1;
    }
    if (parts.length) return parts.join(" ").replace(/\s+/gu, " ").trim();
  }
  return undefined;
}

export function proposalSignature(
  proposal: Pick<ImprovementProposal, "rule" | "entry_id" | "input" | "output" | "suggested_full_form">,
): string {
  return [proposal.rule, proposal.entry_id ?? "", norm(proposal.input), norm(proposal.output), norm(proposal.suggested_full_form ?? "")].join("|");
}

function entryById(entries: DictionaryEntry[], id?: string): DictionaryEntry | undefined {
  return id ? entries.find((entry) => entry.id === id) : undefined;
}

/**
 * Analyst: turns correction groups into evidence-backed proposals. Groups
 * are proposal-worthy when they recur (2+ occurrences) or carry a verified
 * dictionary defect class with a known entry id.
 */
export function analyzeCorrections(
  corrections: CorrectionInput[],
  entries: DictionaryEntry[],
  existingOverrides: ExistingOverride[],
  manuals: ManualDocument[],
): ImprovementProposal[] {
  const groups = collectGroups(corrections);
  const knownSignatures = new Set(existingOverrides.map((override) => proposalSignature(override as ImprovementProposal)));
  // Any existing override of the same class for the same target suppresses a
  // re-proposal, whatever values it carries.
  const hasOverrideFor = (rule: string, entryId?: string, input?: string): boolean =>
    existingOverrides.some(
      (override) =>
        override.rule === rule &&
        (entryId ? override.entry_id === entryId : norm(override.input) === norm(input ?? "")),
    );
  const proposals: ImprovementProposal[] = [];

  for (const group of groups) {
    const recurring = group.occurrences >= 2;
    const verifiedDefect =
      group.entry_id &&
      (group.error_types.includes("source_data_error") ||
        group.error_types.includes("wrong_abbreviation"));
    if (!recurring && !verifiedDefect) continue;

    // Plain-language pattern: how many separate reviews, how many mentions.
    const reviewCount = group.feedback_ids.length;
    const pattern =
      reviewCount > 1
        ? `corrected in ${reviewCount} separate reviews`
        : group.occurrences > 1
          ? `${group.occurrences} mentions in one review`
          : "one correction";

    const entry = entryById(entries, group.entry_id);
    const evidence: EvidenceItem[] = [];
    let suggestedFullForm: string | undefined;

    if (entry && (verifiedDefect || group.error_types.includes("source_data_error"))) {
      const manual = manuals[0];
      evidence.push(...searchManual(manual, entry.abbreviation));
      suggestedFullForm = suggestFullFormNear(manual, entry.abbreviation);
      // No-change guard: if the manual's suggestion is what the entry
      // already says, the proposal would change nothing — skip it.
      if (!suggestedFullForm || norm(suggestedFullForm) === norm(entry.full_form)) {
        continue;
      }
      const proposed: ImprovementProposal = {
        id: "",
        pattern,
        error_types: group.error_types,
        occurrences: group.occurrences,
        feedback_ids: group.feedback_ids,
        sample_sentence: group.sample_sentence,
        rule: "correct_entry",
        entry_id: entry.id,
        input: entry.full_form,
        output: entry.abbreviation,
        current_full_form: entry.full_form,
        suggested_full_form: suggestedFullForm,
        reason:
          `Your correction says this entry's full form is wrong. The manual prints ` +
          `“${suggestedFullForm}” next to “${entry.abbreviation}” (lines below). ` +
          `If that matches the manual, approve — the fix is then ready to apply.`,
        evidence,
        validation: {
          entryExists: Boolean(entry),
          notDuplicate:
            !hasOverrideFor("correct_entry", entry.id) &&
            !knownSignatures.has(proposalSignature({ rule: "correct_entry", entry_id: entry.id, input: entry.full_form, output: entry.abbreviation, suggested_full_form: suggestedFullForm })),
          noConflict: true,
          manualSupport: evidence.length > 0 && Boolean(suggestedFullForm),
        },
        reviewStatus: "proposed",
      };
      proposals.push(proposed);
      continue;
    }

    if (group.error_types.includes("missing_conversion") && group.source && group.expected) {
      const manual = manuals[0];
      const input = titleCase(group.source);
      evidence.push(...searchManual(manual, group.expected));
      evidence.push(...searchManual(manual, input, 2));
      const proposed: ImprovementProposal = {
        id: "",
        pattern,
        error_types: group.error_types,
        occurrences: group.occurrences,
        feedback_ids: group.feedback_ids,
        sample_sentence: group.sample_sentence,
        rule: "add_conversion",
        input,
        output: group.expected,
        evidence,
        reason:
          `You changed “${group.source}” to “${group.expected}” ${group.occurrences} time(s). ` +
          (evidence.length
            ? `Your manual mentions the lines below — check they are really about this use.`
            : `Your manual doesn't mention this pair, so approving records it as your accepted usage.`),
        validation: {
          entryExists: false,
          notDuplicate:
            !hasOverrideFor("add_conversion", undefined, input) &&
            !knownSignatures.has(proposalSignature({ rule: "add_conversion", input, output: group.expected })),
          noConflict: !entries.some((candidate) => norm(candidate.full_form) === norm(input) && norm(candidate.abbreviation) !== norm(group.expected ?? "")),
          manualSupport: evidence.length > 0,
        },
        reviewStatus: "proposed",
      };
      proposals.push(proposed);
    }
  }

  // Stable ids from the signature.
  for (const proposal of proposals) {
    proposal.id = `AP-${String(
      parseInt(createStubHash(proposalSignature(proposal)).slice(0, 6), 16) % 1000000,
    ).padStart(6, "0")}`;
  }
  // Drop exact duplicates within one run and anything flagged as duplicate
  // of an existing override.
  const seen = new Set<string>();
  return proposals.filter((proposal) => {
    if (!proposal.validation.notDuplicate) return false;
    const signature = proposalSignature(proposal);
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

function createStubHash(value: string): string {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0").repeat(2);
}

export interface StoredProposal extends ImprovementProposal {
  reviewedAt?: string;
  reviewNote?: string;
}

/** Merges review decisions into the stored proposal list (by id). */
export function applyReview(
  proposals: StoredProposal[],
  id: string,
  action: "approve" | "reject",
  note?: string,
): StoredProposal[] {
  return proposals.map((proposal): StoredProposal =>
    proposal.id === id
      ? {
          ...proposal,
          reviewStatus: action === "approve" ? "approved" : "rejected",
          reviewedAt: new Date().toISOString(),
          reviewNote: note,
        }
      : proposal,
  );
}
