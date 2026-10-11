import { describe, expect, it } from "vitest";
import {
  aggregateLearningEvents,
  decideFromLearning,
  eligibleForPersonalAutoApply,
  mergeProfiles,
  recordSelection,
  setAlwaysApply,
  type LearningContext,
  type LearningEvent,
} from "@/engine/learning";
import { engine } from "./testDataset";
import type { LearningProfile } from "@/engine/types";

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

function confirmedProfile(times: number, rejected = 0): LearningProfile {
  let profile: LearningProfile = {};
  for (let index = 0; index < times; index += 1) {
    profile = recordSelection(profile, context(), CONFIRMED_CHOICE, true);
  }
  for (let index = 0; index < rejected; index += 1) {
    profile = recordSelection(profile, context(), CONFIRMED_CHOICE, false);
  }
  return profile;
}

describe("explicit auto-apply preference", () => {
  it("three clean confirmations qualify to offer — but never enable — auto-apply", () => {
    expect(eligibleForPersonalAutoApply({ confirmed: 2, rejected: 0 })).toBe(false);
    expect(eligibleForPersonalAutoApply({ confirmed: 3, rejected: 0 })).toBe(true);
    expect(eligibleForPersonalAutoApply({ confirmed: 5, rejected: 1 })).toBe(false);
    const ctx = context();
    const candidates = engine.convertReverse("AAR").ambiguities[0].choices;
    // Repeated confirmations alone must not auto-apply.
    const decision = decideFromLearning(candidates, confirmedProfile(3), undefined, ctx);
    expect(decision?.suggestion.canOfferAlways).toBe(true);
    expect(decision?.autoApply).toBe(false);
    // Only the explicit switch enables it.
    const opted = setAlwaysApply(confirmedProfile(3), ctx, CONFIRMED_CHOICE, true);
    const optedDecision = decideFromLearning(candidates, opted, undefined, ctx);
    expect(optedDecision?.autoApply).toBe(true);
    // One rejection withdraws the offer even when the switch is on.
    const rejected = setAlwaysApply(confirmedProfile(3, 1), ctx, CONFIRMED_CHOICE, true);
    expect(decideFromLearning(candidates, rejected, undefined, ctx)?.autoApply).toBe(false);
  });

  it("the converter applies the meaning automatically only after the explicit opt-in", () => {
    const ctx = context();
    const opted = setAlwaysApply(confirmedProfile(3), ctx, CONFIRMED_CHOICE, true);
    const result = engine.convertReverse("The AAR was reviewed.", { learning: opted });
    expect(result.ambiguities).toHaveLength(0);
    expect(result.replacements[0].resolution).toBe("learned");
    // Without the opt-in the ambiguity stays a suggestion.
    const asking = engine.convertReverse("The AAR was reviewed.", {
      learning: confirmedProfile(10),
    });
    expect(asking.ambiguities).toHaveLength(1);
  });
});

describe("community evidence is suggestion-only", () => {
  const ctx = context();
  const candidates = engine.convertReverse("AAR").ambiguities[0].choices;

  it("never auto-applies community evidence, however strong", () => {
    const decision = decideFromLearning(candidates, undefined, confirmedProfile(8), ctx);
    expect(decision?.suggestion.source).toBe("community");
    expect(decision?.autoApply).toBe(false);
    const result = engine.convertReverse("The AAR was reviewed.", {
      communityLearning: confirmedProfile(8),
    });
    expect(result.ambiguities).toHaveLength(1);
    expect(result.convertedText).toBe("The AAR was reviewed.");
  });

  it("a personal rejection blocks the community suggestion for that choice", () => {
    let profile: LearningProfile = confirmedProfile(1);
    profile = recordSelection(profile, ctx, CONFIRMED_CHOICE, false);
    const decision = decideFromLearning(candidates, profile, confirmedProfile(8), ctx);
    // The rejected choice must not come back through community evidence.
    expect(decision?.suggestion.choiceId).not.toBe(CONFIRMED_CHOICE);
  });
});

