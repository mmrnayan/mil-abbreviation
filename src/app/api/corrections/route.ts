import { NextResponse } from "next/server";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isErrorTypeId } from "@/utils/correctionAnalysis";
import { readConversionFeedbackContext, sanitizeFeedbackFilters } from "@/utils/conversionFeedback";
import {
  buildConvertingWordSet,
  recordLearnedConversion,
} from "@/server/learnedConversions";

// Structured correction records from Review Mode, appended as JSON lines so
// every saved correction keeps WHY it was necessary, not just the fixed text.
const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "corrections.jsonl");

const REVIEW_STATUSES = new Set(["approved", "corrected"]);

interface IncomingCorrection {
  source?: unknown;
  actual?: unknown;
  expected?: unknown;
  error_type?: unknown;
  root?: unknown;
  entry_id?: unknown;
  required_rule?: unknown;
}

function clampString(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max).trim() : "";
}

function sanitizeCorrection(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as IncomingCorrection;
  if (!isErrorTypeId(record.error_type)) return null;
  const clean: Record<string, unknown> = {
    source: clampString(record.source, 300),
    actual: clampString(record.actual, 300),
    expected: clampString(record.expected, 300),
    error_type: record.error_type,
  };
  const root = clampString(record.root, 120);
  const entryId = clampString(record.entry_id, 60);
  const rule = clampString(record.required_rule, 60);
  if (root) clean.root = root;
  if (entryId) clean.entry_id = entryId;
  if (rule) clean.required_rule = rule;
  return clean;
}

async function nextFeedbackId(): Promise<string> {
  try {
    const raw = await readFile(DATA_FILE, "utf8");
    let max = 0;
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        const record = JSON.parse(line) as { feedback_id?: string };
        const match = /^FB-(\d+)$/u.exec(record.feedback_id ?? "");
        if (match) max = Math.max(max, Number.parseInt(match[1], 10));
      } catch {
        // Skip malformed lines; the id sequence still advances.
      }
    }
    return `FB-${String(max + 1).padStart(4, "0")}`;
  } catch {
    return "FB-0001";
  }
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const payload = (body ?? {}) as Record<string, unknown>;
    const inputSentence = clampString(payload.input_sentence, 8000);
    const actualOutput = clampString(payload.actual_output, 8000);
    const expectedOutput = clampString(payload.expected_output, 8000);
    const reviewStatus = clampString(payload.review_status, 20);
    if (!inputSentence || !actualOutput || !expectedOutput) {
      return NextResponse.json(
        { ok: false, error: "Original, actual and expected outputs are all required." },
        { status: 400 },
      );
    }
    if (!REVIEW_STATUSES.has(reviewStatus)) {
      return NextResponse.json(
        { ok: false, error: "review_status must be approved or corrected." },
        { status: 400 },
      );
    }
    const rawCorrections = Array.isArray(payload.corrections) ? payload.corrections : [];
    const corrections: Record<string, unknown>[] = [];
    for (const item of rawCorrections) {
      const clean = sanitizeCorrection(item);
      if (!clean) {
        return NextResponse.json(
          { ok: false, error: "A correction is missing a valid error_type." },
          { status: 400 },
        );
      }
      corrections.push(clean);
    }
    const reviewedBy = clampString(payload.reviewed_by, 120) || "human";
    const direction = clampString(payload.direction, 40);

    const entry = {
      feedback_id: await nextFeedbackId(),
      input_sentence: inputSentence,
      actual_output: actualOutput,
      expected_output: expectedOutput,
      corrections,
      review_status: reviewStatus,
      reviewed_by: reviewedBy,
      direction: direction || undefined,
      filters: sanitizeFeedbackFilters(payload.filters),
      source_feedback_id: clampString(payload.source_feedback_id, 120) || undefined,
      reported_context: readConversionFeedbackContext(payload.reported_context),
      created_at: new Date().toISOString(),
    };
    await mkdir(DATA_DIR, { recursive: true });
    await appendFile(DATA_FILE, `${JSON.stringify(entry)}\n`, "utf8");

    // Learn word conversions from reviewer-confirmed missing conversions:
    // a word that stayed in full but has an authorized abbreviation is
    // recorded as reviewer-approved usage and joins the runtime dictionary
    // (medium confidence) after the next reload. Wrong/other error types
    // are NOT auto-learned — they go through the agent proposals instead.
    if (reviewStatus === "corrected" || reviewStatus === "approved") {
      const convertingWords = await buildConvertingWordSet();
      for (const correction of corrections) {
        if (correction.error_type !== "missing_conversion") continue;
        const source = String(correction.source ?? "");
        if (!source || /\s/u.test(source)) continue;
        await recordLearnedConversion(
          source,
          String(correction.expected ?? ""),
          entry.feedback_id,
          convertingWords,
        );
      }
    }

    return NextResponse.json({ ok: true, feedback_id: entry.feedback_id });
  } catch {
    return NextResponse.json({ ok: false, error: "The correction could not be stored." }, { status: 500 });
  }
}

export async function GET() {
  try {
    const raw = await readFile(DATA_FILE, "utf8");
    const items = raw
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as unknown);
    return NextResponse.json({ ok: true, items });
  } catch {
    return NextResponse.json({ ok: true, items: [] });
  }
}

export async function DELETE(request: Request) {
  // Owner-only when OWNER_TOKEN is configured on the server.
  const ownerToken = process.env.OWNER_TOKEN;
  if (ownerToken && request.headers.get("x-owner-token") !== ownerToken) {
    return NextResponse.json({ ok: false, error: "Owner token required." }, { status: 401 });
  }
  try {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(DATA_FILE, "", "utf8");
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "The corrections could not be cleared." }, { status: 500 });
  }
}
