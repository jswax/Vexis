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

type Tab = "feed" | "ingest" | "compute" | "export";

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const tabs: { id: Tab; label: string }[] = [
    { id: "feed", label: "Feed" },
    { id: "ingest", label: "Ingest" },
    { id: "compute", label: "Compute" },
    { id: "export", label: "Export" },
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
type TweetRow = {
  id: string;
  text: string;
  url: string;
  created_at_twitter: string | null;
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
  features: { spam_score: number | null; credibility_score: number | null } | null;
  qqq?: { score: number; reasons: string[]; allowlisted_source: boolean };
};

// ─── Tweet card ───────────────────────────────────────────────────────────────

const HORIZONS = ["M5", "M15", "H1", "H4", "D1"];

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

  const tickers = [...new Set(tweet.asset_matches.map((m) => m.ticker))];

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

      {/* QQQ signal row */}
      {tweet.qqq && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center rounded-full bg-surface px-2 py-0.5 font-mono text-foreground">
            QQQ score: {tweet.qqq.score.toFixed(2)}
          </span>
          {tweet.qqq.allowlisted_source && (
            <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 font-semibold text-green-700 border border-green-200">
              allowlisted source
            </span>
          )}
        </div>
      )}

      {/* Tweet text */}
      <p className="mt-3 text-sm text-foreground leading-relaxed line-clamp-3">
        {tweet.text}
      </p>

      {/* Asset chips */}
      {tickers.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tickers.map((t) => {
            const m = tweet.asset_matches.find((a) => a.ticker === t)!;
            return (
              <span
                key={t}
                className="inline-flex items-center rounded-full border border-border bg-surface px-2.5 py-0.5 text-xs font-semibold text-foreground"
              >
                {m.asset_type === "CRYPTO" ? "₿ " : "$ "}
                {t}
                <span className="ml-1 text-muted-foreground font-normal">
                  {Math.round(m.confidence * 100)}%
                </span>
              </span>
            );
          })}
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
        {tweet.outcomes.length > 0 && (
          <button
            onClick={() => setExpanded((e) => !e)}
            className="text-muted-foreground hover:text-foreground transition"
          >
            {expanded ? "Hide outcomes ▲" : `Outcomes (${tweet.outcomes.length}) ▼`}
          </button>
        )}
      </div>

      {/* Expanded outcomes table */}
      {expanded && tweet.outcomes.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-1.5 pr-4 font-semibold text-muted-foreground">Ticker</th>
                {HORIZONS.map((h) => (
                  <th key={h} className="text-center py-1.5 px-2 font-semibold text-muted-foreground">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tickers.map((ticker) => {
                const byHorizon = Object.fromEntries(
                  tweet.outcomes
                    .filter((o) => o.ticker === ticker)
                    .map((o) => [o.horizon, o])
                );
                return (
                  <tr key={ticker} className="border-b border-border/50">
                    <td className="py-2 pr-4 font-semibold">{ticker}</td>
                    {HORIZONS.map((h) => {
                      const o = byHorizon[h];
                      return (
                        <td key={h} className="py-2 px-2 text-center">
                          {o ? (
                            <div className="flex flex-col items-center gap-0.5">
                              <DirectionBadge label={o.direction_label} />
                              <span
                                className={`font-mono text-xs ${
                                  (o.raw_return ?? 0) > 0 ? "text-green-600" : (o.raw_return ?? 0) < 0 ? "text-red-600" : "text-gray-500"
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
                );
              })}
            </tbody>
          </table>
        </div>
      )}
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
  const [ticker, setTicker] = useState("");
  const [tickerFilter, setTickerFilter] = useState("");
  const [qqqMode, setQqqMode] = useState(true);
  const [allowlistOnly, setAllowlistOnly] = useState(true);
  const LIMIT = 20;

  const load = useCallback(
    async (reset: boolean) => {
      setLoading(true);
      setError(null);
      const nextOffset = reset ? 0 : offset;
      try {
        const params = new URLSearchParams({ limit: String(LIMIT), offset: String(nextOffset) });
        if (tickerFilter) params.set("ticker", tickerFilter);
        if (qqqMode) params.set("qqq", "1");
        if (allowlistOnly) params.set("allowlist_only", "1");
        const res = await fetch(`/api/twitterai/tweets?${params.toString()}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        const rows: TweetRow[] = data.tweets ?? [];
        setTweets((prev) => (reset ? rows : [...prev, ...rows]));
        setOffset(nextOffset + rows.length);
        setHasMore(rows.length === LIMIT);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    },
    [offset, tickerFilter, qqqMode, allowlistOnly]
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
    setTickerFilter(ticker.toUpperCase().trim());
    setOffset(0);
    setHasMore(true);
    setTweets([]);
    setLoading(true);
    const params = new URLSearchParams({ limit: String(LIMIT), offset: "0" });
    if (ticker.trim()) params.set("ticker", ticker.toUpperCase().trim());
    if (qqqMode) params.set("qqq", "1");
    if (allowlistOnly) params.set("allowlist_only", "1");
    fetch(`/api/twitterai/tweets?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        const rows: TweetRow[] = data.tweets ?? [];
        setTweets(rows);
        setOffset(rows.length);
        setHasMore(rows.length === LIMIT);
        setError(null);
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }

  return (
    <div className="grid gap-4">
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

        <label className="ml-2 flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={qqqMode}
            onChange={(e) => {
              setQqqMode(e.target.checked);
              setOffset(0);
              setTweets([]);
              setHasMore(true);
              // reload with new mode
              setTimeout(() => load(true), 0);
            }}
            className="h-4 w-4 rounded border-border"
          />
          QQQ mode
        </label>

        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={allowlistOnly}
            onChange={(e) => {
              setAllowlistOnly(e.target.checked);
              setOffset(0);
              setTweets([]);
              setHasMore(true);
              setTimeout(() => load(true), 0);
            }}
            className="h-4 w-4 rounded border-border"
            disabled={!qqqMode}
          />
          Allowlist only
        </label>
        {tickerFilter && (
          <button
            onClick={() => {
              setTicker("");
              setTickerFilter("");
              setOffset(0);
              setTweets([]);
              setHasMore(true);
              setLoading(true);
              fetch(`/api/twitterai/tweets?limit=${LIMIT}&offset=0`)
                .then((r) => r.json())
                .then((data) => {
                  const rows: TweetRow[] = data.tweets ?? [];
                  setTweets(rows);
                  setOffset(rows.length);
                  setHasMore(rows.length === LIMIT);
                })
                .catch((err) => setError(String(err)))
                .finally(() => setLoading(false));
            }}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        )}
        <button
          onClick={() => load(true)}
          disabled={loading}
          className="ml-auto text-sm text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          ↺ Refresh
        </button>
      </div>

      <ErrorBox msg={error} />

      {tweets.length === 0 && !loading && (
        <div className="rounded-2xl border border-dashed border-border bg-surface py-16 text-center text-sm text-muted-foreground">
          No tweets yet — run an ingest to populate the feed.
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
    searchTerms: "QQQ, $QQQ, Nasdaq 100, Invesco QQQ, NDX",
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
};

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
  ];
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
            <span className="text-sm font-semibold text-foreground">{value ?? 0}</span>
          </div>
        ))}
      </div>
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
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        search_terms: parseLines(searchTerms),
        max_items: parseInt(maxItems, 10) || 50,
        sort,
      };
      const parsedHandles = parseLines(handles);
      if (parsedHandles.length) body.twitter_handles = parsedHandles;
      if (lang) body.tweet_language = lang;
      if (start) body.start = start;
      if (end) body.end = end;
      if (onlyVerified) body.only_verified_users = true;
      if (minRetweets) body.minimum_retweets = parseInt(minRetweets, 10);
      if (minFavs) body.minimum_favorites = parseInt(minFavs, 10);

      const data = await post("/api/twitterai/ingest", body);
      setResult(data);
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
          <Field label="Max items">
            <input
              type="number"
              className={inputCls}
              value={maxItems}
              min={1}
              max={1000}
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
        </div>

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

  async function run() {
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
      const data = await post("/api/twitterai/compute-outcomes", { limit: parseInt(limit, 10) || 50 });
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
        Fetch price data and compute market outcomes for unprocessed tweets across all horizons (M5, M15, H1, H4, D1).
      </p>
      <div className="flex items-end gap-3">
        <Field label="Limit">
          <input
            type="number"
            className={`${inputCls} w-28`}
            value={limit}
            min={1}
            max={500}
            onChange={(e) => setLimit(e.target.value)}
          />
        </Field>
        <button type="button" disabled={loading} onClick={run} className={btnCls}>
          {loading ? "Running…" : "Run"}
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

  async function run() {
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
      const data = await post("/api/twitterai/recompute-labels", { limit: parseInt(limit, 10) || 500 });
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
        Re-run the vol-adjusted impact scoring on existing outcomes. Use after tuning the impact multiplier.
      </p>
      <div className="flex items-end gap-3">
        <Field label="Limit">
          <input
            type="number"
            className={`${inputCls} w-28`}
            value={limit}
            min={1}
            max={2000}
            onChange={(e) => setLimit(e.target.value)}
          />
        </Field>
        <button type="button" disabled={loading} onClick={run} className={btnCls}>
          {loading ? "Running…" : "Run"}
        </button>
      </div>
      <ErrorBox msg={error} />
      {r && !r.error && (
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Scanned</span>
            <span className="text-sm font-semibold">{String(r.scanned ?? 0)}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Updated</span>
            <span className="text-sm font-semibold">{String(r.updated ?? 0)}</span>
          </div>
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
          {tab === "ingest" && <IngestSection />}
          {tab === "compute" && <ComputeSection />}
          {tab === "export" && <ExportSection />}
        </div>
      </Container>
    </div>
  );
}
