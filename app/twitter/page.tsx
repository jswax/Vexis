"use client";

import { Container } from "@/components/Container";
import { PageHeader } from "@/components/PageHeader";
import { useCallback, useEffect, useRef, useState } from "react";

// ─── helpers ──────────────────────────────────────────────────────────────────

function parseLines(s: string): string[] {
  return s
    .split(/[\n,]+/)
    .map((v) => v.trim())
    .filter(Boolean);
}

async function post(path: string, body: unknown) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const d = data as Record<string, unknown> | null;
    const msg = d?.message || d?.error || `HTTP ${res.status}`;
    const details = d?.details || d?.detail;
    const detailStr =
      details && typeof details === "object"
        ? JSON.stringify(details)
        : details
        ? String(details)
        : null;
    throw new Error(detailStr ? `${msg} — ${detailStr}` : String(msg));
  }
  return data;
}

// ─── shared primitives ────────────────────────────────────────────────────────

const inputCls =
  "rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/10";

const btnCls =
  "inline-flex h-10 items-center justify-center rounded-full bg-foreground px-5 text-sm font-semibold text-background shadow-sm transition hover:opacity-80 disabled:opacity-40";

const secondaryBtnCls =
  "inline-flex h-10 items-center justify-center rounded-full border border-border bg-white px-5 text-sm font-semibold text-foreground shadow-sm transition hover:bg-surface disabled:opacity-40";