describe("contributor-aware aggregation", () => {
  it("caps one contributor's influence and counts distinct contributors", () => {
    const events: LearningEvent[] = [];
    for (let index = 0; index < 6; index += 1) {
      events.push({
        eventId: `e-lone-${index}`,
        contributorId: "single-actor",
        abbreviation: "AAR",
        choiceId: CONFIRMED_CHOICE,
        service: "all",
        writingContext: "internal-service-writing",
        direction: "abbreviation-to-full",
        confirmed: true,
      });
    }
    for (let index = 0; index < 4; index += 1) {
      events.push({
        eventId: `e-real-${index}`,
        contributorId: `person-${index}`,
        abbreviation: "AAR",
        choiceId: CONFIRMED_CHOICE,
        service: "all",
        writingContext: "internal-service-writing",
        direction: "abbreviation-to-full",
        confirmed: true,
      });
    }
    const aggregate = aggregateLearningEvents(events);
    const entry = aggregate["aar|all|internal-service-writing|abbreviation-to-full"];
    // Ten raw events, but one actor alone contributed at most 3.
    expect(entry.choices[CONFIRMED_CHOICE].confirmed).toBe(3 + 4);
    expect(entry.contributors?.[CONFIRMED_CHOICE]).toBe(5);
  });

  it("aggregate events keep service contexts separate", () => {
    const events: LearningEvent[] = [
      { eventId: "a", contributorId: "c1", abbreviation: "AAR", choiceId: CONFIRMED_CHOICE, service: "army", writingContext: "internal-service-writing", direction: "abbreviation-to-full", confirmed: true },
      { eventId: "b", contributorId: "c2", abbreviation: "aar", choiceId: CONFIRMED_CHOICE, service: "army", writingContext: "internal-service-writing", direction: "abbreviation-to-full", confirmed: true },
      { eventId: "c", contributorId: "c3", abbreviation: "AAR", choiceId: CONFIRMED_CHOICE, service: "navy", writingContext: "internal-service-writing", direction: "abbreviation-to-full", confirmed: true },
    ];
    const aggregate = aggregateLearningEvents(events);
    expect(aggregate["aar|army|internal-service-writing|abbreviation-to-full"].choices[CONFIRMED_CHOICE].confirmed).toBe(2);
    expect(aggregate["aar|navy|internal-service-writing|abbreviation-to-full"].choices[CONFIRMED_CHOICE].confirmed).toBe(1);
  });
});

describe("imports never multiply votes", () => {
  it("merging takes the stronger count instead of adding", () => {
    const profile: LearningProfile = confirmedProfile(2);
    const imported = confirmedProfile(5);
    const merged = mergeProfiles(profile, imported);
    expect(merged[Object.keys(imported)[0]].choices[CONFIRMED_CHOICE].confirmed).toBe(5);
    // A weaker import never lowers or multiplies the local evidence.
    const mergedAgain = mergeProfiles(merged, confirmedProfile(1));
    expect(mergedAgain[Object.keys(imported)[0]].choices[CONFIRMED_CHOICE].confirmed).toBe(5);
  });
});

describe("converter precedence", () => {
  it("still lets an explicit user resolution win over learning", () => {
    const ctx = context();
    const opted = setAlwaysApply(confirmedProfile(3), ctx, CONFIRMED_CHOICE, true);
    const result = engine.convertReverse("The AAR was reviewed.", {
      learning: opted,
      resolutions: { "all:aar": OTHER_CHOICE },
    });
    expect(result.convertedText).toBe("The Air to Air Refuelling was reviewed.");
    expect(result.replacements[0].resolution).toBe("user-selected");
  });

  it("keeps learned contexts separate", () => {
    const ctx = context({ service: "army" });
    const opted = setAlwaysApply(confirmedProfile(3), ctx, CONFIRMED_CHOICE, true);
    const result = engine.convertReverse("The AAR was reviewed.", {
      service: "navy",
      learning: opted,
    });
    expect(result.ambiguities).toHaveLength(1);
  });
});
