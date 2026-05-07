"use client";

import Link from "next/link";
import { Container } from "@/components/Container";
import { PageHeader } from "@/components/PageHeader";
import { apiFetch } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Me = {
  email: string;
  plan: string;
};

export default function DashboardPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [indicatorKey, setIndicatorKey] = useState<string | null>(null);
  const [keyLoading, setKeyLoading] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch<Me>("/auth/me");
        setMe(data);
        if (data.plan !== "free") {
          setKeyLoading(true);
          try {
            const { key } = await apiFetch<{ key: string }>("/auth/indicator-key");
            setIndicatorKey(key);
          } catch (e) {
            setKeyError(e instanceof Error ? e.message : "Failed to load key");
          } finally {
            setKeyLoading(false);
          }
        }
      } catch {
        router.replace("/login");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const copyKey = useCallback(async () => {
    if (!indicatorKey) return;
    await navigator.clipboard.writeText(indicatorKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [indicatorKey]);

  const regenerateKey = useCallback(async () => {
    setRegenerating(true);
    setKeyError(null);
    try {
      const { key } = await apiFetch<{ key: string }>(
        "/auth/indicator-key/regenerate",
        { method: "POST" },
      );
      setIndicatorKey(key);
      setConfirmRegen(false);
    } catch (e) {
      setKeyError(e instanceof Error ? e.message : "Failed to regenerate key");
    } finally {
      setRegenerating(false);
    }
  }, []);

  const isPaid = me && me.plan !== "free";

  return (
    <div>
      <PageHeader
        eyebrow="DASHBOARD"
        title="Signal control center."
        description="Your workspace for trading signals."
      />
      <Container>
        <div className="py-12">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div className="text-sm text-muted-foreground">
              {loading ? (
                <span className="inline-block h-4 w-44 animate-pulse rounded-md bg-foreground/10" />
              ) : me ? (
                <span>
                  Signed in as{" "}
                  <span className="font-medium text-foreground">{me.email}</span>
                </span>
              ) : null}
            </div>
            <button
              type="button"
              onClick={async () => {
                try {
                  await apiFetch("/auth/logout", { method: "POST" });
                } finally {
                  window.dispatchEvent(new Event("vexis-auth-changed"));
                  router.push("/login");
                }
              }}
              className="inline-flex h-10 items-center justify-center rounded-full border border-border bg-white px-4 text-sm font-semibold text-foreground shadow-sm transition hover:bg-surface hover:shadow"
            >
              Logout
            </button>
          </div>

          <div className="grid gap-6 lg:grid-cols-12">
            {/* Indicator access */}
            <div className="lg:col-span-4">
              <div className="rounded-2xl border border-border bg-white p-6 shadow-sm">
                <div className="text-xs font-semibold tracking-[0.22em] text-muted-foreground">
                  INDICATOR ACCESS
                </div>

                {loading ? (
                  <div className="mt-5 space-y-3">
                    <div className="h-4 w-3/4 animate-pulse rounded-md bg-foreground/10" />
                    <div className="h-10 w-full animate-pulse rounded-xl bg-foreground/10" />
                  </div>
                ) : !isPaid ? (
                  <div className="mt-5">
                    <p className="text-sm leading-6 text-muted-foreground">
                      Upgrade to Standard or Premium to unlock your TradingView
                      indicator access key.
                    </p>
                    <div className="mt-4">
                      <Link
                        href="/pricing"
                        className="inline-flex h-10 w-full items-center justify-center rounded-full bg-foreground px-4 text-sm font-semibold text-white shadow-sm transition hover:scale-[1.02]"
                      >
                        View Plans
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="mt-5">
                    <p className="text-sm text-muted-foreground">
                      Add this key in TradingView when prompted to activate the
                      indicator.
                    </p>

                    <div className="mt-4">
                      {keyLoading ? (
                        <div className="h-10 w-full animate-pulse rounded-xl bg-foreground/10" />
                      ) : keyError ? (
                        <p className="text-sm text-red-600">{keyError}</p>
                      ) : indicatorKey ? (
                        <>
                          <div className="flex items-center gap-2">
                            <input
                              readOnly
                              value={indicatorKey}
                              className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 font-mono text-xs text-foreground focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => void copyKey()}
                              className="shrink-0 inline-flex h-10 items-center justify-center rounded-xl border border-border bg-white px-3 text-xs font-semibold text-foreground transition hover:bg-surface"
                            >
                              {copied ? "Copied!" : "Copy"}
                            </button>
                          </div>

                          <div className="mt-3">
                            {confirmRegen ? (
                              <div className="rounded-xl border border-border bg-surface p-3 text-xs text-muted-foreground">
                                <p>Your old key will stop working immediately.</p>
                                <div className="mt-2 flex gap-2">
                                  <button
                                    type="button"
                                    disabled={regenerating}
                                    onClick={() => void regenerateKey()}
                                    className="inline-flex h-8 items-center justify-center rounded-full bg-foreground px-3 text-xs font-semibold text-white disabled:opacity-60"
                                  >
                                    {regenerating ? "Regenerating…" : "Confirm"}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={regenerating}
                                    onClick={() => setConfirmRegen(false)}
                                    className="inline-flex h-8 items-center justify-center rounded-full border border-border bg-white px-3 text-xs font-semibold text-foreground"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmRegen(true)}
                                className="text-xs text-muted-foreground underline-offset-2 transition hover:text-foreground hover:underline"
                              >
                                Regenerate key
                              </button>
                            )}
                          </div>
                        </>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-span-8">
              <div className="grid gap-6">
                <div className="rounded-2xl border border-border bg-white p-6 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold tracking-[0.22em] text-muted-foreground">
                      OVERVIEW
                    </div>
                    <div className="h-2 w-2 rounded-full bg-accent" />
                  </div>
                  <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div
                        key={i}
                        className="rounded-xl border border-border bg-surface p-4"
                      >
                        <div className="text-sm text-muted-foreground">Metric</div>
                        <div className="mt-2 text-2xl font-semibold text-foreground">
                          —
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-white p-6 shadow-sm">
                  <div className="text-xs font-semibold tracking-[0.22em] text-muted-foreground">
                    ACTIVITY
                  </div>
                  <div className="mt-5 grid gap-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3"
                      >
                        <div className="text-sm font-medium text-muted-foreground">
                          Event
                        </div>
                        <div className="text-xs text-muted-foreground">—</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </div>
  );
}
