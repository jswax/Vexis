import { NextRequest, NextResponse } from "next/server";

const TWITTER_AI_URL = process.env.TWITTER_AI_URL || "http://localhost:4001";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const params = new URLSearchParams();
    if (sp.get("limit")) params.set("limit", sp.get("limit")!);
    if (sp.get("offset")) params.set("offset", sp.get("offset")!);
    if (sp.get("ticker")) params.set("ticker", sp.get("ticker")!);
    if (sp.get("qqq")) params.set("qqq", sp.get("qqq")!);
    if (sp.get("test_only")) params.set("test_only", sp.get("test_only")!);
    if (sp.get("sort")) params.set("sort", sp.get("sort")!);

    const res = await fetch(
      `${TWITTER_AI_URL}/api/twitter/tweets?${params.toString()}`
    );
    const data = await res.json().catch(() => null);
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to reach TwitterAI service", detail: String(err) },
      { status: 502 }
    );
  }
}
