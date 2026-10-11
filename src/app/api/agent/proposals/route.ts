import { NextResponse } from "next/server";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { applyReview, type StoredProposal } from "@/utils/improvementAgent";

/**
 * Agent proposals store. GET lists collected proposals; POST records the
 * owner's review (approve/reject). Deliberately NO promotion: approved
 * proposals are marked for a future data-layer update, nothing is applied.
 */
const PROPOSALS_FILE = path.join(process.cwd(), "data", "agent-proposals.jsonl");

async function loadProposals(): Promise<StoredProposal[]> {
  try {
    const raw = await readFile(PROPOSALS_FILE, "utf8");
    const items: StoredProposal[] = [];
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        items.push(JSON.parse(line) as StoredProposal);
      } catch {
        // Skip malformed lines.
      }
    }
    return items;
  } catch {
    return [];
  }
}

export async function GET() {
  const items = await loadProposals();
  return NextResponse.json({
    ok: true,
    items,
    summary: {
      total: items.length,
      proposed: items.filter((item) => item.reviewStatus === "proposed").length,
      approved: items.filter((item) => item.reviewStatus === "approved").length,
      rejected: items.filter((item) => item.reviewStatus === "rejected").length,
    },
    note: "Proposals are collected for review only — nothing is applied to the data layers yet.",
  });
}

export async function POST(request: Request) {
  const token = process.env.OWNER_TOKEN;
  if (token && request.headers.get("x-owner-token") !== token) {
    return NextResponse.json({ ok: false, error: "Owner token required." }, { status: 401 });
  }
  try {
    const body = (await request.json()) as { id?: string; action?: string; note?: string };
    if (!body.id || (body.action !== "approve" && body.action !== "reject")) {
      return NextResponse.json({ ok: false, error: "id and action (approve|reject) are required." }, { status: 400 });
    }
    const proposals = await loadProposals();
    if (!proposals.some((proposal) => proposal.id === body.id)) {
      return NextResponse.json({ ok: false, error: "Unknown proposal id." }, { status: 404 });
    }
    const next = applyReview(proposals, body.id, body.action, body.note);
    await mkdir(path.dirname(PROPOSALS_FILE), { recursive: true });
    await writeFile(
      PROPOSALS_FILE,
      next.map((proposal) => JSON.stringify(proposal)).join("\n") + "\n",
      "utf8",
    );
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "The review could not be stored." }, { status: 500 });
  }
}
