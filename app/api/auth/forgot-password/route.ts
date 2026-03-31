import { NextResponse } from "next/server";

const BACKEND_BASE_URL = "http://localhost:8080";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const res = await fetch(`${BACKEND_BASE_URL}/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const data = await res.json().catch(() => null);
  return NextResponse.json(
    data ?? { ok: true },
    { status: res.ok ? 200 : res.status },
  );
}
