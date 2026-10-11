import { normalizeForMatch } from "./phraseTrie";
import type {
  AmbiguityChoice,
  ConversionDirection,
  LearningChoiceStat,
  LearningProfile,
  LearningProfileEntry,
  LearningSuggestion,
} from "./types";

/**
 * Personal learning profile: which meaning the user confirms for an
 * abbreviation in which context. Pure functions only — storage lives in
 * hooks/useLearningProfile.ts, application lives in the converter.
 *
 * Rules encoded here:
 * - Only explicit user confirmations and rejections are recorded, never the
 *   app's own output.
 * - A choice confirmed for one service never applies to another service;
 *   entries recorded for "all" services/contexts apply everywhere.
 * - A suggestion must have more confirmations than rejections, so raw
 *   selection frequency alone never becomes a recommendation.
 * - Suggestions are computed against the CURRENT dictionary candidates, so
 *   removed entries cannot stay learned.
 */

export const LEARNING_ANY = "all";

export interface LearningContext {
  abbreviation: string;
  service: string;
  writingContext: string;
  direction: ConversionDirection;
}

/** Profile storage key for one abbreviation in one context. */
export function profileKeyFor(context: LearningContext): string {
  return [
    normalizeForMatch(context.abbreviation).trim(),
    context.service || LEARNING_ANY,
    context.writingContext || LEARNING_ANY,
    context.direction,
  ].join("|");
}

export function emptyProfileEntry(context: LearningContext): LearningProfileEntry {
  return {
    abbreviation: normalizeForMatch(context.abbreviation).trim(),
    service: context.service || LEARNING_ANY,
    writingContext: context.writingContext || LEARNING_ANY,
    direction: context.direction,
    choices: {},
  };
}

/**
 * Records one explicit user decision. confirmed=true counts a confirmation
 * of that meaning; confirmed=false counts a rejection.
 */
export function recordSelection(
  profile: LearningProfile,
  context: LearningContext,
  choiceId: string,
  confirmed: boolean,
  datasetVersion?: string,
): LearningProfile {
  const key = profileKeyFor(context);
  const entry = profile[key] ?? emptyProfileEntry(context);
  const stat: LearningChoiceStat = entry.choices[choiceId] ?? { confirmed: 0, rejected: 0 };
  const nextChoices: Record<string, LearningChoiceStat> = {
    ...entry.choices,
    [choiceId]: {
      confirmed: stat.confirmed + (confirmed ? 1 : 0),
      rejected: stat.rejected + (confirmed ? 0 : 1),
    },
  };
  return {
    ...profile,
    [key]: {
      ...entry,
      choices: nextChoices,
      datasetVersion: datasetVersion ?? entry.datasetVersion,
      updatedAt: new Date().toISOString(),
    },
  };
}

/** Removes one learned choice; the whole entry disappears when it empties. */
export function forgetChoice(
  profile: LearningProfile,
  context: LearningContext,
  choiceId: string,
): LearningProfile {
  const key = profileKeyFor(context);
  const entry = profile[key];
  if (!entry || !entry.choices[choiceId]) return profile;
  const choices = { ...entry.choices };
  delete choices[choiceId];
  if (Object.keys(choices).length === 0) {
    const next = { ...profile };
    delete next[key];
    return next;
  }
  return { ...profile, [key]: { ...entry, choices } };
}

/** Specificity tier of a stored entry for a query: 0 = exact match, lower = broader. */
function specificityTier(entry: LearningProfileEntry, service: string, writingContext: string): number {
  if (entry.service !== LEARNING_ANY && entry.service !== service) return -1;
  if (entry.writingContext !== LEARNING_ANY && entry.writingContext !== writingContext) return -1;
  let tier = 0;
  if (entry.service === LEARNING_ANY) tier += 1;
  if (entry.writingContext === LEARNING_ANY) tier += 2;
  return tier;
}

/**
 * Finds the stored entry that applies to the query context, preferring the
 * most specific one. A service-specific entry never matches a different
 * service; entries recorded for "all" apply everywhere.
 */
