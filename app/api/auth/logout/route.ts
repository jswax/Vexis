import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const BACKEND_BASE_URL = "http://localhost:8080";

export async function POST() {
  const token = cookies().get("vexis_token")?.value;
  if (token) {
    await fetch(`${BACKEND_BASE_URL}/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  }
  cookies().set("vexis_token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return NextResponse.json({ ok: true }, { status: 200 });
}
