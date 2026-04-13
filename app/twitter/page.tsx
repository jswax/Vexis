"use client";

import { Container } from "@/components/Container";
import { PageHeader } from "@/components/PageHeader";
import { useState } from "react";

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
    const details = d?.details;
    const detailStr =
      details && typeof details === "object"
        ? (details as Record<string, unknown>).error ||
          JSON.stringify(details)
        : null;
    throw new Error(detailStr ? `${msg} — ${detailStr}` : String(msg));
  }
  return data;
}

// ─── sub-components ───────────────────────────────────────────────────────────

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

type IngestResult = {
  jobId?: string;
  itemsReceived?: number;
  itemsNormalized?: number;
  itemsSkipped?: number;
  tweetsUpserted?: number;
  authorsUpserted?: number;
  assetMatchesCreated?: number;
  featuresUpserted?: number;
};

function IngestResultCard({ data }: { data: unknown }) {
  if (data === null) return null;
  const d = data as Record<string, unknown>;
  // If it looks like an error, fall back to raw JSON
  if (d.error || !d.jobId) {
    return <ResultBox data={data} />;
  }
  const r = data as IngestResult;
  const stats: { label: string; value: number | string | undefined }[] = [
    { label: "Tweets upserted", value: r.tweetsUpserted },
    { label: "Authors upserted", value: r.authorsUpserted },
    { label: "Items received", value: r.itemsReceived },
    { label: "Items normalized", value: r.itemsNormalized },
    { label: "Items skipped", value: r.itemsSkipped },
    { label: "Asset matches", value: r.assetMatchesCreated },
    { label: "Features upserted", value: r.featuresUpserted },
  ];
  return (
    <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs font-semibold text-green-700">Ingest complete</span>
        {r.jobId && (
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-600 font-mono">
            {r.jobId}
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

const inputCls =
  "rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/10";

const btnCls =
  "inline-flex h-10 items-center justify-center rounded-full bg-foreground px-5 text-sm font-semibold text-background shadow-sm transition hover:opacity-80 disabled:opacity-40";

const secondaryBtnCls =
  "inline-flex h-10 items-center justify-center rounded-full border border-border bg-white px-5 text-sm font-semibold text-foreground shadow-sm transition hover:bg-surface disabled:opacity-40";

// ─── Presets ──────────────────────────────────────────────────────────────────

type Preset = {
  label: string;
  searchTerms: string;
  handles: string;
  startUrls: string;
  conversationIds: string;
  maxItems: string;
  sort: "Latest" | "Top" | "Latest + Top";
  lang: string;
  onlyVerified: boolean;
  onlyBlue: boolean;
  minRetweets: string;
  minFavs: string;
  minReplies: string;
};

const PRESETS: Preset[] = [
  {
    label: "Mega-cap Tech",
    searchTerms: "$AAPL, $MSFT, $GOOGL, $AMZN, $META",
    handles: "",
    startUrls: "",
    conversationIds: "",
    maxItems: "100",
    sort: "Latest",
    lang: "en",
    onlyVerified: false,
    onlyBlue: false,
    minRetweets: "",
    minFavs: "",
    minReplies: "",
  },
  {
    label: "Crypto Big 3",
    searchTerms: "$BTC, $ETH, $SOL, bitcoin, ethereum",
    handles: "",
    startUrls: "",
    conversationIds: "",
    maxItems: "150",
    sort: "Latest",
    lang: "en",
    onlyVerified: false,
    onlyBlue: false,
    minRetweets: "",
    minFavs: "",
    minReplies: "",
  },
  {
    label: "AI / Nvidia Wave",
    searchTerms: "$NVDA, $AMD, $INTC, artificial intelligence, AI chips",
    handles: "",
    startUrls: "",
    conversationIds: "",
    maxItems: "100",
    sort: "Latest",
    lang: "en",
    onlyVerified: false,
    onlyBlue: false,
    minRetweets: "",
    minFavs: "",
    minReplies: "",
  },
  {
    label: "Finance Influencers",
    searchTerms: "",
    handles: "jimcramer, chamath, naval, unusual_whales, zerohedge",
    startUrls: "",
    conversationIds: "",
    maxItems: "100",
    sort: "Latest",
    lang: "en",
    onlyVerified: true,
    onlyBlue: false,
    minRetweets: "",
    minFavs: "",
    minReplies: "",
  },
  {
    label: "Meme Stocks",
    searchTerms: "$GME, $AMC, $BBBY, $MSTR, short squeeze",
    handles: "",
    startUrls: "",
    conversationIds: "",
    maxItems: "100",
    sort: "Top",
    lang: "en",
    onlyVerified: false,
    onlyBlue: false,
    minRetweets: "5",
    minFavs: "20",
    minReplies: "",
  },
  {
    label: "EV & Energy",
    searchTerms: "$TSLA, $RIVN, $LCID, $NIO, electric vehicle, EV",
    handles: "",
    startUrls: "",
    conversationIds: "",
    maxItems: "100",
    sort: "Latest",
    lang: "en",
    onlyVerified: false,
    onlyBlue: false,
    minRetweets: "",
    minFavs: "",
    minReplies: "",
  },
  {
    label: "Macro & Fed",
    searchTerms: "Federal Reserve, interest rates, inflation, CPI, FOMC, Jerome Powell",
    handles: "",
    startUrls: "",
    conversationIds: "",
    maxItems: "100",
    sort: "Latest",
    lang: "en",
    onlyVerified: true,
    onlyBlue: false,
    minRetweets: "",
    minFavs: "10",
    minReplies: "",
  },
  {
    label: "Earnings Season",
    searchTerms: "earnings beat, earnings miss, EPS, revenue guidance, quarterly results",
    handles: "",
    startUrls: "",
    conversationIds: "",
    maxItems: "200",
    sort: "Latest + Top",
    lang: "en",
    onlyVerified: false,
    onlyBlue: false,
    minRetweets: "",
    minFavs: "",
    minReplies: "",
  },
  {
    label: "SPY & Index",
    searchTerms: "$SPY, $QQQ, $IWM, S&P 500, Nasdaq, market crash, bull market, bear market",
    handles: "",
    startUrls: "",
    conversationIds: "",
    maxItems: "100",
    sort: "Latest",
    lang: "en",
    onlyVerified: false,
    onlyBlue: false,
    minRetweets: "",
    minFavs: "",
    minReplies: "",
  },
  {
    label: "High-Signal Only",
    searchTerms: "$AAPL, $MSFT, $TSLA, $NVDA, $AMZN",
    handles: "",
    startUrls: "",
    conversationIds: "",
    maxItems: "50",
    sort: "Top",
    lang: "en",
    onlyVerified: true,
    onlyBlue: false,
    minRetweets: "10",
    minFavs: "50",
    minReplies: "5",
  },
];

// ─── Ingest section ───────────────────────────────────────────────────────────

function IngestSection() {
  const [searchTerms, setSearchTerms] = useState("");
  const [handles, setHandles] = useState("");
  const [startUrls, setStartUrls] = useState("");
  const [conversationIds, setConversationIds] = useState("");
  const [maxItems, setMaxItems] = useState("50");
  const [sort, setSort] = useState<"Latest" | "Top" | "Latest + Top">("Latest");
  const [lang, setLang] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [onlyVerified, setOnlyVerified] = useState(false);
  const [onlyBlue, setOnlyBlue] = useState(false);
  const [minRetweets, setMinRetweets] = useState("");
  const [minFavs, setMinFavs] = useState("");
  const [minReplies, setMinReplies] = useState("");

  function applyPreset(p: Preset) {
    setSearchTerms(p.searchTerms);
    setHandles(p.handles);
    setStartUrls(p.startUrls);
    setConversationIds(p.conversationIds);
    setMaxItems(p.maxItems);
    setSort(p.sort);
    setLang(p.lang);
    setOnlyVerified(p.onlyVerified);
    setOnlyBlue(p.onlyBlue);
    setMinRetweets(p.minRetweets);
    setMinFavs(p.minFavs);
    setMinReplies(p.minReplies);
  }

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        searchTerms: parseLines(searchTerms),
        twitterHandles: parseLines(handles),
        startUrls: parseLines(startUrls),
        conversationIds: parseLines(conversationIds),
        maxItems: parseInt(maxItems, 10) || 50,
        sort,
      };
      if (lang) body.tweetLanguage = lang;
      if (start) body.start = start;
      if (end) body.end = end;
      if (onlyVerified) body.onlyVerifiedUsers = true;
      if (onlyBlue) body.onlyTwitterBlue = true;
      if (minRetweets) body.minimumRetweets = parseInt(minRetweets, 10);
      if (minFavs) body.minimumFavorites = parseInt(minFavs, 10);
      if (minReplies) body.minimumReplies = parseInt(minReplies, 10);

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
          <Field label="Twitter handles (one per line or comma-separated)">
            <textarea
              className={`${inputCls} min-h-[80px] resize-y`}
              value={handles}
              onChange={(e) => setHandles(e.target.value)}
              placeholder="e.g. elonmusk"
            />
          </Field>
          <Field label="Start URLs">
            <textarea
              className={`${inputCls} min-h-[60px] resize-y`}
              value={startUrls}
              onChange={(e) => setStartUrls(e.target.value)}
              placeholder="https://twitter.com/..."
            />
          </Field>
          <Field label="Conversation IDs">
            <textarea
              className={`${inputCls} min-h-[60px] resize-y`}
              value={conversationIds}
              onChange={(e) => setConversationIds(e.target.value)}
              placeholder="Tweet IDs..."
            />
          </Field>
        </div>

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
              onChange={(e) =>
                setSort(e.target.value as "Latest" | "Top" | "Latest + Top")
              }
            >
              <option>Latest</option>
              <option>Top</option>
              <option>Latest + Top</option>
            </select>
          </Field>
          <Field label="Language (optional)">
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

        <div className="grid gap-4 sm:grid-cols-3">
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
          <Field label="Min replies">
            <input
              type="number"
              className={inputCls}
              value={minReplies}
              min={0}
              onChange={(e) => setMinReplies(e.target.value)}
              placeholder="0"
            />
          </Field>
        </div>

        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={onlyVerified}
              onChange={(e) => setOnlyVerified(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            Only verified users
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={onlyBlue}
              onChange={(e) => setOnlyBlue(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            Only Twitter Blue
          </label>
        </div>

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">
            {error}
          </p>
        )}

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
  const [limit, setLimit] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      if (limit) body.limit = parseInt(limit, 10);
      const data = await post("/api/twitterai/compute-outcomes", body);
      setResult(data);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SectionCard label="COMPUTE OUTCOMES">
      <p className="mb-4 text-sm text-muted-foreground">
        Compute market outcomes for all unprocessed tweets.
      </p>
      <div className="flex items-end gap-3">
        <Field label="Limit (optional, max 500)">
          <input
            type="number"
            className={inputCls}
            value={limit}
            min={1}
            max={500}
            onChange={(e) => setLimit(e.target.value)}
            placeholder="no limit"
          />
        </Field>
        <button
          type="button"
          disabled={loading}
          onClick={run}
          className={btnCls}
        >
          {loading ? "Running…" : "Run"}
        </button>
      </div>
      {error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">
          {error}
        </p>
      )}
      <ResultBox data={result} />
    </SectionCard>
  );
}

// ─── Recompute labels section ─────────────────────────────────────────────────

function RecomputeLabelsSection() {
  const [limit, setLimit] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      if (limit) body.limit = parseInt(limit, 10);
      const data = await post("/api/twitterai/recompute-labels", body);
      setResult(data);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SectionCard label="RECOMPUTE LABELS">
      <p className="mb-4 text-sm text-muted-foreground">
        Re-run the labeling pipeline on existing tweets.
      </p>
      <div className="flex items-end gap-3">
        <Field label="Limit (optional, max 2000)">
          <input
            type="number"
            className={inputCls}
            value={limit}
            min={1}
            max={2000}
            onChange={(e) => setLimit(e.target.value)}
            placeholder="no limit"
          />
        </Field>
        <button
          type="button"
          disabled={loading}
          onClick={run}
          className={btnCls}
        >
          {loading ? "Running…" : "Run"}
        </button>
      </div>
      {error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">
          {error}
        </p>
      )}
      <ResultBox data={result} />
    </SectionCard>
  );
}

// ─── Tweet lookup section ─────────────────────────────────────────────────────

function TweetLookupSection() {
  const [tweetId, setTweetId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  async function lookup() {
    if (!tweetId.trim()) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch(
        `/api/twitterai/tweet/${encodeURIComponent(tweetId.trim())}`
      );
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SectionCard label="TWEET LOOKUP">
      <p className="mb-4 text-sm text-muted-foreground">
        Fetch a stored tweet by its internal ID.
      </p>
      <div className="flex items-end gap-3">
        <Field label="Tweet ID">
          <input
            className={`${inputCls} w-64`}
            value={tweetId}
            onChange={(e) => setTweetId(e.target.value)}
            placeholder="e.g. clx..."
            onKeyDown={(e) => e.key === "Enter" && lookup()}
          />
        </Field>
        <button
          type="button"
          disabled={loading || !tweetId.trim()}
          onClick={lookup}
          className={secondaryBtnCls}
        >
          {loading ? "Loading…" : "Fetch"}
        </button>
      </div>
      {error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">
          {error}
        </p>
      )}
      <ResultBox data={result} />
    </SectionCard>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TwitterPage() {
  return (
    <div>
      <PageHeader
        eyebrow="TWITTER AI"
        title="Tweet pipeline control."
        description="Run ingestion, compute market outcomes, and inspect stored tweets."
      />
      <Container>
        <div className="grid gap-6 py-12">
          <IngestSection />
          <div className="grid gap-6 lg:grid-cols-2">
            <ComputeOutcomesSection />
            <RecomputeLabelsSection />
          </div>
          <TweetLookupSection />
        </div>
      </Container>
    </div>
  );
}
