import { NextRequest, NextResponse } from "next/server";

import { fetchTwitterAiLong } from "@/lib/twitteraiProxyFetch";

export const runtime = "nodejs";
// Ingest can take several minutes (twitterapi.io pagination + free-tier pacing).
export const maxDuration = 900;

const TWITTER_AI_URL =
  process.env.TWITTER_AI_URL || "http://localhost:4001";
const TWITTERAI_TOKEN = process.env.TWITTERAI_TOKEN;

/** Must match undici Agent body/headers timeout (defaults ~300s otherwise). */
const INGEST_FETCH_TIMEOUT_MS = Math.min(
  Number(process.env.TWITTER_AI_INGEST_FETCH_TIMEOUT_MS) || 890_000,
  890_000
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (TWITTERAI_TOKEN) headers["x-twitterai-token"] = TWITTERAI_TOKEN;
    const url = `${TWITTER_AI_URL}/api/twitter/ingest`;
    // Default (background ingest): FastAPI returns 202 in milliseconds — avoid long undici waits.
    const syncIngest = body?.background === false;
    const res = syncIngest
      ? await fetchTwitterAiLong(
          url,
          { method: "POST", headers, body: JSON.stringify(body) },
          INGEST_FETCH_TIMEOUT_MS
        )
      : await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(120_000),
        });
    const data = await res.json().catch(() => null);
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to reach TwitterAI service", detail: String(err) },
      { status: 502 }
    );
  }
}
