import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const BACKEND_BASE_URL = "http://localhost:8080";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const res = await fetch(`${BACKEND_BASE_URL}/auth/verify-otp`, {
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

  const token = data?.token;
  if (typeof token !== "string" || !token) {
    return NextResponse.json({ error: "invalid token response" }, { status: 500 });
  }

  const isProd = process.env.NODE_ENV === "production";
  cookies().set("vexis_token", token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
