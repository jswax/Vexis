import type { ApifyTweetScraperInput } from './twitterIngestion.types.js';

/**
 * Market-relevant query buckets for Apify `apidojo/tweet-scraper`.
 *
 * Goals:
 * - Maximize market relevance, reduce generic noise
 * - Preserve provenance via includeSearchTerms=true (Apify adds the originating search term to each item)
 * - Keep queries grouped into themed buckets for maintainability
 *
 * Notes on query syntax:
 * - `lang:en` is included at query-level and also `tweetLanguage` is set to `en` as a second guardrail.
 * - We default to `-filter:replies` (replies are often low-signal/noisy).
 * - We do NOT default to `-filter:retweets` because retweets can be signal; however duplicates are handled at ingestion.
 */
export const MARKET_QUERY_BUCKETS = {
  /**
   * Macro / market-moving events
   * Why: These terms align well to timestamped market reaction labels (rates/inflation/jobs).
   */
  macro: [
    '(CPI OR inflation OR "consumer price index") lang:en -filter:replies',
    '(FOMC OR Fed OR "Jerome Powell" OR "rate cut" OR "rate hike") lang:en -filter:replies',
    '(NFP OR "jobs report" OR payrolls OR unemployment) lang:en -filter:replies',
    '(GDP OR recession OR "treasury yields" OR "10 year yield" OR "10y yield") lang:en -filter:replies',
    '(PCE OR "core PCE") lang:en -filter:replies',
    '("ECB" OR "Bank of Japan" OR BOJ OR "Bank of England") lang:en -filter:replies',
  ],

  /**
   * Major index / ETF / market structure
   * Why: Systemic moves often propagate through benchmarks, vol, and positioning narratives.
   */
  indexEtfStructure: [
    '($SPY OR SPY OR "S&P 500") lang:en -filter:replies',
    '($QQQ OR QQQ OR Nasdaq OR "NASDAQ 100" OR "Nasdaq 100") lang:en -filter:replies',
    '($DIA OR DIA) lang:en -filter:replies',
    '(VIX OR $VIX) lang:en -filter:replies',
    '("options flow" OR "gamma squeeze" OR "dealer positioning" OR "0dte") lang:en -filter:replies',
    '("short interest" OR "short squeeze") lang:en -filter:replies',
    '("bond yields" OR "treasury yields") lang:en -filter:replies',
  ],

  /**
   * High-impact mega cap equities
   * Why: These names reliably move indices and attract high-volume info flow.
   */
  megaCap: [
    '($AAPL OR Apple) lang:en -filter:replies',
    '($MSFT OR Microsoft) lang:en -filter:replies',
    '($NVDA OR Nvidia) lang:en -filter:replies',
    '($TSLA OR Tesla) lang:en -filter:replies',
    '($AMZN OR Amazon) lang:en -filter:replies',
    '($META OR Meta) lang:en -filter:replies',
    '($GOOGL OR Google OR Alphabet) lang:en -filter:replies',
    '($AMD OR AMD) lang:en -filter:replies',
    '($NFLX OR Netflix) lang:en -filter:replies',
  ],

  /**
   * Crypto
   * Why: Crypto trades 24/7 and often reacts sharply to narrative shifts.
   */
  crypto: [
    '($BTC OR BTC OR Bitcoin OR "bitcoin ETF" OR "crypto ETF") lang:en -filter:replies',
    '($ETH OR ETH OR Ethereum OR "ethereum ETF") lang:en -filter:replies',
    '(Solana OR $SOL) lang:en -filter:replies',
    '(XRP OR $XRP) lang:en -filter:replies',
  ],

  /**
   * Earnings / guidance / corporate events
   * Why: Event-driven corporate updates map cleanly to forward-return labeling.
   */
  earningsAndCorpEvents: [
    '(earnings OR guidance OR "raises guidance" OR "cuts guidance") lang:en -filter:replies',
    '(downgrade OR upgrade) lang:en -filter:replies',
    '("SEC filing" OR "8-K" OR "10-Q" OR "10-K") lang:en -filter:replies',
    '(acquisition OR merger) lang:en -filter:replies',
    '(bankruptcy) lang:en -filter:replies',
    '("share buyback" OR "stock split") lang:en -filter:replies',
  ],
} as const;

/**
 * Trusted finance/news accounts
 * Why: High-signal feeds for market headlines, flows, and breaking news.
 */
export const TRUSTED_FINANCE_HANDLES: string[] = [
  'unusual_whales',
  'financialjuice',
  'zerohedge',
  'squawkcnbc',
  'DeItaone',
  'FirstSquawk',
  'Reuters',
  'Bloomberg',
  'WSJ',
  'business',
];

export type MarketIngestMode = 'default' | 'strict';

export function flattenMarketBucketsToSearchTerms(): string[] {
  const all = Object.values(MARKET_QUERY_BUCKETS).flat();
  // Stable order + no accidental duplicates.
  return Array.from(new Set(all));
}

export function defaultMarketRelevantIngestConfig(opts?: {
  maxItems?: number;
  sort?: ApifyTweetScraperInput['sort'];
  start?: string;
  end?: string;
  mode?: MarketIngestMode;
}): ApifyTweetScraperInput {
  const mode: MarketIngestMode = opts?.mode ?? 'default';

  const base: ApifyTweetScraperInput = {
    searchTerms: flattenMarketBucketsToSearchTerms(),
    twitterHandles: TRUSTED_FINANCE_HANDLES,
    startUrls: [],
    conversationIds: [],
    maxItems: opts?.maxItems ?? 200,
    sort: opts?.sort ?? 'Latest',
    tweetLanguage: 'en',
    includeSearchTerms: true,
    minimumRetweets: 2,
    minimumFavorites: 5,
    minimumReplies: 0,
    onlyVerifiedUsers: false,
    onlyTwitterBlue: false,
    start: opts?.start,
    end: opts?.end,
  };

  if (mode === 'strict') {
    return {
      ...base,
      onlyVerifiedUsers: true,
    };
  }

  return base;
}

export function buildApifyTweetScraperInput(input: ApifyTweetScraperInput): ApifyTweetScraperInput {
  // Guardrails (do not mutate caller input).
  const maxItems = Math.min(input.maxItems, 2000);
  return {
    ...input,
    maxItems,
    tweetLanguage: input.tweetLanguage ?? 'en',
    includeSearchTerms: input.includeSearchTerms ?? true,
    sort: input.sort ?? 'Latest',
    minimumRetweets: input.minimumRetweets ?? 2,
    minimumFavorites: input.minimumFavorites ?? 5,
    minimumReplies: input.minimumReplies ?? 0,
    onlyTwitterBlue: input.onlyTwitterBlue ?? false,
    onlyVerifiedUsers: input.onlyVerifiedUsers ?? false,
  };
}

