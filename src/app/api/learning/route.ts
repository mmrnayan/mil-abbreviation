import { NextResponse } from "next/server";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  aggregateLearningEvents,
  type LearningEvent,
} from "@/engine/learning";

/**
 * Community learning evidence. Users who opt in share choice events —
 * which meaning they confirmed for an abbreviation in which service and
 * context. No document text is ever included. Hardening per OWASP API
 * guidance: unique event ids with deduplication, meaning-id validation
 * against the dictionary, per-IP rate limiting, and contributor-aware
 * aggregation so one actor cannot fabricate consensus. Community evidence
 * is suggestion-only; changing everyone's output requires owner approval
 * (promotion into the data layers), which is a manual, authenticated step.
 */
const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "learning-events.jsonl");

const DIRECTIONS = new Set(["full-to-abbreviation", "abbreviation-to-full"]);
const RATE_LIMIT = 120; // events per IP per hour
const MAX_STORED_EVENTS = 200000;

// Single-process in-memory guards; the server restart clears them.
const seenEventIds = new Set<string>();
const rateByIp = new Map<string, number[]>();

/** Lazily builds the set of valid entry ids from the data layers. */
let dictionaryIds: Set<string> | undefined;
async function getDictionaryIds(): Promise<Set<string>> {
  if (dictionaryIds) return dictionaryIds;
  const ids = new Set<string>();
  try {
    const base = JSON.parse(
      await readFile(path.join(process.cwd(), "public/data/abbreviations.base.json"), "utf8"),
    ) as { entries?: { id: string }[] };
    for (const entry of base.entries ?? []) ids.add(entry.id);
  } catch {
    // Without the layers, fall back to format-only validation below.
  }
  dictionaryIds = ids;
  return ids;
}

function clampString(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max).trim() : "";
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const windowStart = now - 3600_000;
  const recent = (rateByIp.get(ip) ?? []).filter((time) => time > windowStart);
  recent.push(now);
  rateByIp.set(ip, recent);
  if (rateByIp.size > 10000) {
    for (const [key, times] of rateByIp) {
      if (!times.some((time) => time > windowStart)) rateByIp.delete(key);
    }
  }
  return recent.length > RATE_LIMIT;
}

export async function POST(request: Request) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "local";
    if (rateLimited(ip)) {
      return NextResponse.json(
        { ok: false, error: "Too many submissions; try again later." },
        { status: 429 },
      );
    }
    const body: unknown = await request.json();
    const payload = (body ?? {}) as Record<string, unknown>;
    const direction = clampString(payload.direction, 40);
    const eventId = clampString(payload.eventId, 64);
    const contributorId = clampString(payload.contributorId, 64);
    const choiceId = clampString(payload.choiceId, 200);
    const abbreviation = clampString(payload.abbreviation, 120);
    if (!eventId || !contributorId || !abbreviation || !choiceId || !DIRECTIONS.has(direction)) {
      return NextResponse.json(
        { ok: false, error: "eventId, contributorId, abbreviation, choiceId and a valid direction are required." },
        { status: 400 },
      );
    }
    if (seenEventIds.has(eventId)) {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    // Validate the meaning id against the dictionary: the part before "::"
    // must be a known entry id. Session custom entries (custom-*) are also
    // accepted by prefix since they are reviewer-approved additions.
    const entryId = choiceId.split("::")[0];
    const ids = await getDictionaryIds();
    if (ids.size > 0 && !ids.has(entryId) && !entryId.startsWith("custom-")) {
      return NextResponse.json(
        { ok: false, error: "Unknown meaning id; the dictionary may have changed." },
        { status: 422 },
      );
    }
    const event: LearningEvent = {
      eventId,
      contributorId,
      abbreviation,
      choiceId,
      service: clampString(payload.service, 40) || "all",
      writingContext: clampString(payload.writingContext, 60) || "all",
      direction: direction as LearningEvent["direction"],
      confirmed: payload.confirmed === true,
      datasetVersion: clampString(payload.datasetVersion, 60) || undefined,
    };
    await mkdir(DATA_DIR, { recursive: true });
    await appendFile(DATA_FILE, `${JSON.stringify({ ...event, receivedAt: new Date().toISOString() })}\n`, "utf8");
    seenEventIds.add(eventId);
    if (seenEventIds.size > MAX_STORED_EVENTS) seenEventIds.clear();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "The learning event could not be stored." }, { status: 500 });
  }
}

export async function GET() {
  try {
    const raw = await readFile(DATA_FILE, "utf8");
    const events: LearningEvent[] = [];
    const seen = new Set<string>();
    for (const lineText of raw.split("\n")) {
      if (!lineText.trim()) continue;
      try {
        const record = JSON.parse(lineText) as LearningEvent;
        if (!record.abbreviation || !record.choiceId || !DIRECTIONS.has(record.direction)) continue;
        if (record.eventId) {
          if (seen.has(record.eventId)) continue;
          seen.add(record.eventId);
        }
        events.push(record);
      } catch {
        // Skip malformed lines.
      }
    }
    // Per-contributor caps are applied during aggregation, so one actor
    // cannot manufacture agreement.
    const aggregate = aggregateLearningEvents(events);
    return NextResponse.json({ ok: true, eventCount: events.length, aggregate });
  } catch {
    return NextResponse.json({ ok: true, eventCount: 0, aggregate: {} });
  }
}

/** Clears all shared evidence. Owner-only when OWNER_TOKEN is configured. */
export async function DELETE(request: Request) {
  const token = process.env.OWNER_TOKEN;
  if (token && request.headers.get("x-owner-token") !== token) {
    return NextResponse.json({ ok: false, error: "Owner token required." }, { status: 401 });
  }
  try {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(DATA_FILE, "", "utf8");
    seenEventIds.clear();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "The learning events could not be cleared." }, { status: 500 });
  }
}
