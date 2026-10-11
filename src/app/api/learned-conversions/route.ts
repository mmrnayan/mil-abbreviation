import { NextResponse } from "next/server";
import {
  listLearnedConversions,
  saveLearnedConversions,
} from "@/server/learnedConversions";

/**
 * Learned word conversions: word→abbreviation pairs confirmed through
 * Review mode. GET serves them to the dataset composer so they join the
 * runtime dictionary as reviewer-approved medium-confidence entries; the
 * converter reflects them after a page reload. DELETE clears the store
 * (owner-gated when OWNER_TOKEN is set).
 */
export async function GET() {
  const items = await listLearnedConversions();
  return NextResponse.json({ ok: true, items });
}

export async function DELETE(request: Request) {
  const token = process.env.OWNER_TOKEN;
  if (token && request.headers.get("x-owner-token") !== token) {
    return NextResponse.json({ ok: false, error: "Owner token required." }, { status: 401 });
  }
  await saveLearnedConversions([]);
  return NextResponse.json({ ok: true });
}
