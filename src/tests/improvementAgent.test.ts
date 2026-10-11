import { describe, expect, it } from "vitest";
import {
  analyzeCorrections,
  collectGroups,
  searchManual,
  type CorrectionInput,
  type DictionaryEntry,
  type ManualDocument,
} from "@/utils/improvementAgent";

const entries: DictionaryEntry[] = [
  { id: "abbr-2015", full_form: "Technology", abbreviation: "DNIT", annex: "C" },
  { id: "abbr-0149", full_form: "Arrange", abbreviation: "arng", annex: "A" },
];

const manual: ManualDocument = {
  slug: "source16",
  lines: [
    "Director (Directorate) of Naval Information and",
    "Technology",
    "DNIT",
    "",
    "Arrange",
    "arng",
  ],
};

describe("collectGroups", () => {
  it("groups corrections by entry id and counts occurrences", () => {
    const corrections: CorrectionInput[] = [
      {
        feedback_id: "FB-0001",
        corrections: [{ source: "Technology", error_type: "source_data_error", entry_id: "abbr-2015" }],
        input_sentence: "Technology converts wrongly.",
      },
      {
        feedback_id: "FB-0002",
        corrections: [{ source: "Technology", error_type: "wrong_abbreviation", entry_id: "abbr-2015" }],
      },
    ];
    const groups = collectGroups(corrections);
    expect(groups).toHaveLength(1);
    expect(groups[0].occurrences).toBe(2);
    expect(groups[0].entry_id).toBe("abbr-2015");
    expect(groups[0].feedback_ids).toEqual(["FB-0001", "FB-0002"]);
  });
});

describe("searchManual", () => {
  it("cites file, line and quotation for matches", () => {
    const hits = searchManual(manual, "DNIT");
    expect(hits).toHaveLength(1);
    expect(hits[0].line).toBe(3);
    expect(hits[0].quotation).toBe("DNIT");
    expect(hits[0].manual).toBe("source16");
  });

  it("returns nothing without a manual or term", () => {
    expect(searchManual(undefined, "DNIT")).toHaveLength(0);
    expect(searchManual(manual, "   ")).toHaveLength(0);
  });
});

describe("analyzeCorrections", () => {
  it("proposes a corrected entry with manual evidence for a verified defect", () => {
    const proposals = analyzeCorrections(
      [
        {
          feedback_id: "FB-0001",
          input_sentence: "Technology converted to DNIT.",
          corrections: [{ source: "Technology", error_type: "source_data_error", entry_id: "abbr-2015" }],
        },
      ],
      entries,
      [],
      [manual],
    );
    expect(proposals).toHaveLength(1);
    const proposal = proposals[0];
    expect(proposal.rule).toBe("correct_entry");
    expect(proposal.entry_id).toBe("abbr-2015");
    expect(proposal.suggested_full_form).toContain("Naval Information");
    expect(proposal.evidence.some((item) => item.line === 3)).toBe(true);
    expect(proposal.validation.manualSupport).toBe(true);
    expect(proposal.reviewStatus).toBe("proposed");
  });

  it("proposes a reviewer-approved conversion for recurring missing conversions", () => {
    const corrections: CorrectionInput[] = [1, 2].map((index) => ({
      feedback_id: `FB-00${index}`,
      corrections: [{ source: "arrangements", expected: "arng", error_type: "missing_conversion", root: "arrange" }],
    }));
    const proposals = analyzeCorrections(corrections, entries, [], [manual]);
    expect(proposals).toHaveLength(1);
    expect(proposals[0].rule).toBe("add_conversion");
    expect(proposals[0].input).toBe("Arrangements");
    expect(proposals[0].output).toBe("arng");
    expect(proposals[0].occurrences).toBe(2);
  });

  it("ignores single occurrences without a verified defect class", () => {
    const proposals = analyzeCorrections(
      [
        {
          feedback_id: "FB-0001",
          corrections: [{ source: "arrangements", expected: "arng", error_type: "missing_conversion" }],
        },
      ],
      entries,
      [],
      [manual],
    );
    expect(proposals).toHaveLength(0);
  });

  it("flags duplicates against existing overrides", () => {
    const proposals = analyzeCorrections(
      [
        {
          feedback_id: "FB-0001",
          corrections: [{ source: "Technology", error_type: "source_data_error", entry_id: "abbr-2015" }],
        },
      ],
      entries,
      [
        {
          rule: "correct_entry",
          entry_id: "abbr-2015",
          input: "Technology",
          output: "DNIT",
          corrected_full_form: "Director (Directorate) of Naval Information and Technology",
        },
      ],
      [manual],
    );
    // The suggested form matches the existing override — filtered as duplicate.
    expect(proposals).toHaveLength(0);
  });

  it("suppresses no-change entry proposals (suggested form equals the current one)", () => {
    // Manual prints "Arrange" right above "arng", so the walked-up suggestion
    // equals the current full form — proposing it would change nothing.
    const proposals = analyzeCorrections(
      [
        {
          feedback_id: "FB-0001",
          corrections: [{ source: "Arrange", error_type: "source_data_error", entry_id: "abbr-0149" }],
        },
      ],
      entries,
      [],
      [manual],
    );
    expect(proposals).toHaveLength(0);
  });
});
