import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const BACKEND_BASE_URL = "http://localhost:8080";

function setAuthCookie(token: string) {
  const isProd = process.env.NODE_ENV === "production";
  cookies().set("vexis_token", token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const res = await fetch(`${BACKEND_BASE_URL}/auth/login`, {
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

  if (data?.requires_otp === true) {
    const payload: {
      requires_otp: true;
      dev_otp?: string;
      otp_phase?: string;
    } = {
      requires_otp: true,
    };
    if (typeof data?.dev_otp === "string") {
      payload.dev_otp = data.dev_otp;
    }
    if (typeof data?.otp_phase === "string") {
      payload.otp_phase = data.otp_phase;
    }
    return NextResponse.json(payload, { status: 200 });
  }

  const token = data?.token;
  if (typeof token === "string" && token) {
    setAuthCookie(token);
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  return NextResponse.json({ error: "unexpected login response" }, { status: 500 });
}
