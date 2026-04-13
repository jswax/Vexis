/**
 * Twitter API v2 client (official Twitter/X API).
 *
 * Uses a Bearer Token for app-only auth (read-only).
 * Free/Basic tier supports:
 *   - GET /2/tweets/:id  (individual tweet lookup)
 *   - GET /2/users/by/username/:username
 *   - GET /2/users/:id/tweets  (user timeline — up to 3200 recent)
 *   - GET /2/tweets/search/recent (last 7 days, requires Basic $100/mo)
 *
 * Set TWITTER_BEARER_TOKEN in your .env.
 *
 * Note: search/recent requires at least the Basic plan. User timelines
 * work on the free tier. If you only have a free-tier token, use
 * fetchUserTimeline() to pull tweets from specific accounts.
 */
import { AppError } from '../../utils/errors.js';

export type V2TweetFields =
  | 'created_at'
  | 'text'
  | 'author_id'
  | 'public_metrics'
  | 'referenced_tweets'
  | 'attachments'
  | 'lang'
  | 'entities';

export type V2UserFields =
  | 'name'
  | 'username'
  | 'verified'
  | 'public_metrics'
  | 'description'
  | 'created_at';

export type V2TweetResponse = {
  data: V2Tweet[];
  includes?: { users?: V2User[]; media?: unknown[] };
  meta?: { next_token?: string; result_count?: number; newest_id?: string; oldest_id?: string };
  errors?: { title: string; detail: string }[];
};

export type V2Tweet = {
  id: string;
  text: string;
  created_at?: string;
  author_id?: string;
  public_metrics?: {
    like_count?: number;
    retweet_count?: number;
    reply_count?: number;
    quote_count?: number;
    bookmark_count?: number;
    impression_count?: number;
  };
  referenced_tweets?: { type: 'retweeted' | 'replied_to' | 'quoted'; id: string }[];
  attachments?: { media_keys?: string[] };
  lang?: string;
};

export type V2User = {
  id: string;
  name?: string;
  username?: string;
  verified?: boolean;
  public_metrics?: {
    followers_count?: number;
    following_count?: number;
    listed_count?: number;
    tweet_count?: number;
  };
};

const DEFAULT_TWEET_FIELDS: V2TweetFields[] = [
  'created_at',
  'text',
  'author_id',
  'public_metrics',
  'referenced_tweets',
  'attachments',
  'lang',
];

const DEFAULT_USER_FIELDS: V2UserFields[] = [
  'name',
  'username',
  'verified',
  'public_metrics',
];

export class TwitterApiV2Client {
  private readonly baseUrl = 'https://api.twitter.com/2';
  private readonly bearerToken: string;

  constructor(bearerToken: string) {
    if (!bearerToken) throw new Error('TwitterApiV2Client requires a Bearer Token');
    this.bearerToken = bearerToken;
  }

