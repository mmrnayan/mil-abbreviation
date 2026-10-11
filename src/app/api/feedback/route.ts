import { NextResponse } from "next/server";
import path from "node:path";
import { storeReport, readReports } from "../../../../scripts/feedback-store.mjs";
const directory = path.join(process.cwd(), "data");
export async function POST(request: Request) {
  try {
    const text = await request.text();
    if (text.length > 256 * 1024) return NextResponse.json({ ok: false, error: "Report too large." }, { status: 413 });
    let payload: unknown;
    try { payload = JSON.parse(text); } catch { return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 }); }
    return NextResponse.json(await storeReport(directory, payload));
  } catch (cause) {
    return NextResponse.json({ ok: false, error: cause instanceof Error ? cause.message : "Report could not be stored." }, { status: 400 });
  }
}
export async function GET() {
  if (process.env.SAC_OWNER_WORKSPACE !== "1") return new NextResponse("Not found", { status: 404 });
  return NextResponse.json({ ok: true, items: await readReports(directory) });
}
