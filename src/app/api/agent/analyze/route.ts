import { NextResponse } from "next/server";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  analyzeCorrections,
  type CorrectionInput,
  type DictionaryEntry,
  type ExistingOverride,
  type ManualDocument,
  type StoredProposal,
} from "@/utils/improvementAgent";
import { composeDataset, composeRulesOverlay } from "@/engine/datasetLayers";
import { configureRulesOverlay } from "@/engine/rulesOverlay";
import { ConverterEngine } from "@/engine/converter";
import type {
  AuthoritativeDictionary,
  LanguageRules,
  OverridesLayer,
} from "@/engine/datasetLayers";

/**
 * The background improvement pipeline. POST starts an analysis job that
 * runs in this server process and persists its record, so progress and
 * results survive page reloads; GET inspects jobs.
 *
 * Jobs only COLLECT: they produce evidence-backed proposals in
 * data/agent-proposals.jsonl and never write to the data layers.
 * Model credentials are not involved — the analyst is deterministic.
 */

const DATA_DIR = path.join(process.cwd(), "data");
const JOBS_DIR = path.join(DATA_DIR, "agent-jobs");
const CORRECTIONS_FILE = path.join(DATA_DIR, "corrections.jsonl");
const PROPOSALS_FILE = path.join(DATA_DIR, "agent-proposals.jsonl");
const MANUALS_DIR = path.join(DATA_DIR, "manuals");
const BASE_FILE = path.join(process.cwd(), "public/data/abbreviations.base.json");
const OVERRIDES_FILE = path.join(process.cwd(), "public/data/abbreviation-overrides.json");

interface JobRecord {
  jobId: string;
  status: "running" | "done" | "failed" | "interrupted";
  startedAt: string;
  finishedAt?: string;
  progress: { stage: string; detail: string };
  correctionsRead: number;
  groupsFound: number;
  proposalsNew: number;
  proposalsKnown: number;
  proposalIds: string[];
  failures: string[];
}

async function readJsonl<T>(file: string): Promise<T[]> {
  try {
    const raw = await readFile(file, "utf8");
    const items: T[] = [];
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        items.push(JSON.parse(line) as T);
      } catch {
        // Skip malformed lines.
      }
    }
    return items;
  } catch {
    return [];
  }
}

async function writeJob(job: JobRecord): Promise<void> {
  await mkdir(JOBS_DIR, { recursive: true });
  await writeFile(path.join(JOBS_DIR, `${job.jobId}.json`), JSON.stringify(job, null, 2), "utf8");
}

async function readManuals(): Promise<ManualDocument[]> {
  try {
    await mkdir(MANUALS_DIR, { recursive: true });
    const files = (await readdir(MANUALS_DIR)).filter((name) => name.endsWith(".txt"));
    const manuals: ManualDocument[] = [];
    for (const name of files) {
      const raw = await readFile(path.join(MANUALS_DIR, name), "utf8");
      manuals.push({ slug: name.replace(/\.txt$/u, ""), lines: raw.split(/\n/) });
    }
    return manuals;
  } catch {
    return [];
  }
}

/** The live conversion engine, built once per process, for freshness checks. */
let cachedEngine: ConverterEngine | undefined;
async function getEngine(): Promise<ConverterEngine | undefined> {
  if (cachedEngine) return cachedEngine;
  try {
    const base = JSON.parse(await readFile(BASE_FILE, "utf8")) as AuthoritativeDictionary;
    const rules = JSON.parse(
      await readFile(path.join(process.cwd(), "public/data/abbreviation-rules.json"), "utf8"),
    ) as LanguageRules;
    const overrides = JSON.parse(await readFile(OVERRIDES_FILE, "utf8")) as OverridesLayer;
    // Include learned conversions so already-learned pairs count as fixed.
    const learned = await readJsonl<{ word: string; abbreviation: string; count: number }>(
      path.join(DATA_DIR, "learned-conversions.jsonl"),
    );
    const dataset = composeDataset(base, rules, overrides, learned);
    configureRulesOverlay(composeRulesOverlay(rules, overrides, dataset));
    cachedEngine = new ConverterEngine(dataset);
    return cachedEngine;
  } catch {
    return undefined;
  }
}