export function findProfileEntry(
  profile: LearningProfile | undefined,
  context: LearningContext,
): LearningProfileEntry | undefined {
  if (!profile) return undefined;
  let best: LearningProfileEntry | undefined;
  let bestTier = Number.POSITIVE_INFINITY;
  for (const entry of Object.values(profile)) {
    if (normalizeForMatch(entry.abbreviation).trim() !== normalizeForMatch(context.abbreviation).trim()) {
      continue;
    }
    if (entry.direction !== context.direction) continue;
    const tier = specificityTier(entry, context.service, context.writingContext);
    if (tier < 0) continue;
    if (tier < bestTier) {
      best = entry;
      bestTier = tier;
    }
  }
  return best;
}

/**
 * Scores the CURRENT dictionary candidates against the learned entry and
 * returns the top suggestion, or undefined when no candidate has more
 * confirmations than rejections. Choices that no longer exist in the
 * dictionary are ignored automatically because only current candidates are
 * scored.
 */
export function suggestFor(
  candidates: AmbiguityChoice[],
  entry: LearningProfileEntry | undefined,
  source: LearningSuggestion["source"] = "personal",
): LearningSuggestion | undefined {
  if (!entry) return undefined;
  let best: LearningSuggestion | undefined;
  for (const candidate of candidates) {
    const stat = entry.choices[candidate.id];
    if (!stat || stat.confirmed <= 0 || stat.confirmed <= stat.rejected) continue;
    const score = stat.confirmed - stat.rejected;
    if (
      !best ||
      score > best.confirmed - best.rejected ||
      (score === best.confirmed - best.rejected && stat.confirmed > best.confirmed)
    ) {
      best = { choiceId: candidate.id, confirmed: stat.confirmed, rejected: stat.rejected, source };
    }
  }
  return best;
}

/**
 * Evidence thresholds. Deliberately conservative:
 * - Personal: three clean confirmations qualify to OFFER "Always use this
 *   meaning in this context" — the user must still enable it explicitly.
 *   Repeated choices demonstrate preference, not verified correctness.
 * - Community: evidence below these numbers is not even suggested, and
 *   community evidence NEVER auto-applies — it stays a suggestion until the
 *   owner promotes it into the dictionary through a versioned data update.
 * - Each contributor's influence per choice is capped, so one person cannot
 *   manufacture a consensus.
 */
export const AUTO_APPLY_PERSONAL = { minConfirmed: 3, maxRejected: 0 } as const;
export const COMMUNITY_SUGGESTION = { minConfirmed: 5, minRatio: 0.8 } as const;
export const PER_CONTRIBUTOR_CAP = 3;

export function eligibleForPersonalAutoApply(stat: LearningChoiceStat): boolean {
  return (
    stat.confirmed >= AUTO_APPLY_PERSONAL.minConfirmed &&
    stat.rejected <= AUTO_APPLY_PERSONAL.maxRejected
  );
}

export interface LearnedDecision {
  suggestion: LearningSuggestion;
  autoApply: boolean;
}

/**
 * Combines the personal and community profiles into one decision for the
 * given candidates. Precedence: dictionary eligibility and mandatory rules
 * are the engine's concern; after that come explicit user choices (resolved
 * before this), then personal preferences, then community suggestions.
 *
 * A choice the user personally rejected is never suggested again from any
 * source. Community evidence is suggestion-only by design; automatic
 * application happens exclusively through the user's explicit "Always use
 * this meaning" preference backed by clean personal evidence. Choices that
 * no longer exist in the dictionary are ignored automatically.
 */
