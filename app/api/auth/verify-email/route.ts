import { NextResponse } from "next/server";

const BACKEND_BASE_URL = "http://localhost:8080";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const host = req.headers.get("host") ?? "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const base = `${proto}://${host}`;

  if (!token) {
    return NextResponse.redirect(`${base}/login?email_error=1`);
  }

  const res = await fetch(
    `${BACKEND_BASE_URL}/auth/verify-email?token=${encodeURIComponent(token)}`,
    { cache: "no-store" },
  );
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 502) {
      return NextResponse.redirect(`${base}/login?sms_verify_error=1`);
    }
    return NextResponse.redirect(`${base}/login?email_error=1`);
  }
  if (data?.ok) {
    return NextResponse.redirect(`${base}/login?email_verified=1`);
  }
  return NextResponse.redirect(`${base}/login?email_error=1`);
}
