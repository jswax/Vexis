"use client";

import Link from "next/link";
import { Container } from "@/components/Container";
import { PageHeader } from "@/components/PageHeader";
import { apiFetch } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// TODO: replace with the published TradingView script URL once the indicator is live.
const TRADINGVIEW_INDICATOR_URL = "https://www.tradingview.com/";

type Me = {
  email: string;
  tradingview_username: string;
  plan: string;
};

export default function IndicatorPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const [tvUser, setTvUser] = useState("");
  const [tvSaving, setTvSaving] = useState(false);
  const [tvMsg, setTvMsg] = useState<string | null>(null);
  const [tvErr, setTvErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch<Me>("/auth/me");
        setMe(data);
        setTvUser(data.tradingview_username ?? "");
      } catch {
        router.replace("/login");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  if (loading || !me) {
    return (
      <div>
        <PageHeader
          eyebrow="INDICATOR"
          title="Your TradingView indicator."
          description="Loading…"
        />
        <Container>
          <div className="py-12 text-sm text-muted-foreground">Loading…</div>
        </Container>
      </div>
    );
  }

  const hasTvUser = !!me.tradingview_username;

  return (
    <div>
      <PageHeader
        eyebrow="INDICATOR"
        title="Your TradingView indicator."
        description="Access the Vexis Pine indicator on TradingView in three quick steps."
      />
      <Container>
        <div className="grid gap-6 py-12 lg:grid-cols-12">
          <section className="rounded-2xl border border-border bg-white p-6 shadow-sm lg:col-span-7">
            <div className="text-xs font-semibold tracking-[0.22em] text-muted-foreground">
              STEP 1 — OPEN INDICATOR
            </div>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              Open the Vexis indicator on TradingView. You&apos;ll need to be
              logged in to your TradingView account.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <a
                href={TRADINGVIEW_INDICATOR_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center justify-center rounded-full bg-foreground px-5 text-sm font-semibold text-white shadow-sm transition hover:scale-[1.02]"
              >
                Open on TradingView ↗
              </a>
              <span className="break-all rounded-md border border-border bg-surface px-3 py-1.5 font-mono text-xs text-muted-foreground">
                {TRADINGVIEW_INDICATOR_URL}
              </span>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-white p-6 shadow-sm lg:col-span-5">
            <div className="text-xs font-semibold tracking-[0.22em] text-muted-foreground">
              STEP 2 — TRADINGVIEW USERNAME
            </div>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              Tell us your TradingView username so we can add you to the
              invite-only access list.
            </p>
            <form
              className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center"
              onSubmit={async (e) => {
                e.preventDefault();
                setTvErr(null);
                setTvMsg(null);
                setTvSaving(true);
                try {
                  await apiFetch("/auth/profile/tradingview", {
                    method: "POST",
                    body: JSON.stringify({
                      tradingview_username: tvUser.trim() || null,
                    }),
                  });
                  const data = await apiFetch<Me>("/auth/me");
                  setMe(data);
                  setTvMsg("Saved. We'll grant access shortly.");
                } catch (err) {
                  setTvErr(err instanceof Error ? err.message : "Save failed");
                } finally {
                  setTvSaving(false);
                }
              }}
            >
              <input
                type="text"
                placeholder="your_tv_username"
                value={tvUser}
                onChange={(e) => setTvUser(e.target.value)}
                className="h-11 flex-1 rounded-md border border-border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
              <button
                type="submit"
                disabled={tvSaving}
                className="inline-flex h-11 items-center justify-center rounded-full bg-foreground px-5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {tvSaving ? "Saving…" : "Save"}
              </button>
            </form>
            {tvErr ? (
              <div className="mt-2 text-sm text-red-600">{tvErr}</div>
            ) : null}
            {tvMsg ? (
              <div className="mt-2 text-sm text-emerald-700">{tvMsg}</div>
            ) : null}
            {hasTvUser && !tvMsg ? (
              <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                On invite list as
                <span className="font-mono font-medium text-foreground">
                  {me.tradingview_username}
                </span>
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-border bg-white p-6 shadow-sm lg:col-span-12">
            <div className="text-xs font-semibold tracking-[0.22em] text-muted-foreground">
              STEP 3 — USE IT IN A CHART
            </div>
            <ol className="mt-4 grid gap-3 text-sm leading-6 text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
              <li className="rounded-xl border border-border bg-surface p-4">
                <div className="text-xs font-semibold text-foreground">1.</div>
                <div className="mt-1">
                  Open any chart on TradingView and click{" "}
                  <span className="font-medium text-foreground">Indicators</span>.
                </div>
              </li>
              <li className="rounded-xl border border-border bg-surface p-4">
                <div className="text-xs font-semibold text-foreground">2.</div>
                <div className="mt-1">
                  Switch to{" "}
                  <span className="font-medium text-foreground">Invite-only</span>{" "}
                  and search{" "}
                  <span className="font-medium text-foreground">Vexis</span>.
                </div>
              </li>
              <li className="rounded-xl border border-border bg-surface p-4">
                <div className="text-xs font-semibold text-foreground">3.</div>
                <div className="mt-1">
                  Add it to your chart. Tweak inputs in the indicator&apos;s
                  settings panel.
                </div>
              </li>
              <li className="rounded-xl border border-border bg-surface p-4">
                <div className="text-xs font-semibold text-foreground">4.</div>
                <div className="mt-1">
                  Don&apos;t see it yet? Access usually arrives within a few
                  minutes after Step 2.
                </div>
              </li>
            </ol>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/dashboard"
                className="inline-flex h-10 items-center justify-center rounded-full border border-border bg-white px-4 text-sm font-semibold text-foreground transition hover:bg-surface"
              >
                Back to dashboard
              </Link>
              <Link
                href="/contact"
                className="inline-flex h-10 items-center justify-center rounded-full border border-border bg-white px-4 text-sm font-semibold text-foreground transition hover:bg-surface"
              >
                Need help?
              </Link>
            </div>
          </section>
        </div>
      </Container>
    </div>
  );
}