export function decideFromLearning(
  candidates: AmbiguityChoice[],
  personalProfile: LearningProfile | undefined,
  communityProfile: LearningProfile | undefined,
  context: LearningContext,
): LearnedDecision | undefined {
  const personal = findProfileEntry(personalProfile, context);
  const community = findProfileEntry(communityProfile, context);
  const rejectedByUser = new Set(
    Object.entries(personal?.choices ?? {})
      .filter(([, stat]) => stat.rejected > 0)
      .map(([choiceId]) => choiceId),
  );

  const personalSuggestion = suggestFor(candidates, personal, "personal");
  if (personalSuggestion) {
    const stat = personal?.choices[personalSuggestion.choiceId];
    const canOfferAlways = stat ? eligibleForPersonalAutoApply(stat) : false;
    const alwaysSet = personal?.alwaysApply?.[personalSuggestion.choiceId] === true;
    return {
      suggestion: { ...personalSuggestion, canOfferAlways: canOfferAlways && !alwaysSet },
      autoApply: alwaysSet && canOfferAlways,
    };
  }

  const communitySuggestion = suggestFor(
    candidates.filter((candidate) => !rejectedByUser.has(candidate.id)),
    community,
    "community",
  );
  if (communitySuggestion) {
    return {
      suggestion: {
        ...communitySuggestion,
        contributors: community?.contributors?.[communitySuggestion.choiceId],
      },
      autoApply: false,
    };
  }
  return undefined;
}

/**
 * Applies or withdraws the user's explicit "Always use this meaning in this
 * context" preference for one choice. Only this action can enable automatic
 * application; recording confirmations never does.
 */
export function setAlwaysApply(
  profile: LearningProfile,
  context: LearningContext,
  choiceId: string,
  value: boolean,
): LearningProfile {
  const key = profileKeyFor(context);
  const entry = profile[key] ?? emptyProfileEntry(context);
  return {
    ...profile,
    [key]: {
      ...entry,
      alwaysApply: { ...entry.alwaysApply, [choiceId]: value },
      updatedAt: new Date().toISOString(),
    },
  };
}

/** One anonymized learning event shared with the server (never the text). */
export interface LearningEvent {
  /** Unique per explicit user action; the server deduplicates retries. */
  eventId: string;
  /** Random per-browser contributor id; enables distinct-count and caps. */
  contributorId: string;
  abbreviation: string;
  choiceId: string;
  service: string;
  writingContext: string;
  direction: ConversionDirection;
  confirmed: boolean;
  datasetVersion?: string;
}

/**
 * Aggregates raw shared events into a community learning profile with the
 * same shape as a personal profile. Each contributor's influence on one
 * choice is capped (PER_CONTRIBUTOR_CAP), and the distinct contributor count
 * is kept per choice so the UI can show how many people the evidence stands
 * for. Capping here makes one actor unable to fabricate consensus.
 */
export function aggregateLearningEvents(events: LearningEvent[]): LearningProfile {
  const aggregate: LearningProfile = {};
  // key -> choiceId -> contributorId -> raw event count.
  const perContributor = new Map<string, Map<string, Map<string, { confirmed: number; rejected: number }>>>();
  for (const event of events) {
    if (typeof event.abbreviation !== "string" || !event.abbreviation.trim()) continue;
    if (typeof event.choiceId !== "string" || !event.choiceId) continue;
    if (typeof event.contributorId !== "string" || !event.contributorId) continue;
    const context: LearningContext = {
      abbreviation: event.abbreviation,
      service: event.service || LEARNING_ANY,
      writingContext: event.writingContext || LEARNING_ANY,
      direction: event.direction,
    };
    const key = profileKeyFor(context);
    const entry = aggregate[key] ?? emptyProfileEntry(context);
    const stat = entry.choices[event.choiceId] ?? { confirmed: 0, rejected: 0 };
    entry.choices[event.choiceId] = {
      confirmed: stat.confirmed + (event.confirmed ? 1 : 0),
      rejected: stat.rejected + (event.confirmed ? 0 : 1),
    };
    aggregate[key] = entry;
    const perChoice = perContributor.get(key) ?? new Map<string, Map<string, { confirmed: number; rejected: number }>>();
    const people = perChoice.get(event.choiceId) ?? new Map<string, { confirmed: number; rejected: number }>();
    const counts = people.get(event.contributorId) ?? { confirmed: 0, rejected: 0 };
    if (event.confirmed) counts.confirmed += 1;
    else counts.rejected += 1;
    people.set(event.contributorId, counts);
    perChoice.set(event.choiceId, people);
    perContributor.set(key, perChoice);
  }
  // Apply the per-contributor cap and record distinct contributor counts.
  for (const [key, entry] of Object.entries(aggregate)) {
    const perChoice = perContributor.get(key);
    if (!perChoice) continue;
    const choices: Record<string, LearningChoiceStat> = {};
    const contributors: Record<string, number> = {};
    for (const [choiceId, people] of perChoice) {
      let confirmed = 0;
      let rejected = 0;
      for (const counts of people.values()) {
        confirmed += Math.min(counts.confirmed, PER_CONTRIBUTOR_CAP);
        rejected += counts.rejected;
      }
      choices[choiceId] = { confirmed, rejected };
      contributors[choiceId] = people.size;
    }
    entry.choices = choices;
    entry.contributors = contributors;
  }
  return aggregate;
}

