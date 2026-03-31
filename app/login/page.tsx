"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { Container } from "@/components/Container";
import { PageHeader } from "@/components/PageHeader";
import { apiFetch } from "@/lib/api";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resetToken = searchParams.get("reset");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [needsOtp, setNeedsOtp] = useState(false);
  const [devOtpHint, setDevOtpHint] = useState<string | null>(null);
  const [resetPass, setResetPass] = useState("");
  const [resetConfirm, setResetConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (searchParams.get("email_verified") === "1") {
      setInfo(
        "Email verified. Sign in with your password, then enter the SMS code to finish setup.",
      );
    }
    if (searchParams.get("email_error") === "1") {
      setError("Email verification failed. Try again or contact support.");
    }
    if (searchParams.get("sms_verify_error") === "1") {
      setError(
        "Could not send the phone verification text. Open the email link again to retry.",
      );
    }
  }, [searchParams]);

  const emailOk = /^\S+@\S+\.\S+$/.test(email);
  const passwordOk = password.length >= 8;

  return (
    <div>
      <PageHeader
        eyebrow="LOGIN"
        title="Access Vexis."
        description="Sign in with your email and password. You will verify an SMS code each time."
      />
      <Container>
        <div className="py-12">
          <div className="mx-auto w-full max-w-md rounded-2xl border border-border bg-white p-6 shadow-sm">
            {resetToken ? (
              <form
                className="grid gap-4"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setError(null);
                  if (resetPass.length < 8) {
                    setError("Password must be at least 8 characters.");
                    return;
                  }
                  if (resetPass !== resetConfirm) {
                    setError("Passwords do not match.");
                    return;
                  }
                  setLoading(true);
                  try {
                    await apiFetch("/auth/reset-password", {
                      method: "POST",
                      body: JSON.stringify({
                        token: resetToken,
                        password: resetPass,
                      }),
                    });
                    setInfo("Password updated. You can sign in.");
                    router.replace("/login");
                  } catch (err) {
                    setError(
                      err instanceof Error ? err.message : "Reset failed",
                    );
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                <div className="text-sm font-medium text-foreground">
                  Set a new password
                </div>
                <label className="grid gap-2">
                  <span className="text-xs font-semibold tracking-[0.22em] text-muted-foreground">
                    NEW PASSWORD
                  </span>
                  <input
                    type="password"
                    value={resetPass}
                    onChange={(e) => setResetPass(e.target.value)}
                    className="h-11 rounded-md border border-border bg-white px-4 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-xs font-semibold tracking-[0.22em] text-muted-foreground">
                    CONFIRM
                  </span>
                  <input
                    type="password"
                    value={resetConfirm}
                    onChange={(e) => setResetConfirm(e.target.value)}
                    className="h-11 rounded-md border border-border bg-white px-4 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                  />
                </label>
                {error ? (
                  <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                  </div>
                ) : null}
                {info ? (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                    {info}
                  </div>
                ) : null}
                <button
                  type="submit"
                  disabled={loading}
                  className="mt-2 inline-flex h-11 items-center justify-center gap-2 rounded-md bg-accent px-5 text-sm font-semibold text-white shadow-sm transition hover:shadow-md hover:scale-[1.01] disabled:opacity-60 disabled:hover:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                >
                  {loading ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Updating…
                    </>
                  ) : (
                    "Update password"
                  )}
                </button>
              </form>
            ) : (
              <form
                className="grid gap-4"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setError(null);
                  if (!needsOtp) {
                    if (!emailOk) {
                      setError("Please enter a valid email.");
                      return;
                    }
                    if (!passwordOk) {
                      setError("Password must be at least 8 characters.");
                      return;
                    }
                    setLoading(true);
                    try {
                      const res = await apiFetch<{
                        requires_otp?: boolean;
                        dev_otp?: string;
                      }>("/auth/login", {
                        method: "POST",
                        body: JSON.stringify({ email, password }),
                      });
                      if (res.requires_otp) {
                        setDevOtpHint(
                          typeof res.dev_otp === "string" ? res.dev_otp : null,
                        );
                        setNeedsOtp(true);
                      } else {
                        window.dispatchEvent(new Event("vexis-auth-changed"));
                        router.push("/dashboard");
                      }
                    } catch (err) {
                      setError(
                        err instanceof Error ? err.message : "Login failed",
                      );
                    } finally {
                      setLoading(false);
                    }
                    return;
                  }
                  if (otp.length !== 6) {
                    setError("Enter the 6-digit code.");
                    return;
                  }
                  setLoading(true);
                  try {
                    await apiFetch("/auth/verify-otp", {
                      method: "POST",
                      body: JSON.stringify({ email, otp }),
                    });
                    window.dispatchEvent(new Event("vexis-auth-changed"));
                    router.push("/dashboard");
                  } catch (err) {
                    setError(
                      err instanceof Error ? err.message : "Verification failed",
                    );
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                {!needsOtp ? (
                  <>
                    <label className="grid gap-2">
                      <span className="text-xs font-semibold tracking-[0.22em] text-muted-foreground">
                        EMAIL
                      </span>
                      <input
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="h-11 rounded-md border border-border bg-white px-4 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                      />
                    </label>
                    <label className="grid gap-2">
                      <span className="text-xs font-semibold tracking-[0.22em] text-muted-foreground">
                        PASSWORD
                      </span>
                      <input
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="h-11 rounded-md border border-border bg-white px-4 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                      />
                    </label>
                  </>
                ) : (
                  <div className="grid gap-2">
                    <label className="grid gap-2">
                      <span className="text-xs font-semibold tracking-[0.22em] text-muted-foreground">
                        SMS CODE
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={otp}
                        onChange={(e) =>
                          setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                        }
                        className="h-11 rounded-md border border-border bg-white px-4 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                      />
                    </label>
                    {devOtpHint ? (
                      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                        SMS bypass: use code {devOtpHint}
                      </div>
                    ) : null}
                  </div>
                )}

                {error ? (
                  <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                  </div>
                ) : null}
                {info ? (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                    {info}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-2 inline-flex h-11 items-center justify-center gap-2 rounded-md bg-accent px-5 text-sm font-semibold text-white shadow-sm transition hover:shadow-md hover:scale-[1.01] disabled:opacity-60 disabled:hover:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                >
                  {loading ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      {needsOtp ? "Verifying…" : "Signing in…"}
                    </>
                  ) : needsOtp ? (
                    "Verify code"
                  ) : (
                    "Sign in"
                  )}
                </button>

                {!needsOtp ? (
                  <div className="mt-2 flex flex-col gap-2 text-xs text-muted-foreground">
                    <div className="flex items-center justify-between">
                      <span>
                        No account?{" "}
                        <Link
                          href="/register"
                          className="text-accent hover:underline"
                        >
                          Create one
                        </Link>
                      </span>
                      <Link href="/contact" className="text-accent hover:underline">
                        Need help?
                      </Link>
                    </div>
                    <button
                      type="button"
                      className="text-left text-accent hover:underline"
                      onClick={async () => {
                        setError(null);
                        if (!emailOk) {
                          setError("Enter your email first.");
                          return;
                        }
                        try {
                          await apiFetch("/auth/forgot-password", {
                            method: "POST",
                            body: JSON.stringify({ email }),
                          });
                          setInfo("If an account exists, a reset link was sent.");
                        } catch (err) {
                          setError(
                            err instanceof Error
                              ? err.message
                              : "Request failed",
                          );
                        }
                      }}
                    >
                      Forgot password?
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="text-xs text-accent hover:underline"
                    onClick={() => {
                      setNeedsOtp(false);
                      setOtp("");
                      setError(null);
                    }}
                  >
                    Use different account
                  </button>
                )}
              </form>
            )}
          </div>
        </div>
      </Container>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div>
          <PageHeader eyebrow="LOGIN" title="Access Vexis." description="Loading…" />
          <Container>
            <div className="py-12 text-sm text-muted-foreground">Loading…</div>
          </Container>
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
