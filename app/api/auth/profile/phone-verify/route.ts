import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const BACKEND_BASE_URL = "http://localhost:8080";

export async function POST(req: Request) {
  const token = cookies().get("vexis_token")?.value;
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const res = await fetch(`${BACKEND_BASE_URL}/auth/profile/phone-verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body ?? {}),
    cache: "no-store",
  });

  const data = await res.json().catch(() => null);
  return NextResponse.json(data ?? { ok: true }, { status: res.status });
}
