"use client";

import { Container } from "@/components/Container";
import { PageHeader } from "@/components/PageHeader";
import { apiFetch } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function DashboardPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const me = await apiFetch<{ email: string }>("/auth/me");
        setEmail(me.email);
      } catch {
        router.replace("/login");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  return (
    <div>
      <PageHeader
        eyebrow="DASHBOARD"
        title="Signal control center."
        description="Placeholder shell. Auth is wired to the backend."
      />
      <Container>
        <div className="py-12">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div className="text-sm text-muted-foreground">
              {loading ? (
                <div className="flex items-center gap-2">
                  <span className="h-4 w-44 animate-pulse rounded-md bg-foreground/10" />
                </div>
              ) : email ? (
                <span>
                  Signed in as{" "}
                  <span className="font-medium text-foreground">{email}</span>
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
            <div className="lg:col-span-4">
              <div className="rounded-2xl border border-border bg-white p-6 shadow-sm">
                <div className="text-xs font-semibold tracking-[0.22em] text-muted-foreground">
                  SIDEBAR
                </div>
                <div className="mt-5 grid gap-2">
                  {["Placeholder link", "Placeholder link", "Placeholder link"].map(
                    (t, i) => (
                      <div
                        key={`${t}-${i}`}
                        className="rounded-xl border border-border bg-surface px-4 py-3 text-sm font-medium text-muted-foreground"
                      >
                        {t}
                      </div>
                    ),
                  )}
                </div>
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
                        <div className="text-sm text-muted-foreground">
                          Placeholder metric
                        </div>
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
                          Placeholder event
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

