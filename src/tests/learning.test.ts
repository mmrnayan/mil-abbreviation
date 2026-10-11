import { describe, expect, it } from "vitest";
import {
  findProfileEntry,
  forgetChoice,
  mergeProfiles,
  profileKeyFor,
  recordSelection,
  sanitizeProfile,
  suggestFor,
  type LearningContext,
} from "@/engine/learning";
import { engine } from "./testDataset";
import type { AmbiguityChoice, LearningProfile } from "@/engine/types";

const CONFIRMED_CHOICE = "abbr-0024::After Action Review";
const OTHER_CHOICE = "abbr-0060::Air to Air Refuelling";

function context(overrides: Partial<LearningContext> = {}): LearningContext {
  return {
    abbreviation: "AAR",
    service: "all",
    writingContext: "internal-service-writing",
    direction: "abbreviation-to-full",
    ...overrides,
  };
}

function candidate(id: string, meaning: string): AmbiguityChoice {
  return {
    id,
    entryId: id.split("::")[0],
    meaning,
    service: "tri-service",
    annex: "A",
    category: "general",
    confidence: "high",
  };
}

describe("learning profile recording", () => {
  it("accumulates confirmations and rejections per choice", () => {
    let profile: LearningProfile = {};
    profile = recordSelection(profile, context(), CONFIRMED_CHOICE, true, "v1");
    profile = recordSelection(profile, context(), CONFIRMED_CHOICE, true, "v1");
    profile = recordSelection(profile, context(), OTHER_CHOICE, false, "v1");
    const entry = profile[profileKeyFor(context())];
    expect(entry.choices[CONFIRMED_CHOICE]).toEqual({ confirmed: 2, rejected: 0 });
    expect(entry.choices[OTHER_CHOICE]).toEqual({ confirmed: 0, rejected: 1 });
    expect(entry.datasetVersion).toBe("v1");
  });

  it("forgets a single choice and drops empty entries entirely", () => {
    let profile: LearningProfile = {};
    profile = recordSelection(profile, context(), CONFIRMED_CHOICE, true);
    profile = recordSelection(profile, context(), OTHER_CHOICE, true);
    profile = forgetChoice(profile, context(), OTHER_CHOICE);
    expect(profile[profileKeyFor(context())].choices[CONFIRMED_CHOICE]).toBeDefined();
    profile = forgetChoice(profile, context(), CONFIRMED_CHOICE);
    expect(profile[profileKeyFor(context())]).toBeUndefined();
  });
});

describe("learning suggestions", () => {
  const candidates = [
    candidate(CONFIRMED_CHOICE, "After Action Review"),
    candidate(OTHER_CHOICE, "Air to Air Refuelling"),
  ];

  it("suggests the confirmed meaning from the current candidates", () => {
    let profile: LearningProfile = {};
    profile = recordSelection(profile, context(), CONFIRMED_CHOICE, true);
    profile = recordSelection(profile, context(), CONFIRMED_CHOICE, true);
    const suggestion = suggestFor(candidates, findProfileEntry(profile, context()));
    expect(suggestion?.choiceId).toBe(CONFIRMED_CHOICE);
    expect(suggestion?.confirmed).toBe(2);
    expect(suggestion?.rejected).toBe(0);
  });

  it("never suggests a choice rejected as often as confirmed — frequency alone is not enough", () => {
    let profile: LearningProfile = {};
    for (let index = 0; index < 5; index += 1) {
      profile = recordSelection(profile, context(), CONFIRMED_CHOICE, true);
      profile = recordSelection(profile, context(), CONFIRMED_CHOICE, false);
    }
    expect(suggestFor(candidates, findProfileEntry(profile, context()))).toBeUndefined();
  });

  it("ignores choices that no longer exist in the dictionary", () => {
    let profile: LearningProfile = {};
    profile = recordSelection(profile, context(), "abbr-9999::Removed Entry", true);
    expect(suggestFor(candidates, findProfileEntry(profile, context()))).toBeUndefined();
  });

  it("keeps service contexts separate", () => {
    let profile: LearningProfile = {};
    profile = recordSelection(profile, context({ service: "army" }), CONFIRMED_CHOICE, true);
    // Army learning does not reach a navy conversion…
    expect(findProfileEntry(profile, context({ service: "navy" }))).toBeUndefined();
    // …nor an unfiltered conversion.
    expect(findProfileEntry(profile, context({ service: "all" }))).toBeUndefined();
    // An entry recorded for all services applies everywhere.
    const anyService = recordSelection(profile, context({ service: "all" }), OTHER_CHOICE, true);
    expect(findProfileEntry(anyService, context({ service: "navy" }))?.choices[OTHER_CHOICE]).toBeDefined();
  });

  it("keeps writing contexts separate but prefers the exact match", () => {
    let profile: LearningProfile = {};
    profile = recordSelection(
      profile,
      context({ writingContext: "signal-message" }),
      CONFIRMED_CHOICE,
      true,
    );
    expect(findProfileEntry(profile, context({ writingContext: "civilian-external-correspondence" })))
      .toBeUndefined();
    const withAny = recordSelection(
      profile,
      context({ writingContext: "all" }),
      OTHER_CHOICE,
      true,
    );
    // The broader entry applies where nothing specific exists…
    expect(
      findProfileEntry(withAny, context({ writingContext: "civilian-external-correspondence" }))?.choices[OTHER_CHOICE],
    ).toBeDefined();
    // …but the specific entry wins in its own context.
    expect(
      findProfileEntry(withAny, context({ writingContext: "signal-message" }))?.choices[CONFIRMED_CHOICE],
    ).toBeDefined();
  });

  it("never mixes conversion directions", () => {
    let profile: LearningProfile = {};
    profile = recordSelection(profile, context(), CONFIRMED_CHOICE, true);
    expect(
      findProfileEntry(profile, context({ direction: "full-to-abbreviation" })),
    ).toBeUndefined();
  });
});

