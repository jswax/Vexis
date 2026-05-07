import { NextResponse } from "next/server";

const TWITTER_AI_URL = process.env.TWITTER_AI_URL || "http://localhost:4001";

export async function GET() {
  try {
    const res = await fetch(`${TWITTER_AI_URL}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    const data = await res.json().catch(() => null);
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ status: "unreachable" }, { status: 503 });
  }
}
