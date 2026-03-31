import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const BACKEND_BASE_URL = "http://localhost:8080";

export async function POST(req: Request) {
  const token = cookies().get("vexis_token")?.value;
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const res = await fetch(`${BACKEND_BASE_URL}/auth/change-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
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

  const newToken = data?.token;
  if (typeof newToken === "string" && newToken) {
    const isProd = process.env.NODE_ENV === "production";
    cookies().set("vexis_token", newToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