async function runAnalysis(jobId: string): Promise<void> {
  const job: JobRecord = {
    jobId,
    status: "running",
    startedAt: new Date().toISOString(),
    progress: { stage: "loading", detail: "Reading your saved corrections" },
    correctionsRead: 0,
    groupsFound: 0,
    proposalsNew: 0,
    proposalsKnown: 0,
    proposalIds: [],
    failures: [],
  };
  await writeJob(job);
  try {
    const corrections = await readJsonl<CorrectionInput>(CORRECTIONS_FILE);
    job.correctionsRead = corrections.length;
    job.progress = { stage: "collecting", detail: `Grouping ${corrections.length} saved corrections` };
    await writeJob(job);

    const base = JSON.parse(await readFile(BASE_FILE, "utf8")) as { entries: DictionaryEntry[] };
    const overridesLayer = JSON.parse(await readFile(OVERRIDES_FILE, "utf8")) as {
      overrides: ExistingOverride[];
    };
    const storedProposals = await readJsonl<StoredProposal>(PROPOSALS_FILE);
    const manuals = await readManuals();

    job.progress = { stage: "analyzing", detail: "Checking each one against your manual" };
    await writeJob(job);

    const proposals = analyzeCorrections(corrections, base.entries, overridesLayer.overrides, manuals);
    job.groupsFound = proposals.length;

    // Freshness check: a suggestion for a pair the app already converts
    // correctly is stale — skip it instead of asking the owner to approve
    // something that is already fixed.
    const engine = await getEngine();
    const knownSignatures = new Set(
      storedProposals.map((proposal) => `${proposal.rule}|${proposal.entry_id ?? ""}|${proposal.input}|${proposal.output}|${proposal.suggested_full_form ?? ""}`),
    );
    const fresh: StoredProposal[] = [];
    let stale = 0;
    for (const proposal of proposals) {
      const signature = `${proposal.rule}|${proposal.entry_id ?? ""}|${proposal.input}|${proposal.output}|${proposal.suggested_full_form ?? ""}`;
      if (knownSignatures.has(signature)) {
        job.proposalsKnown += 1;
        continue;
      }
      if (engine && proposal.rule === "add_conversion" && proposal.input) {
        try {
          const current = engine.convertForward(proposal.input).convertedText.trim().toLowerCase();
          if (current === proposal.output.trim().toLowerCase()) {
            stale += 1;
            continue;
          }
        } catch {
          // If the check fails, keep the proposal — the owner decides.
        }
      }
      knownSignatures.add(signature);
      fresh.push({ ...proposal, id: `AP-${String(storedProposals.length + fresh.length + 1).padStart(4, "0")}` });
      job.proposalIds.push(fresh[fresh.length - 1].id);
    }
    job.proposalsNew = fresh.length;

    job.progress = { stage: "persisting", detail: "Saving suggestions for your review" };
    if (fresh.length) {
      await mkdir(DATA_DIR, { recursive: true });
      await writeFile(
        PROPOSALS_FILE,
        [...storedProposals, ...fresh].map((proposal) => JSON.stringify(proposal)).join("\n") + "\n",
        "utf8",
      );
    }

    job.status = "done";
    job.finishedAt = new Date().toISOString();
    job.progress = {
      stage: "done",
      detail:
        `Finished: read ${corrections.length} corrections, found ${fresh.length} new suggestion${fresh.length === 1 ? "" : "s"}` +
        `${stale ? `, skipped ${stale} already fixed` : ""}${job.proposalsKnown ? `, ${job.proposalsKnown} already listed` : ""}.`,
    };
    await writeJob(job);
  } catch (error) {
    job.status = "failed";
    job.failures.push(error instanceof Error ? error.message : "Analysis failed.");
    job.finishedAt = new Date().toISOString();
    await writeJob(job);
  }
}

function requireOwner(request: Request): boolean {
  const token = process.env.OWNER_TOKEN;
  return !token || request.headers.get("x-owner-token") === token;
}

export async function POST(request: Request) {
  if (!requireOwner(request)) {
    return NextResponse.json({ ok: false, error: "Owner token required." }, { status: 401 });
  }
  const jobId = `job-${Date.now()}`;
  // Fire-and-forget: the job persists its own record as it progresses.
  void runAnalysis(jobId);
  return NextResponse.json({ ok: true, jobId });
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  try {
    await mkdir(JOBS_DIR, { recursive: true });
    if (id) {
      const job = JSON.parse(await readFile(path.join(JOBS_DIR, `${id}.json`), "utf8")) as JobRecord;
      // A job "running" for over 10 minutes died with its process.
      if (
        job.status === "running" &&
        Date.now() - new Date(job.startedAt).getTime() > 10 * 60_000
      ) {
        job.status = "interrupted";
        await writeJob(job);
      }
      return NextResponse.json({ ok: true, job });
    }
    const files = (await readdir(JOBS_DIR)).filter((name) => name.endsWith(".json")).sort().reverse();
    const jobs: JobRecord[] = [];
    for (const name of files.slice(0, 20)) {
      try {
        jobs.push(JSON.parse(await readFile(path.join(JOBS_DIR, name), "utf8")) as JobRecord);
      } catch {
        // Skip malformed job files.
      }
    }
    return NextResponse.json({ ok: true, jobs });
  } catch {
    return NextResponse.json({ ok: true, jobs: [] });
  }
}
