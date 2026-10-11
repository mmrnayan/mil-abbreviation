import { describe, expect, it } from "vitest";
import {
  analyzeCorrections,
  baseRootOf,
  type AnalysisDictionary,
} from "@/utils/correctionAnalysis";

function entry(
  id: string,
  fullForm: string,
  abbreviation: string,
  variants: string[] = [fullForm],
): AnalysisDictionary["entries"][number] {
  return {
    id,
    full_form: fullForm,
    abbreviation,
    match_variants: variants,
    ambiguous: false,
    conversion_enabled: true,
  };
}

const dict: AnalysisDictionary = {
  entries: [
    entry("abbr-0837", "Leader", "ldr"),
    entry("abbr-0532", "Support", "sp"),
    entry("abbr-1576", "Building; Build", "bldg"),
    entry("abbr-0035", "Air Defence Operations Centre", "ADOC"),
    entry("abbr-0035b", "Air Operations Plan/Area of Operation", "AOP", [
      "Air Operations Plan/Area of Operation",
      "Air Operations Plan",
      "Area of Operation",
    ]),
  ],
  compound_affixes: {
    prefixes: ["de", "re", "counter"],
    suffixes: ["ship", "ment", "less"],
  },
  verb_entry_ids: ["abbr-0532"],
};

describe("baseRootOf", () => {
  it("strips parentheticals and slash alternatives", () => {
    expect(baseRootOf("Additional (ly)")).toBe("Additional");
    expect(baseRootOf("Divide(d)/Division")).toBe("Divide");
    expect(baseRootOf("Air Operations Plan/Area of Operation")).toBe("Air Operations Plan");
  });
});

describe("analyzeCorrections — the review-mode example", () => {
  const problems = analyzeCorrections(
    "The leadership supported the Cdr.",
    "The ldrship sp the Cdr.",
    dict,
  );

  it("identifies leadership as a missing compound-suffix conversion", () => {
    const leadership = problems.find((problem) => problem.source === "leadership");
    expect(leadership).toBeDefined();
    expect(leadership?.error_type).toBe("missing_conversion");
    expect(leadership?.expected).toBe("ldrship");
    expect(leadership?.root).toBe("leader");
    expect(leadership?.entry_id).toBe("abbr-0837");
    expect(leadership?.required_rule).toBe("compound_suffix");
    expect(leadership?.authorized_abbreviation).toBe("ldr");
  });

  it("identifies supported as a missing verb-derivative conversion", () => {
    const supported = problems.find((problem) => problem.source === "supported");
    expect(supported).toBeDefined();
    expect(supported?.error_type).toBe("missing_conversion");
    expect(supported?.expected).toBe("sp");
    expect(supported?.root).toBe("support");
    expect(supported?.entry_id).toBe("abbr-0532");
    expect(supported?.required_rule).toBe("verb_derivative");
  });

  it("does not flag tokens that already agree", () => {
    expect(problems.find((problem) => problem.source === "Cdr")).toBeUndefined();
    expect(problems.find((problem) => problem.source === "the")).toBeUndefined();
    expect(problems).toHaveLength(2);
  });
});

describe("analyzeCorrections — error classification", () => {
  it("classifies an unexpected abbreviation as a false conversion", () => {
    const problems = analyzeCorrections("the bldg", "the building", dict);
    expect(problems).toHaveLength(1);
    expect(problems[0].error_type).toBe("false_conversion");
    expect(problems[0].source).toBe("bldg");
  });

  it("classifies a differing abbreviation as a wrong abbreviation", () => {
    const problems = analyzeCorrections("the AOP", "the ADOC", dict);
    expect(problems).toHaveLength(1);
    expect(problems[0].error_type).toBe("wrong_abbreviation");
  });

  it("classifies plural disagreements as a wrong plural", () => {
    const problems = analyzeCorrections("two ldrs", "two ldr", dict);
    expect(problems).toHaveLength(1);
    expect(problems[0].error_type).toBe("wrong_plural");
  });

  it("classifies word-form disagreements as a wrong derivative", () => {
    const problems = analyzeCorrections("the commander", "the commanding", dict);
    expect(problems).toHaveLength(1);
    expect(problems[0].error_type).toBe("wrong_derivative");
  });

  it("classifies case-only differences as a capitalization error", () => {
    const problems = analyzeCorrections("report to the co", "report to the CO", dict);
    expect(problems).toHaveLength(1);
    expect(problems[0].error_type).toBe("capitalization_error");
  });

  it("collapses whitespace-only differences into one punctuation error", () => {
    const problems = analyzeCorrections("A ,B.", "A, B.", dict);
    expect(problems).toHaveLength(1);
    expect(problems[0].error_type).toBe("punctuation_error");
  });

  it("returns no corrections when the outputs match", () => {
    expect(analyzeCorrections("the CO", "the CO", dict)).toHaveLength(0);
  });

  it("suggests a phrase entry for a partially converted phrase", () => {
    const problems = analyzeCorrections(
      "the Air Operations Plan was issued",
      "the AOP was issued",
      dict,
    );
    const plan = problems.find((problem) => problem.source === "Air Operations Plan");
    expect(plan?.error_type).toBe("missing_conversion");
    expect(plan?.expected).toBe("AOP");
    expect(plan?.entry_id).toBe("abbr-0035b");
  });
});