  private get headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.bearerToken}` };
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const res = await fetch(url, { headers: this.headers });
    const text = await res.text();
    if (!res.ok) {
      throw new AppError({
        statusCode: res.status,
        code: 'TWITTER_API_V2_ERROR',
        message: `Twitter API v2 HTTP ${res.status}`,
        details: { url, body: text.slice(0, 2000) },
      });
    }
    return JSON.parse(text) as T;
  }

  /**
   * Lookup a single tweet by ID.
   */
  async getTweet(tweetId: string): Promise<V2TweetResponse> {
    const url = new URL(`${this.baseUrl}/tweets/${tweetId}`);
    url.searchParams.set('tweet.fields', DEFAULT_TWEET_FIELDS.join(','));
    url.searchParams.set('expansions', 'author_id');
    url.searchParams.set('user.fields', DEFAULT_USER_FIELDS.join(','));
    return this.fetchJson<V2TweetResponse>(url.toString());
  }

  /**
   * Lookup a user by username.
   */
  async getUserByUsername(username: string): Promise<{ data: V2User }> {
    const clean = username.replace(/^@/, '');
    const url = new URL(`${this.baseUrl}/users/by/username/${encodeURIComponent(clean)}`);
    url.searchParams.set('user.fields', DEFAULT_USER_FIELDS.join(','));
    return this.fetchJson<{ data: V2User }>(url.toString());
  }

  /**
   * Fetch up to `maxResults` tweets from a user's timeline (up to 3200 with pagination).
   * Works on the free-tier bearer token.
   *
   * @param userId  Twitter user ID (numeric string). Use getUserByUsername() to resolve.
   * @param opts.maxResults  Tweets per page (5–100). Pagination continues until total reached.
   * @param opts.total       Max total tweets to return across all pages (default 100).
   * @param opts.startTime   ISO 8601 string — only tweets after this time.
   * @param opts.endTime     ISO 8601 string — only tweets before this time.
   * @param opts.excludeRetweets  Exclude retweets (default true).
   * @param opts.excludeReplies   Exclude replies (default false).
   */
  async fetchUserTimeline(
    userId: string,
    opts?: {
      maxResults?: number;
      total?: number;
      startTime?: string;
      endTime?: string;
      excludeRetweets?: boolean;
      excludeReplies?: boolean;
    }
  ): Promise<V2TweetResponse> {
    const perPage = Math.min(opts?.maxResults ?? 100, 100);
    const totalTarget = opts?.total ?? 100;
    const excludeRetweets = opts?.excludeRetweets ?? true;
    const excludeReplies = opts?.excludeReplies ?? false;

    const allTweets: V2Tweet[] = [];
    const allUsers: V2User[] = [];
    let nextToken: string | undefined;

    do {
      const url = new URL(`${this.baseUrl}/users/${userId}/tweets`);
      url.searchParams.set('max_results', String(Math.min(perPage, totalTarget - allTweets.length)));
      url.searchParams.set('tweet.fields', DEFAULT_TWEET_FIELDS.join(','));
      url.searchParams.set('expansions', 'author_id');
      url.searchParams.set('user.fields', DEFAULT_USER_FIELDS.join(','));

      const excludes: string[] = [];
      if (excludeRetweets) excludes.push('retweets');
      if (excludeReplies) excludes.push('replies');
      if (excludes.length) url.searchParams.set('exclude', excludes.join(','));

      if (opts?.startTime) url.searchParams.set('start_time', opts.startTime);
      if (opts?.endTime) url.searchParams.set('end_time', opts.endTime);
      if (nextToken) url.searchParams.set('pagination_token', nextToken);

      const page = await this.fetchJson<V2TweetResponse>(url.toString());

      if (page.data) allTweets.push(...page.data);
      if (page.includes?.users) allUsers.push(...page.includes.users);
      nextToken = page.meta?.next_token;
    } while (nextToken && allTweets.length < totalTarget);

    return {
      data: allTweets.slice(0, totalTarget),
      includes: { users: allUsers },
    };
  }

  /**
   * Recent tweet search (last 7 days). Requires at least Basic plan ($100/mo).
   *
   * @param query  Twitter search query string (same syntax as twitter.com search).
   * @param opts.maxResults  Max results to return (default 100, max 500 per page).
   * @param opts.startTime   ISO 8601 string.
   * @param opts.endTime     ISO 8601 string.
   */
  async searchRecent(
    query: string,
    opts?: {
      maxResults?: number;
      startTime?: string;
      endTime?: string;
    }
  ): Promise<V2TweetResponse> {
    const totalTarget = opts?.maxResults ?? 100;
    const allTweets: V2Tweet[] = [];
    const allUsers: V2User[] = [];
    let nextToken: string | undefined;

    do {
      const url = new URL(`${this.baseUrl}/tweets/search/recent`);
      url.searchParams.set('query', query);
      url.searchParams.set('max_results', String(Math.min(100, totalTarget - allTweets.length)));
      url.searchParams.set('tweet.fields', DEFAULT_TWEET_FIELDS.join(','));
      url.searchParams.set('expansions', 'author_id');
      url.searchParams.set('user.fields', DEFAULT_USER_FIELDS.join(','));

      if (opts?.startTime) url.searchParams.set('start_time', opts.startTime);
      if (opts?.endTime) url.searchParams.set('end_time', opts.endTime);
      if (nextToken) url.searchParams.set('next_token', nextToken);

      const page = await this.fetchJson<V2TweetResponse>(url.toString());

      if (page.data) allTweets.push(...page.data);
      if (page.includes?.users) allUsers.push(...page.includes.users);
      nextToken = page.meta?.next_token;
    } while (nextToken && allTweets.length < totalTarget);

    return {
      data: allTweets.slice(0, totalTarget),
      includes: { users: allUsers },
    };
  }
}
