"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Container } from "@/components/Container";
import { PageHeader } from "@/components/PageHeader";
import { apiFetch } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const emailOk = /^\S+@\S+\.\S+$/.test(email);
  const passwordOk = password.length >= 8;

  return (
    <div>
      <PageHeader
        eyebrow="LOGIN"
        title="Access Vexis."
        description="Placeholder copy. Auth is now wired to the backend."
      />
      <Container>
        <div className="py-12">
          <div className="mx-auto w-full max-w-md rounded-2xl border border-border bg-white p-6 shadow-sm">
            <form
              className="grid gap-4"
              onSubmit={async (e) => {
                e.preventDefault();
                setError(null);
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
                  await apiFetch<{ ok: true }>("/auth/login", {
                    method: "POST",
                    body: JSON.stringify({ email, password }),
                  });
                  window.dispatchEvent(new Event("vexis-auth-changed"));
                  router.push("/dashboard");
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Login failed");
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
                  placeholder="placeholder@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 rounded-md border border-border bg-white px-4 text-sm text-foreground placeholder:text-muted-foreground/70 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-xs font-semibold tracking-[0.22em] text-muted-foreground">
                  PASSWORD
                </span>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 rounded-md border border-border bg-white px-4 text-sm text-foreground placeholder:text-muted-foreground/70 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                />
              </label>

              {error ? (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
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
                    Signing in…
                  </>
                ) : (
                  "Sign in"
                )}
              </button>

              <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  No account?{" "}
                  <Link href="/register" className="text-accent hover:underline">
                    Create one
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