describe("learning import/export", () => {
  it("merging takes the stronger count per choice — imports never multiply votes", () => {
    let profile: LearningProfile = {};
    profile = recordSelection(profile, context(), CONFIRMED_CHOICE, true);
    const imported = sanitizeProfile({
      [profileKeyFor(context())]: {
        abbreviation: "aar",
        service: "all",
        writingContext: "internal-service-writing",
        direction: "abbreviation-to-full",
        choices: { [CONFIRMED_CHOICE]: { confirmed: 4, rejected: 0 } },
      },
    });
    const merged = mergeProfiles(profile, imported);
    expect(merged[profileKeyFor(context())].choices[CONFIRMED_CHOICE]).toEqual({
      confirmed: 4,
      rejected: 0,
    });
    // Re-importing the same profile cannot inflate the counts further.
    const mergedAgain = mergeProfiles(merged, imported);
    expect(mergedAgain[profileKeyFor(context())].choices[CONFIRMED_CHOICE]).toEqual({
      confirmed: 4,
      rejected: 0,
    });
  });

  it("drops malformed import entries", () => {
    const cleaned = sanitizeProfile({
      broken: { abbreviation: "", choices: {} },
      wrongDirection: { abbreviation: "x", direction: "sideways", choices: { a: { confirmed: 1, rejected: 0 } } },
      good: {
        abbreviation: "aar",
        direction: "abbreviation-to-full",
        choices: { [CONFIRMED_CHOICE]: { confirmed: 1.5, rejected: -2 } },
      },
    });
    expect(Object.keys(cleaned)).toEqual([]);
  });
});

describe("learning wired into the converter", () => {
  it("attaches the learned suggestion to the ambiguity record", () => {
    let profile: LearningProfile = {};
    profile = recordSelection(profile, context(), CONFIRMED_CHOICE, true);
    profile = recordSelection(profile, context(), CONFIRMED_CHOICE, true);
    const result = engine.convertReverse("The AAR was reviewed.", {
      learning: profile,
    });
    expect(result.ambiguities).toHaveLength(1);
    expect(result.ambiguities[0].suggestion?.choiceId).toBe(CONFIRMED_CHOICE);
    // Advisory only: the output is still unchanged until the user confirms.
    expect(result.convertedText).toBe("The AAR was reviewed.");
  });

  it("does not suggest across service contexts", () => {
    let profile: LearningProfile = {};
    profile = recordSelection(profile, context({ service: "army" }), CONFIRMED_CHOICE, true);
    const result = engine.convertReverse("The AAR was reviewed.", {
      service: "navy",
      learning: profile,
    });
    expect(result.ambiguities[0].suggestion).toBeUndefined();
  });

  it("produces no suggestion without a learning profile", () => {
    const result = engine.convertReverse("The AAR was reviewed.");
    expect(result.ambiguities[0].suggestion).toBeUndefined();
  });
});
