import { NextResponse } from "next/server";

const BACKEND_BASE_URL = "http://localhost:8080";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const res = await fetch(`${BACKEND_BASE_URL}/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    return NextResponse.json(
      { error: data?.error ?? `Request failed (${res.status})` },
      { status: res.status },
    );
  }
  return NextResponse.json(data ?? { ok: true }, { status: 200 });
}
