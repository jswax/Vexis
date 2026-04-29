import { NextResponse } from "next/server";

const TWITTER_AI_URL = process.env.TWITTER_AI_URL || "http://localhost:4001";
const TWITTERAI_TOKEN = process.env.TWITTERAI_TOKEN;

export async function POST() {
  try {
    const headers: Record<string, string> = {};
    if (TWITTERAI_TOKEN) headers["x-twitterai-token"] = TWITTERAI_TOKEN;
    const res = await fetch(`${TWITTER_AI_URL}/api/twitter/logs/clear`, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(5000),
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