function SectionCard({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-white p-6 shadow-sm">
      <div className="mb-4 text-xs font-semibold tracking-[0.22em] text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  );
}

function ResultBox({ data }: { data: unknown }) {
  if (data === null) return null;
  return (
    <pre className="mt-4 max-h-64 overflow-auto rounded-xl border border-border bg-surface p-4 text-xs text-foreground whitespace-pre-wrap break-all">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

function LiveLogs({
  lines,
  title = "Live output",
}: {
  lines: string[];
  title?: string;
}) {
  return (
    <div className="mt-4 rounded-xl border border-border bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-semibold text-muted-foreground">{title}</div>
        <div className="text-[11px] text-muted-foreground">
          {lines.length ? `${lines.length} lines` : "—"}
        </div>
      </div>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs text-foreground">
        {lines.length ? lines.join("\n") : "No output yet."}
      </pre>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function ErrorBox({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">
      {msg}
    </p>
  );
}

// ─── Health badge ─────────────────────────────────────────────────────────────

function HealthBadge() {
  const [status, setStatus] = useState<"checking" | "ok" | "down">("checking");

  useEffect(() => {
    fetch("/api/twitterai/health")
      .then((r) => (r.ok ? setStatus("ok") : setStatus("down")))
      .catch(() => setStatus("down"));
  }, []);

  const map = {
    checking: { dot: "bg-amber-400", text: "Connecting…" },
    ok: { dot: "bg-green-500", text: "Service online" },
    down: { dot: "bg-red-500", text: "Service offline" },
  };
  const { dot, text } = map[status];

  return (
    <div className="flex items-center gap-2">
      <span className={`h-2 w-2 rounded-full ${dot} ${status === "checking" ? "animate-pulse" : ""}`} />
      <span className="text-xs font-medium text-muted-foreground">{text}</span>
    </div>
  );
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────

type Tab = "feed" | "status" | "ingest" | "compute" | "export" | "model";

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const tabs: { id: Tab; label: string }[] = [
    { id: "feed", label: "Feed" },
    { id: "status", label: "Status" },
    { id: "ingest", label: "Ingest" },
    { id: "compute", label: "Compute" },
    { id: "export", label: "Export" },
    { id: "model", label: "Model" },
  ];
  return (
    <div className="flex gap-1 rounded-xl border border-border bg-surface p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition ${
            active === t.id
              ? "bg-white shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ─── Direction badge ──────────────────────────────────────────────────────────

function DirectionBadge({ label }: { label: string | null | undefined }) {
  if (!label) return <span className="text-xs text-muted-foreground">—</span>;
  const map: Record<string, string> = {
    BULLISH: "bg-green-100 text-green-700",
    BEARISH: "bg-red-100 text-red-700",
    NEUTRAL: "bg-gray-100 text-gray-600",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${map[label] ?? "bg-gray-100 text-gray-600"}`}>
      {label === "BULLISH" ? "↑ " : label === "BEARISH" ? "↓ " : "→ "}
      {label}
    </span>
  );
}

function ImpactBar({ score }: { score: number | null | undefined }) {
  if (score == null) return <span className="text-xs text-muted-foreground">—</span>;
  const abs = Math.abs(score);
  const color = score > 2 ? "bg-green-500" : score < -2 ? "bg-red-500" : "bg-gray-400";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full bg-border overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${(abs / 10) * 100}%` }} />
      </div>
      <span className={`text-xs font-mono font-semibold ${score > 2 ? "text-green-700" : score < -2 ? "text-red-600" : "text-gray-500"}`}>
        {score > 0 ? "+" : ""}{score}
      </span>
    </div>
  );
}

// ─── Tweet types ──────────────────────────────────────────────────────────────

type AssetMatch = { ticker: string; asset_type: string; confidence: number };
type TweetOutcomeSummary = {
  ticker: string;
  horizon: string;
  direction_label: string | null;
  impact_score: number | null;
  raw_return: number | null;
  excess_return: number | null;
};
type TweetPredictionSummary = {
  ticker: string;
  horizon: string;
  direction_pred: string;
  confidence: number;
  bullish_prob: number;
  bearish_prob: number;
  neutral_prob: number;
  model_version: string;
};
type TweetRow = {
  id: string;
  text: string;
  url: string;
  created_at_twitter: string | null;
  is_in_sample?: boolean;
  like_count: number | null;
  retweet_count: number | null;
  reply_count: number | null;
  view_count: number | null;
  is_retweet: boolean;
  author: {
    username: string;
    display_name: string;
    verified: boolean;
    followers_count: number | null;
  } | null;
  asset_matches: AssetMatch[];
  outcomes: TweetOutcomeSummary[];
  predictions?: TweetPredictionSummary[];
  features: {
    spam_score: number | null;
    credibility_score: number | null;
    model_direction_pred?: string | null;
    model_direction_conf?: number | null;
    model_version?: string | null;
  } | null;
  qqq?: { score: number; reasons: string[]; allowlisted_source: boolean };
};

const QQQ_DISPLAY_ETFS = new Set(["QQQ", "QQQM"]);

/** Feed / eval UI: show only Nasdaq-100 ETF chips for model context; synthesize QQQ when labels are QQQ but the mention was a top holding. */
function qqqModelDisplayMatches(tweet: TweetRow): AssetMatch[] {
  const up = (s: string) => s.toUpperCase();
  const fromApi = tweet.asset_matches.filter((m) => QQQ_DISPLAY_ETFS.has(up(m.ticker)));
  if (fromApi.length > 0) return fromApi;
  const hasQqq =
    (tweet.predictions?.some((p) => up(p.ticker) === "QQQ") ?? false) ||
    tweet.outcomes.some((o) => up(o.ticker) === "QQQ");
  if (hasQqq) return [{ ticker: "QQQ", asset_type: "ETF", confidence: 1 }];
  return [];
}

function tweetHasQqqModelData(tweet: TweetRow): boolean {
  return qqqModelDisplayMatches(tweet).length > 0;
}

// ─── Model prediction badge ───────────────────────────────────────────────────

function ModelPredBadge({
  direction,
  confidence,
}: {
  direction: string | null | undefined;
  confidence?: number | null;
}) {
  if (!direction) return <span className="text-xs text-muted-foreground">—</span>;
  const map: Record<string, string> = {
    BULLISH: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    BEARISH: "bg-rose-50 text-rose-700 border border-rose-200",
    NEUTRAL: "bg-gray-50 text-gray-500 border border-gray-200",
  };
  const icon =
    direction === "BULLISH" ? "↑ " : direction === "BEARISH" ? "↓ " : "→ ";
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold ${map[direction] ?? "bg-gray-50 text-gray-500"}`}
      title={confidence != null ? `Confidence: ${(confidence * 100).toFixed(0)}%` : undefined}
    >
      {icon}
      {direction}
      {confidence != null && (
        <span className="ml-0.5 text-[10px] opacity-70">
          {(confidence * 100).toFixed(0)}%
        </span>
      )}
    </span>
  );
}

// ─── Tweet card ───────────────────────────────────────────────────────────────

const HORIZONS = ["M5", "M15", "M30", "H1", "H4", "H6", "D1"];

function TweetCard({ tweet }: { tweet: TweetRow }) {
  const [expanded, setExpanded] = useState(false);

  const dt = tweet.created_at_twitter
    ? new Date(tweet.created_at_twitter).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const displayMatches = qqqModelDisplayMatches(tweet);

  const bestOutcome = tweet.outcomes.reduce<TweetOutcomeSummary | null>((best, o) => {
    if (!best || Math.abs(o.impact_score ?? 0) > Math.abs(best.impact_score ?? 0)) return o;
    return best;
  }, null);

  function fmtFollowers(n: number | null | undefined) {
    if (!n) return "";
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
    return String(n);
  }

  function fmtReturn(r: number | null | undefined) {
    if (r == null) return "—";
    return `${r >= 0 ? "+" : ""}${(r * 100).toFixed(2)}%`;
  }

  return (
    <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground/8 text-xs font-bold text-foreground">
            {tweet.author?.username?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-foreground truncate">
                {tweet.author?.display_name ?? tweet.author?.username ?? "Unknown"}
              </span>
              {tweet.author?.verified && (
                <span className="text-blue-500 text-xs">✓</span>
              )}
              {tweet.author?.followers_count ? (
                <span className="text-xs text-muted-foreground">
                  {fmtFollowers(tweet.author.followers_count)} followers
                </span>
              ) : null}
            </div>
            <div className="text-xs text-muted-foreground">
              @{tweet.author?.username} {dt ? `· ${dt}` : ""}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {bestOutcome && <DirectionBadge label={bestOutcome.direction_label} />}
          {bestOutcome && <ImpactBar score={bestOutcome.impact_score} />}
        </div>
      </div>

      {/* Signal row: QQQ score + model D1 prediction */}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        {tweet.qqq && (
          <>
            <span className="inline-flex items-center rounded-full bg-surface px-2 py-0.5 font-mono text-foreground">
              QQQ score: {tweet.qqq.score.toFixed(2)}
            </span>
            {tweet.qqq.allowlisted_source && (
              <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 font-semibold text-green-700 border border-green-200">
                allowlisted source
              </span>
            )}
          </>
        )}
        {tweet.features?.model_direction_pred && (() => {
          const pred = tweet.features!.model_direction_pred;
          const d1actual = tweet.outcomes.find((o) => o.horizon === "D1")?.direction_label ?? null;
          const hasActual = d1actual !== null;
          const correct = hasActual ? pred === d1actual : null;
          return (
            <span className="flex items-center gap-1">
              <span className="text-muted-foreground">Model D1:</span>
              <ModelPredBadge
                direction={pred}
                confidence={tweet.features!.model_direction_conf ?? undefined}
              />
              {tweet.is_in_sample ? (
                <span className="text-[10px] text-muted-foreground border border-border rounded-full px-1.5 py-0.5">
                  trained
                </span>
              ) : hasActual ? (
                <span
                  title={`Actual: ${d1actual}`}
                  className={`text-[11px] font-bold rounded-full px-1.5 py-0.5 ${
                    correct
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : "bg-rose-50 text-rose-700 border border-rose-200"
                  }`}
                >
                  {correct ? "✓" : "✗"}
                </span>
              ) : null}
            </span>
          );
        })()}
      </div>

      {/* Tweet text */}
      <p className="mt-3 text-sm text-foreground leading-relaxed line-clamp-3">
        {tweet.text}
      </p>

      {/* Asset chips (QQQ / QQQM only — model predicts QQQ direction) */}
      {displayMatches.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {displayMatches.map((m) => (
            <span
              key={`${m.ticker}-${m.confidence}`}
              className="inline-flex items-center rounded-full border border-border bg-surface px-2.5 py-0.5 text-xs font-semibold text-foreground"
            >
              {m.asset_type === "CRYPTO" ? "₿ " : "$ "}
              {m.ticker}
              <span className="ml-1 text-muted-foreground font-normal">
                {Math.round(m.confidence * 100)}%
              </span>
            </span>
          ))}
        </div>
      )}

      {/* Engagement row */}
      <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
        {tweet.like_count != null && <span>♥ {tweet.like_count.toLocaleString()}</span>}
        {tweet.retweet_count != null && <span>↺ {tweet.retweet_count.toLocaleString()}</span>}
        {tweet.view_count != null && <span>👁 {tweet.view_count.toLocaleString()}</span>}
        {tweet.features?.credibility_score != null && (
          <span>
            Credibility:{" "}
            <span className={tweet.features.credibility_score > 0.6 ? "text-green-600" : tweet.features.credibility_score < 0.3 ? "text-red-500" : "text-foreground"}>
              {Math.round(tweet.features.credibility_score * 100)}%
            </span>
          </span>
        )}
        {tweet.features?.spam_score != null && tweet.features.spam_score > 0.5 && (
          <span className="text-red-500">⚠ spam {Math.round(tweet.features.spam_score * 100)}%</span>
        )}
        <a
          href={tweet.url}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto text-muted-foreground hover:text-foreground transition"
        >
          View →
        </a>
        {tweetHasQqqModelData(tweet) && (
          <button
            onClick={() => setExpanded((e) => !e)}
            className="text-muted-foreground hover:text-foreground transition"
          >
            {expanded
              ? "Hide ▲"
              : tweet.outcomes.filter((o) => o.ticker.toUpperCase() === "QQQ").length > 0
              ? `QQQ outcomes (${tweet.outcomes.filter((o) => o.ticker.toUpperCase() === "QQQ").length}) ▼`
              : `QQQ predictions (${(tweet.predictions ?? []).filter((p) => p.ticker.toUpperCase() === "QQQ").length}) ▼`}
          </button>
        )}
      </div>

      {/* Expanded outcomes + predictions table */}
      {expanded && tweetHasQqqModelData(tweet) && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-1.5 pr-3 font-semibold text-muted-foreground w-28">Ticker</th>
                <th className="text-left py-1.5 pr-3 font-semibold text-muted-foreground w-16">Type</th>
                {HORIZONS.map((h) => (
                  <th key={h} className="text-center py-1.5 px-1.5 font-semibold text-muted-foreground">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...new Set(displayMatches.map((m) => m.ticker))].map((ticker) => {
                const byHorizon = Object.fromEntries(
                  tweet.outcomes
                    .filter((o) => o.ticker === ticker)
                    .map((o) => [o.horizon, o])
                );
                const predsByHorizon = Object.fromEntries(
                  (tweet.predictions ?? [])
                    .filter((p) => p.ticker === ticker)
                    .map((p) => [p.horizon, p])
                );
                const hasPreds = Object.keys(predsByHorizon).length > 0;
                const hasOutcomes = Object.keys(byHorizon).length > 0;
                return (
                  <>
                    {/* Actual outcomes row */}
                    {hasOutcomes && (
                      <tr key={`${ticker}-actual`} className="border-b border-border/40">
                        <td className="py-2 pr-3 font-semibold">{ticker}</td>
                        <td className="py-2 pr-3 text-muted-foreground text-[10px] uppercase tracking-wide">Actual</td>
                        {HORIZONS.map((h) => {
                          const o = byHorizon[h];
                          return (
                            <td key={h} className="py-2 px-1.5 text-center">
                              {o ? (
                                <div className="flex flex-col items-center gap-0.5">
                                  <DirectionBadge label={o.direction_label} />
                                  <span
                                    className={`font-mono text-[10px] ${
                                      (o.raw_return ?? 0) > 0
                                        ? "text-green-600"
                                        : (o.raw_return ?? 0) < 0
                                        ? "text-red-600"
                                        : "text-gray-500"
                                    }`}
                                  >
                                    {fmtReturn(o.raw_return)}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    )}
                    {/* Model predictions row */}
                    {hasPreds && (
                      <tr
                        key={`${ticker}-model`}
                        className="border-b border-border/40 bg-blue-50/30"
                      >
                        <td className="py-2 pr-3 font-semibold text-muted-foreground">
                          {!hasOutcomes ? ticker : ""}
                        </td>
                        <td className="py-2 pr-3 text-[10px] uppercase tracking-wide text-blue-600 font-semibold">
                          Model
                        </td>
                        {HORIZONS.map((h) => {
                          const p = predsByHorizon[h];
                          return (
                            <td key={h} className="py-2 px-1.5 text-center">
                              {p ? (
                                <ModelPredBadge
                                  direction={p.direction_pred}
                                  confidence={p.confidence}
                                />
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Stats table ──────────────────────────────────────────────────────────────

type SectionTotals = {
  uncomputed: number;
  no_match: number;
  impact_1_5: number;
  impact_5_8: number;
  impact_8_10: number;
  predicted: number;
  in_sample: number;
};

function StatsTable({ totals, total }: { totals: SectionTotals | null; total: number | null }) {
  const computed = total != null && totals != null ? total - totals.uncomputed : null;
  const outOfSample = total != null && totals?.in_sample != null ? total - totals.in_sample : null;

  const cols: { label: string; value: number | null; highlight?: string }[] = [
    { label: "Total tweets", value: total },
    { label: "Outcomes computed", value: computed },
    { label: "Needs compute", value: totals?.uncomputed ?? null, highlight: (totals?.uncomputed ?? 0) > 0 ? "text-amber-600" : undefined },
    { label: "No ticker match", value: totals?.no_match ?? null, highlight: (totals?.no_match ?? 0) > 0 ? "text-muted-foreground" : undefined },
    { label: "In training data", value: totals?.in_sample ?? null },
    { label: "Out-of-sample", value: outOfSample },
    { label: "Have predictions", value: totals?.predicted ?? null },
  ];

  return (
    <div className="rounded-xl border border-border bg-white overflow-hidden shadow-sm">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border bg-surface">
            {cols.map((c) => (
              <th key={c.label} className="py-2 px-4 text-left text-xs font-semibold tracking-wide text-muted-foreground whitespace-nowrap">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {cols.map((c) => (
              <td key={c.label} className={`py-3 px-4 text-sm font-semibold ${c.highlight ?? "text-foreground"}`}>
                {c.value == null
                  ? <span className="text-muted-foreground font-normal animate-pulse">—</span>
                  : c.value.toLocaleString()}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ─── Feed section ─────────────────────────────────────────────────────────────

function FeedSection() {
  const [tweets, setTweets] = useState<TweetRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [sectionTotals, setSectionTotals] = useState<SectionTotals | null>(null);
  const [ticker, setTicker] = useState("");
  const [tickerFilter, setTickerFilter] = useState("");
  const [qqqMode, setQqqMode] = useState(false);
  const LIMIT = 50;
  const load = useCallback(
    async (reset: boolean) => {
      setLoading(true);
      setError(null);
      const nextOffset = reset ? 0 : offset;
      try {
        const params = new URLSearchParams({
          limit: String(LIMIT),
          offset: String(nextOffset),
          sort: "recent",
        });
        if (tickerFilter) params.set("ticker", tickerFilter);
        if (qqqMode) params.set("qqq", "1");
        const res = await fetch(`/api/twitterai/tweets?${params.toString()}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        const rows: TweetRow[] = data.tweets ?? [];
        if (typeof data.total === "number" && Number.isFinite(data.total)) setTotal(data.total);
        if (data.section_totals && typeof data.section_totals === "object") {
          setSectionTotals(data.section_totals as SectionTotals);
        }
        setTweets((prev) => (reset ? rows : [...prev, ...rows]));
        setOffset(nextOffset + rows.length);
        setHasMore(rows.length === LIMIT);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    },
    [offset, tickerFilter, qqqMode]
  );

  const initialLoad = useRef(false);
  useEffect(() => {
    if (!initialLoad.current) {
      initialLoad.current = true;
      load(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyFilter() {
    const next = ticker.toUpperCase().trim();
    setTickerFilter(next);
    setOffset(0);
    setHasMore(true);
    setTweets([]);
    setTotal(null);
    setSectionTotals(null);
    setLoading(true);
    const params = new URLSearchParams({ limit: String(LIMIT), offset: "0", sort: "recent" });
    if (next) params.set("ticker", next);
    if (qqqMode) params.set("qqq", "1");
    fetch(`/api/twitterai/tweets?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        const rows: TweetRow[] = data.tweets ?? [];
        setTweets(rows);
        setOffset(rows.length);
        setHasMore(rows.length === LIMIT);
        if (typeof data.total === "number" && Number.isFinite(data.total)) setTotal(data.total);
        if (data.section_totals) setSectionTotals(data.section_totals as SectionTotals);
        setError(null);
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }

  function clearFilter() {
    setTicker("");
    setTickerFilter("");
    setOffset(0);
    setTweets([]);
    setHasMore(true);
    setTotal(null);
    setSectionTotals(null);
    setLoading(true);
    const params = new URLSearchParams({ limit: String(LIMIT), offset: "0", sort: "recent" });
    if (qqqMode) params.set("qqq", "1");
    fetch(`/api/twitterai/tweets?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        const rows: TweetRow[] = data.tweets ?? [];
        setTweets(rows);
        setOffset(rows.length);
        setHasMore(rows.length === LIMIT);
        if (typeof data.total === "number") setTotal(data.total);
        if (data.section_totals) setSectionTotals(data.section_totals as SectionTotals);
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }

  return (
    <div className="grid gap-4">
      <StatsTable totals={sectionTotals} total={total} />

      <div className="flex items-center gap-3">
        <input
          className={`${inputCls} w-40`}
          placeholder="Filter by ticker"
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && applyFilter()}
        />
        <button onClick={applyFilter} className={secondaryBtnCls}>
          Filter
        </button>
        {tickerFilter && (
          <button onClick={clearFilter} className="text-sm text-muted-foreground hover:text-foreground">
            Clear
          </button>
        )}
        <label className="ml-2 flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={qqqMode}
            onChange={(e) => {
              const next = e.target.checked;
              setQqqMode(next);
              setOffset(0);
              setTweets([]);
              setHasMore(true);
              setTotal(null);
              setSectionTotals(null);
              setLoading(true);
              const params = new URLSearchParams({ limit: String(LIMIT), offset: "0", sort: "recent" });
              if (tickerFilter) params.set("ticker", tickerFilter);
              if (next) params.set("qqq", "1");
              fetch(`/api/twitterai/tweets?${params.toString()}`)
                .then((r) => r.json())
                .then((data) => {
                  const rows: TweetRow[] = data.tweets ?? [];
                  setTweets(rows);
                  setOffset(rows.length);
                  setHasMore(rows.length === LIMIT);
                  if (typeof data.total === "number") setTotal(data.total);
                  if (data.section_totals) setSectionTotals(data.section_totals as SectionTotals);
                })
                .catch((err) => setError(String(err)))
                .finally(() => setLoading(false));
            }}
            className="h-4 w-4 rounded border-border"
          />
          QQQ mode
        </label>
        <button
          onClick={() => load(true)}
          disabled={loading}
          className="ml-auto text-sm text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          ↺ Refresh
        </button>
      </div>

      <div className="text-xs text-muted-foreground">
        Showing{" "}
        <span className="font-semibold text-foreground">{tweets.length.toLocaleString()}</span>
        {total != null && (
          <> of <span className="font-semibold text-foreground">{total.toLocaleString()}</span></>
        )}{" "}
        tweets
      </div>

      <ErrorBox msg={error} />

      {tweets.length === 0 && !loading && (
        <div className="rounded-2xl border border-dashed border-border bg-surface py-16 text-center text-sm text-muted-foreground">
          No tweets found — try running an ingest.
        </div>
      )}

      <div className="grid gap-3">
        {tweets.map((t) => (
          <TweetCard key={t.id} tweet={t} />
        ))}
      </div>

      {loading && (
        <div className="flex justify-center py-6">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-foreground" />
        </div>
      )}

      {!loading && hasMore && tweets.length > 0 && (
        <div className="flex justify-center">
          <button onClick={() => load(false)} className={secondaryBtnCls}>
            Load more
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Status section ───────────────────────────────────────────────────────────

type StatusPayload = {
  tweets: number;
  outcomes: number;
  last_outcome_at: string | null;
  last_ingest_job: Record<string, unknown> | null;
};

function StatusSection() {
  const [data, setData] = useState<StatusPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/twitterai/status", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as StatusPayload | null;
      if (!res.ok) throw new Error((json as any)?.error || `HTTP ${res.status}`);
      setData(json);
    } catch (err) {
      setError(String(err));
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SectionCard label="STATUS">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          Quick snapshot of DB counts + last ingest job.
        </div>
        <button onClick={() => load()} disabled={loading} className={secondaryBtnCls}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <ErrorBox msg={error} />

      {data && (
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="text-xs text-muted-foreground">Tweets</div>
            <div className="text-2xl font-semibold">{data.tweets ?? 0}</div>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="text-xs text-muted-foreground">Outcomes</div>
            <div className="text-2xl font-semibold">{data.outcomes ?? 0}</div>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="text-xs text-muted-foreground">Last outcome</div>
            <div className="text-sm font-semibold">
              {data.last_outcome_at ? new Date(data.last_outcome_at).toLocaleString() : "—"}
            </div>
          </div>
        </div>
      )}

      {data?.last_ingest_job && (
        <div className="mt-4">
          <div className="text-xs font-semibold tracking-[0.22em] text-muted-foreground">
            LAST INGEST JOB
          </div>
          <ResultBox data={data.last_ingest_job} />
        </div>
      )}
    </SectionCard>
  );
}

// ─── Ingest section ───────────────────────────────────────────────────────────

type Preset = {
  label: string;
  searchTerms: string;
  handles: string;
  maxItems: string;
  sort: "Latest" | "Top";
  lang: string;
  onlyVerified: boolean;
  minRetweets: string;
  minFavs: string;
};

const PRESETS: Preset[] = [
  {
    label: "QQQ (high-signal)",
    // One OR-query matches DEFAULT_QQQ_SEARCH_TERMS — avoids splitting max_items across many API runs.
    searchTerms: 'QQQ OR $QQQ OR "Invesco QQQ" OR "Nasdaq 100" OR NDX',
    handles: "",
    maxItems: "200",
    sort: "Latest",
    lang: "en",
    onlyVerified: true,
    minRetweets: "",
    minFavs: "",
  },
];

type IngestResult = {
  job_id?: string;
  items_received?: number;
  items_normalized?: number;
  items_skipped?: number;
  tweets_upserted?: number;
  authors_upserted?: number;
  asset_matches_created?: number;
  features_upserted?: number;
  /** Relative to AI/TwitterAI/, written when ingest normalizes ≥1 tweet. */
  scrape_export_relpath?: string;
  /** Absolute path when known (sync ingest). */
  scrape_export_path?: string | null;
};

function ingestPollSleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function IngestResultCard({ data }: { data: unknown }) {
  if (data === null) return null;
  const d = data as Record<string, unknown>;
  if (d.error || !d.job_id) return <ResultBox data={data} />;
  const r = data as IngestResult;
  const stats = [
    { label: "Tweets upserted", value: r.tweets_upserted },
    { label: "Authors upserted", value: r.authors_upserted },
    { label: "Items received", value: r.items_received },
    { label: "Items normalized", value: r.items_normalized },
    { label: "Items skipped", value: r.items_skipped },
    { label: "Asset matches", value: r.asset_matches_created },
    { label: "Features upserted", value: r.features_upserted },
  ].filter(
    (s) => s.value !== undefined && s.value !== null
  );
  return (
    <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs font-semibold text-green-700">Ingest complete</span>
        {r.job_id && (
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-600 font-mono">
            {r.job_id}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
        {stats.map(({ label, value }) => (
          <div key={label} className="flex flex-col">
            <span className="text-xs text-muted-foreground">{label}</span>
            <span className="text-sm font-semibold text-foreground">{value as number}</span>
          </div>
        ))}
      </div>
      {(r.scrape_export_relpath || r.scrape_export_path) ? (
        <p className="mt-3 break-all font-mono text-[11px] text-muted-foreground">
          Tweet + posted time manifest:{" "}
          <span className="text-foreground">
            {r.scrape_export_path ?? r.scrape_export_relpath}
          </span>
        </p>
      ) : null}
      {stats.length === 1 && stats[0]?.label === "Items received" ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Detailed upsert counts are available after synchronous ingest, or in the database / Status
          tab.
        </p>
      ) : null}
    </div>
  );
}

function IngestSection() {
  const [searchTerms, setSearchTerms] = useState(PRESETS[0].searchTerms);
  const [handles, setHandles] = useState(PRESETS[0].handles);
  const [maxItems, setMaxItems] = useState(PRESETS[0].maxItems);
  const [sort, setSort] = useState<"Latest" | "Top">("Latest");
  const [lang, setLang] = useState(PRESETS[0].lang);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [onlyVerified, setOnlyVerified] = useState(PRESETS[0].onlyVerified);
  const [minRetweets, setMinRetweets] = useState("");
  const [minFavs, setMinFavs] = useState("");
  /** Empty = server default (usually 5). 0 = one Apify run (“only today”). */
  const [dateShardDays, setDateShardDays] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  function applyPreset(p: Preset) {
    setSearchTerms(p.searchTerms);
    setHandles(p.handles);
    setMaxItems(p.maxItems);
    setSort(p.sort);
    setLang(p.lang);
    setOnlyVerified(p.onlyVerified);
    setMinRetweets(p.minRetweets);
    setMinFavs(p.minFavs);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    setError(null);
    const maxParsed = parseInt(maxItems, 10);
    const maxItemsN = Number.isFinite(maxParsed) ? maxParsed : 50;
    if (maxItemsN < 1 || maxItemsN > 3000) {
      setError("Max items must be between 1 and 3000.");
      return;
    }
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        search_terms: parseLines(searchTerms),
        max_items: maxItemsN,
        sort,
        background: true,
      };
      const parsedHandles = parseLines(handles);
      if (parsedHandles.length) body.twitter_handles = parsedHandles;
      if (lang) body.tweet_language = lang;
      if (start) body.start = start;
      if (end) body.end = end;
      if (onlyVerified) body.only_verified_users = true;
      if (minRetweets) body.minimum_retweets = parseInt(minRetweets, 10);
      if (minFavs) body.minimum_favorites = parseInt(minFavs, 10);
      if (dateShardDays.trim() !== "") {
        const ds = parseInt(dateShardDays.trim(), 10);
        if (Number.isFinite(ds) && ds >= 0 && ds <= 60) {
          body.date_shard_days = ds;
        }
      }

      const res = await fetch("/api/twitterai/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const raw = await res.json().catch(() => null);
      if (!res.ok) {
        const d = raw as Record<string, unknown> | null;
        const msg = d?.message || d?.error || `HTTP ${res.status}`;
        const details = d?.details || d?.detail;
        const detailStr =
          details && typeof details === "object"
            ? JSON.stringify(details)
            : details
              ? String(details)
              : null;
        throw new Error(detailStr ? `${msg} — ${detailStr}` : String(msg));
      }

      if (res.status === 202) {
        const jobId = String((raw as Record<string, unknown>)?.job_id || "");
        if (!jobId) throw new Error("No job_id in ingest response");
        const POLL_MS = 2000;
        const POLL_MAX = 3600;
        for (let i = 0; i < POLL_MAX; i++) {
          await ingestPollSleep(POLL_MS);
          const stRes = await fetch(
            `/api/twitterai/status?job_id=${encodeURIComponent(jobId)}`
          );
          const st = await stRes.json().catch(() => null);
          const job = st?.last_ingest_job as Record<string, unknown> | null;
          if (!job || String(job.id) !== jobId) continue;
          const stLabel = String(job.status || "");
          if (stLabel !== "SUCCEEDED" && stLabel !== "FAILED") continue;
          if (stLabel === "FAILED") {
            const em = job.error_message ? String(job.error_message) : "Ingest failed";
            setError(em);
            setResult({ job_id: jobId, error: em });
            return;
          }
          const rawReceived = job.items_received;
          if (rawReceived === undefined || rawReceived === null) {
            continue;
          }
          const itemsReceived =
            typeof rawReceived === "number" ? rawReceived : Number(rawReceived);
          const scrapeRelRaw = (raw as Record<string, unknown> | null)?.scrape_export_relpath;
          const scrapeRel =
            typeof scrapeRelRaw === "string" && scrapeRelRaw.trim() ? scrapeRelRaw.trim() : undefined;
          setResult({
            job_id: jobId,
            items_received: Number.isFinite(itemsReceived) ? itemsReceived : undefined,
            ...(scrapeRel ? { scrape_export_relpath: scrapeRel } : {}),
          });
          return;
        }
        setError(
          "Timed out waiting for ingest (job may still be running — open the Status tab to confirm)."
        );
        return;
      }

      setResult(raw);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SectionCard label="INGEST TWEETS">
      <form onSubmit={handleSubmit} className="grid gap-4">
        <div>
          <div className="mb-2 text-xs font-medium text-muted-foreground">PRESETS</div>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p)}
                className="inline-flex h-8 items-center rounded-full border border-border bg-surface px-3 text-xs font-medium text-foreground transition hover:border-foreground/30 hover:bg-foreground/5"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Search terms (one per line or comma-separated)">
            <textarea
              className={`${inputCls} min-h-[80px] resize-y`}
              value={searchTerms}
              onChange={(e) => setSearchTerms(e.target.value)}
              placeholder="e.g. $AAPL, $TSLA"
            />
          </Field>
          <div className="flex items-end justify-between">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="text-xs font-semibold text-muted-foreground hover:text-foreground transition"
            >
              {showAdvanced ? "Hide advanced ▲" : "Show advanced ▼"}
            </button>
            <span className="text-xs text-muted-foreground">
              (Handles optional)
            </span>
          </div>
        </div>

        {showAdvanced && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Twitter handles (optional; one per line or comma-separated)">
              <textarea
                className={`${inputCls} min-h-[80px] resize-y`}
                value={handles}
                onChange={(e) => setHandles(e.target.value)}
                placeholder="e.g. federalreserve, BLS_gov"
              />
            </Field>
            <div className="rounded-xl border border-border bg-surface p-4 text-xs text-muted-foreground">
              Leave handles blank to scrape broadly for QQQ terms. Add handles only
              if you want an allowlist-style scrape from specific accounts.
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Max items (1–3000)">
            <input
              type="number"
              className={inputCls}
              value={maxItems}
              min={1}
              onChange={(e) => setMaxItems(e.target.value)}
            />
          </Field>
          <Field label="Sort">
            <select
              className={inputCls}
              value={sort}
              onChange={(e) => setSort(e.target.value as "Latest" | "Top")}
            >
              <option>Latest</option>
              <option>Top</option>
            </select>
          </Field>
          <Field label="Language">
            <input
              className={inputCls}
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              placeholder="en"
            />
          </Field>
          <Field label="Start date (optional)">
            <input
              type="date"
              className={inputCls}
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </Field>
          <Field label="End date (optional)">
            <input
              type="date"
              className={inputCls}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </Field>
          <Field label="Date shard days">
            <input
              type="number"
              className={inputCls}
              value={dateShardDays}
              min={0}
              max={60}
              onChange={(e) => setDateShardDays(e.target.value)}
              placeholder="default 5"
            />
          </Field>
        </div>
        <p className="-mt-2 text-[11px] text-muted-foreground">
          Shards split <code className="rounded bg-muted px-1">start</code>→<code className="rounded bg-muted px-1">end</code> into N‑day windows (several Apify runs) so results are not all from “right now.” Use{" "}
          <strong>0</strong> for a single fast run (mostly recent tweets only).
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Min retweets">
            <input
              type="number"
              className={inputCls}
              value={minRetweets}
              min={0}
              onChange={(e) => setMinRetweets(e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="Min favorites">
            <input
              type="number"
              className={inputCls}
              value={minFavs}
              min={0}
              onChange={(e) => setMinFavs(e.target.value)}
              placeholder="0"
            />
          </Field>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={onlyVerified}
              onChange={(e) => setOnlyVerified(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            Only verified users
          </label>
        </div>

        <ErrorBox msg={error} />

        <div>
          <button type="submit" disabled={loading} className={btnCls}>
            {loading ? "Running…" : "Run ingest"}
          </button>
        </div>

        <IngestResultCard data={result} />
      </form>
    </SectionCard>
  );
}

// ─── Compute outcomes section ─────────────────────────────────────────────────

function ComputeOutcomesSection() {
  const [limit, setLimit] = useState("50");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const pollRef = useRef<number | null>(null);

  async function fetchLogs() {
    const res = await fetch("/api/twitterai/logs?limit=400");
    const data = await res.json().catch(() => null);
    const next = (data?.lines as string[]) ?? [];
    setLines(next);
  }

  function stopPoll() {
    if (pollRef.current != null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  async function run(allTweets: boolean) {
    setLoading(true);
    setResult(null);
    setError(null);
    setLines([]);
    stopPoll();
    try {
      await fetch("/api/twitterai/logs/clear", { method: "POST" }).catch(() => null);
      await fetchLogs().catch(() => null);
      pollRef.current = window.setInterval(() => {
        fetchLogs().catch(() => null);
      }, 1200);
      const data = await post("/api/twitterai/compute-outcomes", {
        limit: parseInt(limit, 10) || 50,
        qqq_only: true,
        all_tweets: allTweets,
        chunk_size: 80,
      });
      setResult(data);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
      stopPoll();
      await fetchLogs().catch(() => null);
    }
  }

  const r = result as Record<string, unknown> | null;

  return (
    <SectionCard label="COMPUTE OUTCOMES">
      <p className="mb-4 text-sm text-muted-foreground">
        Fetch price data and compute outcomes for every horizon (M5 … D1) for tweets that need them — including{" "}
        <span className="font-semibold">backfill</span> when a tweet already has some horizons but not all (e.g. only M5
        and D1). New rows are merged; existing cells are updated. Already-complete tweets (all 7 horizons for each
        allowed ticker) are skipped — use this to backfill gaps, not to force-refresh everything.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Limit">
          <input
            type="number"
            className={`${inputCls} w-28`}
            value={limit}
            min={1}
            max={500}
            onChange={(e) => setLimit(e.target.value)}
            disabled={loading}
          />
        </Field>
        <button type="button" disabled={loading} onClick={() => run(false)} className={btnCls}>
          {loading ? "Running…" : "Run"}
        </button>
        <button type="button" disabled={loading} onClick={() => run(true)} className={secondaryBtnCls}>
          {loading ? "Running…" : "Compute all"}
        </button>
      </div>
      <ErrorBox msg={error} />
      {r && !r.error && (
        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
          {[
            { label: "Scanned", key: "scanned" },
            { label: "Processed", key: "processed" },
            { label: "Outcomes created", key: "created_outcomes" },
            { label: "Skipped (no asset)", key: "skipped_no_asset" },
            { label: "Errors", key: "errors" },
            { label: "Chunks", key: "chunks_completed" },
          ].map(({ label, key }) => (
            <div key={key} className="flex flex-col">
              <span className="text-xs text-muted-foreground">{label}</span>
              <span className="text-sm font-semibold text-foreground">{String(r[key] ?? 0)}</span>
            </div>
          ))}
        </div>
      )}
      <LiveLogs
        lines={lines}
        title={loading ? "Live output (running…)" : "Live output (last run)"}
      />
      {!loading && result !== null && (
        <div className="mt-4">
          <div className="text-xs font-semibold tracking-[0.22em] text-muted-foreground">
            COMPLETED RESULT
          </div>
          <ResultBox data={result} />
        </div>
      )}
    </SectionCard>
  );
}

function RecomputeLabelsSection() {
  const [limit, setLimit] = useState("500");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const pollRef = useRef<number | null>(null);

  async function fetchLogs() {
    const res = await fetch("/api/twitterai/logs?limit=400");
    const data = await res.json().catch(() => null);
    const next = (data?.lines as string[]) ?? [];
    setLines(next);
  }

  function stopPoll() {
    if (pollRef.current != null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  async function run(allRows: boolean) {
    setLoading(true);
    setResult(null);
    setError(null);
    setLines([]);
    stopPoll();
    try {
      await fetch("/api/twitterai/logs/clear", { method: "POST" }).catch(() => null);
      await fetchLogs().catch(() => null);
      pollRef.current = window.setInterval(() => {
        fetchLogs().catch(() => null);
      }, 1200);
      const body = allRows
        ? { all_rows: true, limit: 500 }
        : { limit: parseInt(limit, 10) || 500 };
      const data = await post("/api/twitterai/recompute-labels", body);
      setResult(data);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
      stopPoll();
      await fetchLogs().catch(() => null);
    }
  }

  const r = result as Record<string, unknown> | null;

  return (
    <SectionCard label="RECOMPUTE LABELS">
      <p className="mb-4 text-sm text-muted-foreground">
        Re-run the vol-adjusted impact scoring on existing outcomes. Use after tuning the impact multiplier.{" "}
        <span className="font-semibold">Recompute all</span> also writes a <code className="text-xs">.jsonl</code> file on
        the TwitterAI server (same line format as Export / <code className="text-xs">data.jsonl</code>), under{" "}
        <code className="text-xs">AI/TwitterAI/exports/</code>. Buttons stay on
        &quot;Running…&quot; until that file is written (after the DB update). Watch live logs for the export line, then
        the result below for the path.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Limit">
          <input
            type="number"
            className={`${inputCls} w-28`}
            value={limit}
            min={1}
            max={2000000}
            onChange={(e) => setLimit(e.target.value)}
            disabled={loading}
          />
        </Field>
        <button type="button" disabled={loading} onClick={() => run(false)} className={btnCls}>
          {loading ? "Running…" : "Run"}
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => run(true)}
          className={secondaryBtnCls}
        >
          {loading ? "Running…" : "Recompute all"}
        </button>
      </div>
      <ErrorBox msg={error} />
      {r && !r.error && (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">Scanned</span>
              <span className="text-sm font-semibold">{String(r.scanned ?? 0)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">Updated</span>
              <span className="text-sm font-semibold">{String(r.updated ?? 0)}</span>
            </div>
          </div>
          {(() => {
            const de = r.diagnostic_export;
            if (de == null || typeof de !== "object") return null;
            const d = de as Record<string, unknown>;
            return (
              <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
                <div className="text-xs font-semibold tracking-wide text-muted-foreground">DIAGNOSTIC EXPORT</div>
                <div className="mt-1 break-all font-mono text-xs text-foreground">
                  {String(d.path ?? "")}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">Rows: {String(d.rows ?? "—")}</div>
              </div>
            );
          })()}
        </div>
      )}
      <LiveLogs
        lines={lines}
        title={loading ? "Live output (running…)" : "Live output (last run)"}
      />
      {!loading && result !== null && (
        <div className="mt-4">
          <div className="text-xs font-semibold tracking-[0.22em] text-muted-foreground">
            COMPLETED RESULT
          </div>
          <ResultBox data={result} />
        </div>
      )}
    </SectionCard>
  );
}

function ComputeSection() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ComputeOutcomesSection />
      <RecomputeLabelsSection />
    </div>
  );
}

// ─── Export section ───────────────────────────────────────────────────────────

function ExportSection() {
  const [outFile, setOutFile] = useState("data.jsonl");
  const [limit, setLimit] = useState("5000");
  const [tickers, setTickers] = useState("");
  const [horizons, setHorizons] = useState("");
  const [maxSpam, setMaxSpam] = useState("0.7");
  const [minCredibility, setMinCredibility] = useState("0.2");
  const [minImpact, setMinImpact] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        out_file: outFile,
        limit: parseInt(limit, 10) || 5000,
      };
      if (maxSpam) body.max_spam_score = parseFloat(maxSpam);
      if (minCredibility) body.min_credibility_score = parseFloat(minCredibility);
      if (tickers) body.tickers = parseLines(tickers).map((t) => t.toUpperCase());
      if (horizons) body.horizons = parseLines(horizons).map((h) => h.toUpperCase());
      if (minImpact) body.min_abs_impact_score = parseInt(minImpact, 10);
      const data = await post("/api/twitterai/export", body);
      setResult(data);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  const r = result as Record<string, unknown> | null;

  return (
    <SectionCard label="EXPORT DATASET">
      <p className="mb-4 text-sm text-muted-foreground">
        Export labeled training data to JSONL on the server. Each row includes tweet text, asset match, and all outcome horizons with impact scores.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Output file path (on server)">
          <input
            className={inputCls}
            value={outFile}
            onChange={(e) => setOutFile(e.target.value)}
            placeholder="data.jsonl"
          />
        </Field>
        <Field label="Row limit">
          <input
            type="number"
            className={inputCls}
            value={limit}
            min={1}
            onChange={(e) => setLimit(e.target.value)}
          />
        </Field>
        <Field label="Filter tickers (comma-separated)">
          <input
            className={inputCls}
            value={tickers}
            onChange={(e) => setTickers(e.target.value)}
            placeholder="TSLA, NVDA"
          />
        </Field>
        <Field label="Filter horizons (comma-separated)">
          <input
            className={inputCls}
            value={horizons}
            onChange={(e) => setHorizons(e.target.value)}
            placeholder="M5, H1, D1"
          />
        </Field>
        <Field label="Max spam score (0–1)">
          <input
            type="number"
            className={inputCls}
            value={maxSpam}
            min={0}
            max={1}
            step={0.05}
            onChange={(e) => setMaxSpam(e.target.value)}
          />
        </Field>
        <Field label="Min credibility score (0–1)">
          <input
            type="number"
            className={inputCls}
            value={minCredibility}
            min={0}
            max={1}
            step={0.05}
            onChange={(e) => setMinCredibility(e.target.value)}
          />
        </Field>
        <Field label="Min |impact score| (0–10)">
          <input
            type="number"
            className={inputCls}
            value={minImpact}
            min={0}
            max={10}
            onChange={(e) => setMinImpact(e.target.value)}
            placeholder="any"
          />
        </Field>
      </div>

      <div className="mt-4">
        <button type="button" disabled={loading || !outFile.trim()} onClick={run} className={btnCls}>
          {loading ? "Exporting…" : "Export to JSONL"}
        </button>
      </div>

      <ErrorBox msg={error} />

      {r && !r.error && (
        <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4">
          <div className="text-xs font-semibold text-green-700 mb-2">Export complete</div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-xs text-muted-foreground">Rows written</span>
              <div className="font-semibold">{String(r.rows ?? 0)}</div>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Output file</span>
              <div className="font-mono text-xs break-all">{String(r.out_file ?? "")}</div>
            </div>
          </div>
        </div>
      )}
      {!!r?.error && <ResultBox data={result} />}
    </SectionCard>
  );
}

// ─── Model section ────────────────────────────────────────────────────────────

type ModelStatus = {
  ready: boolean;
  version?: string | null;
  trained_at?: string | null;
  cv_macro_f1?: number | null;
  cv_weighted_f1?: number | null;
  test_macro_f1?: number | null;
  train_samples?: number | null;
  test_samples?: number | null;
  n_features?: number | null;
  class_distribution?: Record<string, number> | null;
  top_features?: Array<{ feature: string; importance: number }> | null;
  per_horizon?: Record<string, {
    cv_macro_f1: number | null;
    train_samples: number | null;
    class_distribution: Record<string, number> | null;
    top_features: Array<{ feature: string; importance: number }> | null;
  }> | null;
  reason?: string | null;
};

function ModelStatusCard({
  status,
  onRefresh,
  loading,
}: {
  status: ModelStatus | null;
  onRefresh: () => void;
  loading: boolean;
}) {
  return (
    <SectionCard label="MODEL STATUS">
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-sm text-muted-foreground">
          Current LightGBM classifier status — version, CV metrics, and top feature importances.
        </p>
        <button onClick={onRefresh} disabled={loading} className={secondaryBtnCls}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {!status && !loading && (
        <div className="rounded-xl border border-dashed border-border bg-surface py-10 text-center text-sm text-muted-foreground">
          No model loaded — train one below.
        </div>
      )}

      {status && !status.ready && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {status.reason ?? "Model not loaded. Train one below."}
        </div>
      )}

      {status?.ready && (
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-border bg-surface p-4">
              <div className="text-xs text-muted-foreground">Version</div>
              <div className="text-sm font-semibold font-mono truncate">{status.version ?? "—"}</div>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4">
              <div className="text-xs text-muted-foreground">CV Macro-F1</div>
              <div className={`text-xl font-semibold ${(status.cv_macro_f1 ?? 0) >= 0.5 ? "text-green-600" : "text-amber-600"}`}>
                {status.cv_macro_f1 != null ? (status.cv_macro_f1 * 100).toFixed(1) + "%" : "—"}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4">
              <div className="text-xs text-muted-foreground">Test Macro-F1</div>
              <div className={`text-xl font-semibold ${status.test_macro_f1 == null ? "text-muted-foreground" : (status.test_macro_f1 ?? 0) >= 0.5 ? "text-green-600" : "text-amber-600"}`}>
                {status.test_macro_f1 != null ? (status.test_macro_f1 * 100).toFixed(1) + "%" : "—"}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4">
              <div className="text-xs text-muted-foreground">Features / Train rows</div>
              <div className="text-xl font-semibold">{status.n_features ?? "—"}</div>
              {status.train_samples != null && (
                <div className="text-xs text-muted-foreground mt-0.5">{status.train_samples.toLocaleString()} train</div>
              )}
            </div>
          </div>

          {/* Per-horizon CV F1 summary */}
          {status.per_horizon && Object.keys(status.per_horizon).length > 0 && (
            <div>
              <div className="mb-2 text-xs font-semibold tracking-[0.22em] text-muted-foreground">PER-HORIZON CV MACRO-F1</div>
              <div className="flex flex-wrap gap-2">
                {["M5", "M15", "M30", "H1", "H4", "H6", "D1"].map((h) => {
                  const hm = status.per_horizon![h];
                  if (!hm) return null;
                  const f1 = hm.cv_macro_f1;
                  const bearish = hm.class_distribution?.BEARISH ?? 0;
                  return (
                    <div key={h} className="flex flex-col items-center rounded-xl border border-border bg-surface px-3 py-2 min-w-[60px]">
                      <span className="text-[10px] font-semibold tracking-wide text-muted-foreground">{h}</span>
                      <span className={`text-sm font-bold ${f1 == null ? "text-muted-foreground" : f1 >= 0.65 ? "text-green-600" : f1 >= 0.45 ? "text-amber-600" : "text-red-600"}`}>
                        {f1 != null ? (f1 * 100).toFixed(0) + "%" : "—"}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono" title="BEARISH samples in training">
                        ↓{bearish}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {status.trained_at && (
            <div className="text-xs text-muted-foreground">
              Trained {new Date(status.trained_at).toLocaleString()}
            </div>
          )}

          {status.class_distribution && (
            <div>
              <div className="mb-2 text-xs font-semibold tracking-[0.22em] text-muted-foreground">CLASS DISTRIBUTION</div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(status.class_distribution).map(([cls, count]) => (
                  <span
                    key={cls}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                      cls === "BULLISH"
                        ? "bg-green-100 text-green-700"
                        : cls === "BEARISH"
                        ? "bg-red-100 text-red-700"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {cls === "BULLISH" ? "↑" : cls === "BEARISH" ? "↓" : "→"} {cls}
                    <span className="rounded-full bg-white/60 px-1.5 font-mono">{count.toLocaleString()}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {status.top_features && status.top_features.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-semibold tracking-[0.22em] text-muted-foreground">TOP FEATURES</div>
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {status.top_features.map((f, i) => {
                  const maxImp = status.top_features![0].importance;
                  const pct = maxImp > 0 ? (f.importance / maxImp) * 100 : 0;
                  return (
                    <div key={f.feature} className="flex items-center gap-2">
                      <span className="w-5 shrink-0 text-right text-[11px] text-muted-foreground font-mono">{i + 1}.</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="truncate text-xs font-mono text-foreground">{f.feature}</span>
                          <span className="shrink-0 text-[10px] text-muted-foreground">{f.importance.toFixed(0)}</span>
                        </div>
                        <div className="mt-0.5 h-1 w-full rounded-full bg-border overflow-hidden">
                          <div className="h-full rounded-full bg-foreground/50" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}

function TrainCard({ onTrainComplete }: { onTrainComplete: () => void }) {
  const [version, setVersion] = useState("");
  const [minOutcomes, setMinOutcomes] = useState("50");
  const [useTickerOhe, setUseTickerOhe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const pollRef = useRef<number | null>(null);

  async function fetchLogs() {
    const res = await fetch("/api/twitterai/logs?limit=400");
    const data = await res.json().catch(() => null);
    setLines((data?.lines as string[]) ?? []);
  }

  function stopPoll() {
    if (pollRef.current != null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setError(null);
    setLines([]);
    stopPoll();
    try {
      await fetch("/api/twitterai/logs/clear", { method: "POST" }).catch(() => null);
      await fetchLogs().catch(() => null);
      pollRef.current = window.setInterval(() => fetchLogs().catch(() => null), 1500);
      const body: Record<string, unknown> = {
        min_outcomes: parseInt(minOutcomes, 10) || 50,
        use_ticker_ohe: useTickerOhe,
      };
      if (version.trim()) body.version = version.trim();
      const data = await post("/api/twitterai/train", body);
      setResult(data);
      onTrainComplete();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
      stopPoll();
      await fetchLogs().catch(() => null);
    }
  }

  const r = result as Record<string, unknown> | null;

  return (
    <SectionCard label="TRAIN MODEL">
      <p className="mb-4 text-sm text-muted-foreground">
        Train a new LightGBM classifier on all labeled tweet outcomes. Uses StratifiedKFold CV and reports macro-F1.
        Training runs on the server — live logs stream below.
      </p>
      <form onSubmit={run} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Version tag (optional)">
            <input
              className={inputCls}
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="e.g. v2 (auto-assigned if blank)"
              disabled={loading}
            />
          </Field>
          <Field label="Min labeled outcomes required">
            <input
              type="number"
              className={inputCls}
              value={minOutcomes}
              min={1}
              onChange={(e) => setMinOutcomes(e.target.value)}
              disabled={loading}
            />
          </Field>
        </div>
        <div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={useTickerOhe}
              onChange={(e) => setUseTickerOhe(e.target.checked)}
              disabled={loading}
              className="h-4 w-4 rounded border-border"
            />
            Include ticker one-hot features (NVDA, TSLA…)
          </label>
          <p className="mt-1 text-xs text-muted-foreground">
            Uncheck to train without per-ticker identity features — isolates whether text and author signal generalises across market regimes.
          </p>
        </div>
        <ErrorBox msg={error} />
        <div>
          <button type="submit" disabled={loading} className={btnCls}>
            {loading ? "Training…" : "Train"}
          </button>
        </div>
      </form>

      {r && !r.error && (
        <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4">
          <div className="mb-3 text-xs font-semibold text-green-700">Training complete</div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
            {[
              { label: "Version", val: r.model_version ?? r.version },
              { label: "CV Macro-F1", val: r.cv_macro_f1 != null ? `${((r.cv_macro_f1 as number) * 100).toFixed(1)}%` : null },
              { label: "CV Weighted-F1", val: r.cv_weighted_f1 != null ? `${((r.cv_weighted_f1 as number) * 100).toFixed(1)}%` : null },
              { label: "Training rows", val: r.n_samples ?? r.training_rows },
              { label: "Features", val: r.n_features },
              { label: "Folds", val: r.n_folds },
            ].map(({ label, val }) =>
              val != null ? (
                <div key={label} className="flex flex-col">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <span className="text-sm font-semibold text-foreground font-mono">{String(val)}</span>
                </div>
              ) : null
            )}
          </div>
        </div>
      )}

      <LiveLogs lines={lines} title={loading ? "Live output (training…)" : "Live output (last run)"} />

      {!loading && result !== null && (
        <div className="mt-4">
          <div className="text-xs font-semibold tracking-[0.22em] text-muted-foreground">FULL RESULT</div>
          <ResultBox data={result} />
        </div>
      )}
    </SectionCard>
  );
}

function BackfillCard({ onComplete }: { onComplete: () => void }) {
  const [limit, setLimit] = useState("500");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const pollRef = useRef<number | null>(null);

  async function fetchLogs() {
    const res = await fetch("/api/twitterai/logs?limit=400");
    const data = await res.json().catch(() => null);
    setLines((data?.lines as string[]) ?? []);
  }

  function stopPoll() {
    if (pollRef.current != null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  async function run(allTweets: boolean) {
    setLoading(true);
    setResult(null);
    setError(null);
    setLines([]);
    stopPoll();
    try {
      await fetch("/api/twitterai/logs/clear", { method: "POST" }).catch(() => null);
      await fetchLogs().catch(() => null);
      pollRef.current = window.setInterval(() => fetchLogs().catch(() => null), 1500);
      const data = await post("/api/twitterai/backfill-predictions", {
        limit: parseInt(limit, 10) || 500,
        all_tweets: allTweets,
      });
      setResult(data);
      onComplete();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
      stopPoll();
      await fetchLogs().catch(() => null);
    }
  }

  const r = result as Record<string, unknown> | null;

  return (
    <SectionCard label="BACKFILL PREDICTIONS">
      <p className="mb-4 text-sm text-muted-foreground">
        Run the current model on all tweets that have asset matches but no predictions stored yet.
        New predictions are upserted per-ticker per-horizon. The D1 summary is also written to{" "}
        <code className="text-xs">tweet_features</code>.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Limit">
          <input
            type="number"
            className={`${inputCls} w-28`}
            value={limit}
            min={1}
            max={100000}
            onChange={(e) => setLimit(e.target.value)}
            disabled={loading}
          />
        </Field>
        <button type="button" disabled={loading} onClick={() => run(false)} className={btnCls}>
          {loading ? "Running…" : "Backfill"}
        </button>
        <button type="button" disabled={loading} onClick={() => run(true)} className={secondaryBtnCls}>
          {loading ? "Running…" : "Backfill all"}
        </button>
      </div>
      <ErrorBox msg={error} />

      {r && !r.error && (
        <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4">
          <div className="mb-3 text-xs font-semibold text-green-700">Backfill complete</div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
            {[
              { label: "Tweets processed", val: r.processed },
              { label: "Predictions created", val: r.predictions_created },
              { label: "Model version", val: r.model_version },
            ].map(({ label, val }) =>
              val != null ? (
                <div key={label} className="flex flex-col">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <span className="text-sm font-semibold text-foreground">{String(val)}</span>
                </div>
              ) : null
            )}
          </div>
        </div>
      )}

      <LiveLogs lines={lines} title={loading ? "Live output (running…)" : "Live output (last run)"} />

      {!loading && result !== null && (
        <div className="mt-4">
          <div className="text-xs font-semibold tracking-[0.22em] text-muted-foreground">FULL RESULT</div>
          <ResultBox data={result} />
        </div>
      )}
    </SectionCard>
  );
}

// ─── Test evaluation section ──────────────────────────────────────────────────

const EVAL_HORIZONS = ["M5", "M15", "M30", "H1", "H4", "H6", "D1"];

function fmtEvalReturn(r: number | null | undefined) {
  if (r == null || !Number.isFinite(r)) return null;
  const pct = r * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

function HorizonCell({
  pred,
  actual,
  actualReturn,
}: {
  pred: string | undefined;
  actual: string | null | undefined;
  actualReturn?: number | null;
}) {
  const hasPred = pred != null && pred !== "";
  const hasActual = actual != null;
  const correct = hasPred && hasActual ? pred === actual : null;
  const predColor =
    pred === "BULLISH"
      ? "text-green-700"
      : pred === "BEARISH"
      ? "text-red-600"
      : pred
      ? "text-gray-500"
      : "text-muted-foreground";
  const predIcon =
    pred === "BULLISH" ? "↑" : pred === "BEARISH" ? "↓" : pred ? "→" : "";
  const actualColor =
    actual === "BULLISH"
      ? "text-green-700"
      : actual === "BEARISH"
      ? "text-red-600"
      : actual
      ? "text-gray-500"
      : "";
  const actualIcon =
    actual === "BULLISH" ? "↑" : actual === "BEARISH" ? "↓" : actual ? "→" : "";
  const retStr = fmtEvalReturn(actualReturn);
  return (
    <td className="py-2 px-1 text-center">
      <div className="flex flex-col items-center gap-0.5">
        {hasPred ? (
          <span className={`text-xs font-semibold ${predColor}`}>
            {predIcon} {pred.slice(0, 4)}
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground">no pred</span>
        )}
        {hasActual ? (
          <>
            <span className={`text-[10px] ${actualColor}`}>
              {actualIcon} {actual!.slice(0, 4)}
              {retStr != null && (
                <span className="ml-0.5 font-mono text-muted-foreground">{retStr}</span>
              )}
            </span>
            {correct != null ? (
              <span
                className={`text-[10px] font-bold rounded-full px-1 ${
                  correct
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-rose-50 text-rose-700"
                }`}
              >
                {correct ? "✓" : "✗"}
              </span>
            ) : (
              <span className="text-[10px] text-muted-foreground">—</span>
            )}
          </>
        ) : (
          <span className="text-[10px] text-muted-foreground">no outcome</span>
        )}
      </div>
    </td>
  );
}

type TestEvalByHorizon = Record<string, { correct: number; total: number }>;

function TestEvalSection() {
  const [tweets, setTweets] = useState<TweetRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  /** Full test-set counts from API (all tweets past train cutoff), not just the current page */
  const [serverEvalByHorizon, setServerEvalByHorizon] = useState<TestEvalByHorizon | null>(null);
  const LIMIT = 20;

  async function load(reset: boolean) {
    setLoading(true);
    setError(null);
    const nextOffset = reset ? 0 : offset;
    try {
      const params = new URLSearchParams({
        limit: String(LIMIT),
        offset: String(nextOffset),
        test_only: "1",
      });
      const res = await fetch(`/api/twitterai/tweets?${params.toString()}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      const rows: TweetRow[] = data.tweets ?? [];
      if (typeof data.total === "number") setTotal(data.total);
      const te = data.test_eval_by_horizon as TestEvalByHorizon | undefined;
      if (te && typeof te === "object") setServerEvalByHorizon(te);
      setTweets((prev) => (reset ? rows : [...prev, ...rows]));
      setOffset(nextOffset + rows.length);
      setHasMore(rows.length === LIMIT);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  const didLoad = useRef(false);
  useEffect(() => {
    if (!didLoad.current) {
      didLoad.current = true;
      load(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Client-side fallback if API omits test_eval_by_horizon (older TwitterAI build)
  const clientStats: TestEvalByHorizon = {};
  for (const h of EVAL_HORIZONS) {
    clientStats[h] = { correct: 0, total: 0 };
  }
  for (const tweet of tweets) {
    const ticker = "QQQ";
    const predsByH = Object.fromEntries(
      (tweet.predictions ?? []).filter((p) => p.ticker === ticker).map((p) => [p.horizon, p])
    );
    const actualByH = Object.fromEntries(
      tweet.outcomes.filter((o) => o.ticker === ticker).map((o) => [o.horizon, o])
    );
    for (const h of EVAL_HORIZONS) {
      const pred = predsByH[h]?.direction_pred;
      const actual = actualByH[h]?.direction_label;
      if (pred && actual) {
        clientStats[h].total++;
        if (pred === actual) clientStats[h].correct++;
      }
    }
  }

  const stats: TestEvalByHorizon =
    serverEvalByHorizon ??
    clientStats;

  return (
    <SectionCard label="TEST SET EVALUATION">
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-sm text-muted-foreground">
          Out-of-sample tweets (same temporal cutoff as training: newest ~20% by post time). The horizon tiles count <span className="font-semibold text-foreground">every</span> test tweet with both a QQQ prediction and outcome for that horizon (not just the rows below). The table loads {LIMIT} tweets per page.
        </p>
        <button onClick={() => load(true)} disabled={loading} className={secondaryBtnCls}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {/* Accuracy summary — full test set from API when available */}
      {(serverEvalByHorizon != null || tweets.length > 0) && (
        <div className="mb-4 flex flex-wrap gap-2">
          {EVAL_HORIZONS.map((h) => {
            const s = stats[h] ?? { correct: 0, total: 0 };
            const acc = s.total > 0 ? (s.correct / s.total) * 100 : null;
            return (
              <div
                key={h}
                className="flex flex-col items-center rounded-xl border border-border bg-surface px-3 py-2 min-w-[56px]"
              >
                <span className="text-[10px] font-semibold tracking-wide text-muted-foreground">{h}</span>
                <span
                  className={`text-sm font-bold ${
                    acc == null
                      ? "text-muted-foreground"
                      : acc >= 60
                      ? "text-green-600"
                      : acc >= 45
                      ? "text-amber-600"
                      : "text-red-600"
                  }`}
                >
                  {acc != null ? `${acc.toFixed(0)}%` : "—"}
                </span>
                {s.total > 0 && (
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {s.correct}/{s.total}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ErrorBox msg={error} />

      {!loading && tweets.length === 0 && !error && (
        <div className="rounded-xl border border-dashed border-border bg-surface py-12 text-center text-sm text-muted-foreground">
          No out-of-sample tweets found. Train a model first, then run backfill-predictions.
        </div>
      )}

      {tweets.length > 0 && (
        <div className="overflow-x-auto">
          <div className="mb-2 text-xs text-muted-foreground">
            Showing <span className="font-semibold text-foreground">{tweets.length}</span>
            {total != null && (
              <> / <span className="font-semibold text-foreground">{total}</span></>
            )}{" "}
            test tweets.
          </div>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-4 font-semibold text-muted-foreground w-56">Tweet</th>
                <th className="text-left py-2 pr-2 font-semibold text-muted-foreground w-16">Ticker</th>
                {EVAL_HORIZONS.map((h) => (
                  <th key={h} className="text-center py-2 px-1 font-semibold text-muted-foreground w-16">
                    {h}
                  </th>
                ))}
              </tr>
              <tr className="border-b border-border/40 bg-surface/50">
                <td colSpan={2} className="py-1 pr-2 text-[10px] text-muted-foreground">Legend</td>
                <td colSpan={EVAL_HORIZONS.length} className="py-1 text-[10px] text-muted-foreground">
                  Pred · actual + return · ✓/✗ (only when pred and outcome both exist)
                </td>
              </tr>
            </thead>
            <tbody>
              {tweets.map((tweet) => {
                const tickers = ["QQQ"];
                return tickers.map((ticker, ti) => {
                  const predsByH = Object.fromEntries(
                    (tweet.predictions ?? [])
                      .filter((p) => p.ticker === ticker)
                      .map((p) => [p.horizon, p])
                  );
                  const actualByH = Object.fromEntries(
                    tweet.outcomes
                      .filter((o) => o.ticker === ticker)
                      .map((o) => [o.horizon, o])
                  );
                  return (
                    <tr
                      key={`${tweet.id}-${ticker}`}
                      className={`border-b border-border/30 ${ti > 0 ? "bg-surface/30" : ""}`}
                    >
                      {ti === 0 ? (
                        <td
                          rowSpan={tickers.length}
                          className="py-2 pr-4 align-top"
                        >
                          <div className="font-semibold text-foreground truncate max-w-[220px]">
                            @{tweet.author?.username ?? "?"}
                          </div>
                          <div className="text-muted-foreground line-clamp-2 max-w-[220px] leading-relaxed">
                            {tweet.text}
                          </div>
                          {tweet.created_at_twitter && (
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              {new Date(tweet.created_at_twitter).toLocaleDateString()}
                            </div>
                          )}
                        </td>
                      ) : null}
                      <td className="py-2 pr-2 font-mono font-semibold text-foreground align-middle">
                        {ticker}
                      </td>
                      {EVAL_HORIZONS.map((h) => (
                        <HorizonCell
                          key={h}
                          pred={predsByH[h]?.direction_pred}
                          actual={actualByH[h]?.direction_label}
                          actualReturn={actualByH[h]?.raw_return}
                        />
                      ))}
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-6">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-foreground" />
        </div>
      )}

      {!loading && hasMore && tweets.length > 0 && (
        <div className="mt-4 flex justify-center">
          <button onClick={() => load(false)} className={secondaryBtnCls}>
            Load more
          </button>
        </div>
      )}
    </SectionCard>
  );
}

function ModelSection() {
  const [status, setStatus] = useState<ModelStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  async function loadStatus() {
    setStatusLoading(true);
    try {
      const res = await fetch("/api/twitterai/model-status");
      const data = (await res.json().catch(() => null)) as ModelStatus | null;
      setStatus(data);
    } catch {
      setStatus(null);
    } finally {
      setStatusLoading(false);
    }
  }

  useEffect(() => {
    loadStatus().catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="grid gap-6">
      <ModelStatusCard status={status} onRefresh={loadStatus} loading={statusLoading} />
      <div className="grid gap-6 lg:grid-cols-2">
        <TrainCard onTrainComplete={loadStatus} />
        <BackfillCard onComplete={loadStatus} />
      </div>
      <TestEvalSection />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TwitterPage() {
  const [tab, setTab] = useState<Tab>("feed");

  return (
    <div>
      <PageHeader
        eyebrow="TWITTER AI"
        title="Tweet pipeline."
        description="Ingest market tweets, compute multi-horizon price outcomes, and export labeled training data."
      >
        <HealthBadge />
      </PageHeader>
      <Container>
        <div className="py-8 grid gap-6">
          <TabBar active={tab} onChange={setTab} />

          {tab === "feed" && <FeedSection />}
          {tab === "status" && <StatusSection />}
          {tab === "ingest" && <IngestSection />}
          {tab === "compute" && <ComputeSection />}
          {tab === "export" && <ExportSection />}
          {tab === "model" && <ModelSection />}
        </div>
      </Container>
    </div>
  );
}
