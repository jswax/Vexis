import { NextRequest, NextResponse } from "next/server";

const TWITTER_AI_URL =
  process.env.TWITTER_AI_URL || "http://localhost:4001";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const res = await fetch(
      `${TWITTER_AI_URL}/api/twitter/tweets/${params.id}`
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