/** Learned entry count (one per abbreviation+context combination). */
export function profileEntryCount(profile: LearningProfile | undefined): number {
  return profile ? Object.keys(profile).length : 0;
}

/**
 * Merges an imported profile into the current one by taking the stronger
 * count per choice. Imports transfer a profile (e.g. to a new device) —
 * they must never multiply votes, so counts never exceed what either side
 * already recorded.
 */
export function mergeProfiles(
  base: LearningProfile,
  incoming: LearningProfile,
): LearningProfile {
  const merged: LearningProfile = { ...base };
  for (const [key, entry] of Object.entries(incoming)) {
    const existing = merged[key];
    if (!existing) {
      merged[key] = entry;
      continue;
    }
    const choices: Record<string, LearningChoiceStat> = { ...existing.choices };
    for (const [choiceId, stat] of Object.entries(entry.choices)) {
      const current = choices[choiceId] ?? { confirmed: 0, rejected: 0 };
      choices[choiceId] = {
        confirmed: Math.max(current.confirmed, stat.confirmed),
        rejected: Math.max(current.rejected, stat.rejected),
      };
    }
    merged[key] = {
      ...existing,
      choices,
      alwaysApply: { ...entry.alwaysApply, ...existing.alwaysApply },
      updatedAt: new Date().toISOString(),
    };
  }
  return merged;
}

/** Validates untrusted import data; silently drops malformed entries. */
export function sanitizeProfile(raw: unknown): LearningProfile {
  const result: LearningProfile = {};
  if (typeof raw !== "object" || raw === null) return result;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== "object" || value === null) continue;
    const entry = value as Partial<LearningProfileEntry>;
    if (typeof entry.abbreviation !== "string" || !entry.abbreviation.trim()) continue;
    if (entry.direction !== "full-to-abbreviation" && entry.direction !== "abbreviation-to-full") {
      continue;
    }
    if (typeof entry.choices !== "object" || entry.choices === null) continue;
    const choices: Record<string, LearningChoiceStat> = {};
    for (const [choiceId, stat] of Object.entries(entry.choices as Record<string, unknown>)) {
      if (typeof stat !== "object" || stat === null) continue;
      const counts = stat as Partial<LearningChoiceStat>;
      if (typeof counts.confirmed !== "number" || typeof counts.rejected !== "number") continue;
      if (counts.confirmed < 0 || counts.rejected < 0) continue;
      choices[choiceId] = {
        confirmed: Math.floor(counts.confirmed),
        rejected: Math.floor(counts.rejected),
      };
    }
    if (!Object.keys(choices).length) continue;
    result[key] = {
      abbreviation: entry.abbreviation,
      service: typeof entry.service === "string" ? entry.service : LEARNING_ANY,
      writingContext: typeof entry.writingContext === "string" ? entry.writingContext : LEARNING_ANY,
      direction: entry.direction,
      choices,
      alwaysApply:
        typeof entry.alwaysApply === "object" && entry.alwaysApply !== null
          ? Object.fromEntries(
              Object.entries(entry.alwaysApply).filter(([, value]) => typeof value === "boolean"),
            )
          : undefined,
      datasetVersion: typeof entry.datasetVersion === "string" ? entry.datasetVersion : undefined,
      updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : undefined,
    };
  }
  return result;
}
