import { NextRequest, NextResponse } from "next/server";

const TWITTER_AI_URL = process.env.TWITTER_AI_URL || "http://localhost:4001";
const TWITTERAI_TOKEN = process.env.TWITTERAI_TOKEN;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (TWITTERAI_TOKEN) headers["x-twitterai-token"] = TWITTERAI_TOKEN;
    const res = await fetch(`${TWITTER_AI_URL}/api/twitter/export`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
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
