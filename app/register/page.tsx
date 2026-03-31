"use client";

import Link from "next/link";
import { useState } from "react";

import { Container } from "@/components/Container";
import { PageHeader } from "@/components/PageHeader";
import { apiFetch } from "@/lib/api";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [tradingviewUsername, setTradingviewUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [devVerifyUrl, setDevVerifyUrl] = useState<string | null>(null);
  const [registrationComplete, setRegistrationComplete] = useState(false);
  const [loading, setLoading] = useState(false);

  const emailOk = /^\S+@\S+\.\S+$/.test(email);
  const passwordOk = password.length >= 8;
  const phoneOk =
    phoneNumber.length >= 10 &&
    phoneNumber.startsWith("+") &&
    /^\+[0-9]+$/.test(phoneNumber);

  return (
    <div>
      <PageHeader
        eyebrow="REGISTER"
        title="Create your Vexis account."
        description="You will verify your email and phone before you can sign in."
      />
      <Container>
        <div className="py-12">
          <div className="mx-auto w-full max-w-md rounded-2xl border border-border bg-white p-6 shadow-sm">
            <form
              className="grid gap-4"
              onSubmit={async (e) => {
                e.preventDefault();
                if (registrationComplete) {
                  return;
                }
                setError(null);
                setInfo(null);
                setDevVerifyUrl(null);
                if (!emailOk) {
                  setError("Please enter a valid email.");
                  return;
                }
                if (!passwordOk) {
                  setError("Password must be at least 8 characters.");
                  return;
                }
                if (!phoneOk) {
                  setError(
                    "Phone must be in E.164 format (e.g. +15551234567).",
                  );
                  return;
                }
                setLoading(true);
                try {
                  const res = await apiFetch<{
                    dev_email_verify_url?: string;
                  }>("/auth/register", {
                    method: "POST",
                    body: JSON.stringify({
                      email,
                      password,
                      phone_number: phoneNumber,
                      tradingview_username:
                        tradingviewUsername.trim() || undefined,
                    }),
                  });
                  setRegistrationComplete(true);
                  setInfo(
                    "Check your email and verify your account using the link we sent. You can sign in only after your email is verified.",
                  );
                  setDevVerifyUrl(
                    typeof res.dev_email_verify_url === "string"
                      ? res.dev_email_verify_url
                      : null,
                  );
                } catch (err) {
                  setError(
                    err instanceof Error ? err.message : "Registration failed",
                  );
                } finally {
                  setLoading(false);
                }
              }}
            >
              <label className="grid gap-2">
                <span className="text-xs font-semibold tracking-[0.22em] text-muted-foreground">
                  EMAIL
                </span>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={registrationComplete}
                  className="h-11 rounded-md border border-border bg-white px-4 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-xs font-semibold tracking-[0.22em] text-muted-foreground">
                  PASSWORD
                </span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={registrationComplete}
                  className="h-11 rounded-md border border-border bg-white px-4 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-xs font-semibold tracking-[0.22em] text-muted-foreground">
                  PHONE (E.164)
                </span>
                <input
                  type="tel"
                  autoComplete="tel"
                  placeholder="+15551234567"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  disabled={registrationComplete}
                  className="h-11 rounded-md border border-border bg-white px-4 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-xs font-semibold tracking-[0.22em] text-muted-foreground">
                  TRADINGVIEW USERNAME (OPTIONAL)
                </span>
                <input
                  type="text"
                  autoComplete="username"
                  value={tradingviewUsername}
                  onChange={(e) => setTradingviewUsername(e.target.value)}
                  disabled={registrationComplete}
                  className="h-11 rounded-md border border-border bg-white px-4 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>

              {error ? (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              ) : null}
              {info ? (
                <div className="grid gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  <p>{info}</p>
                  {devVerifyUrl ? (
                    <p className="text-xs text-emerald-900/80">
                      <span className="font-medium">Local testing:</span>{" "}
                      <a
                        href={devVerifyUrl}
                        className="break-all text-accent underline underline-offset-2"
                      >
                        Open verification link
                      </a>
                    </p>
                  ) : null}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={loading || registrationComplete}
                className="mt-2 inline-flex h-11 items-center justify-center gap-2 rounded-md bg-accent px-5 text-sm font-semibold text-white shadow-sm transition hover:shadow-md hover:scale-[1.01] disabled:opacity-60 disabled:hover:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
              >
                {loading ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Creating…
                  </>
                ) : registrationComplete ? (
                  "Account pending verification"
                ) : (
                  "Create account"
                )}
              </button>

              <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  Already have an account?{" "}
                  <Link href="/login" className="text-accent hover:underline">
                    Sign in
                  </Link>
                </span>
                <Link href="/contact" className="text-accent hover:underline">
                  Need help?
                </Link>
              </div>
            </form>
          </div>
        </div>
      </Container>
    </div>
  );
}
