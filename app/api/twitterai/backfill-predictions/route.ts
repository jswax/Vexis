import { NextRequest, NextResponse } from "next/server";

import { fetchTwitterAiLong } from "@/lib/twitteraiProxyFetch";

export const runtime = "nodejs";
export const maxDuration = 300;

const TWITTER_AI_URL = process.env.TWITTER_AI_URL || "http://localhost:4001";
const TWITTERAI_TOKEN = process.env.TWITTERAI_TOKEN;

const BACKFILL_FETCH_TIMEOUT_MS = 890_000;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (TWITTERAI_TOKEN) headers["x-twitterai-token"] = TWITTERAI_TOKEN;
    const res = await fetchTwitterAiLong(
      `${TWITTER_AI_URL}/api/twitter/backfill-predictions`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      },
      BACKFILL_FETCH_TIMEOUT_MS
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
