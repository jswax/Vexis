import { NextRequest, NextResponse } from "next/server";

const TWITTER_AI_URL =
  process.env.TWITTER_AI_URL || "http://localhost:4001";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const res = await fetch(`${TWITTER_AI_URL}/api/twitter/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
