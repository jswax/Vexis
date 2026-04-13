import { env } from '../../config/env.js';
import type { ApifyTweetScraperInput } from './twitterIngestion.types.js';

const BASE_URL = 'https://api.twitterapi.io';

/** twitterapi.io free tier: max 1 request every 5 seconds */
const FREE_TIER_DELAY_MS = 5_100;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export type TwitterApiIoRunResult = {
  items: unknown[];
  queries: string[];
};

function buildQuery(baseTerm: string, input: ApifyTweetScraperInput): string {
  let q = baseTerm.trim();
  if (input.tweetLanguage) q += ` lang:${input.tweetLanguage}`;
  if (input.minimumRetweets != null && input.minimumRetweets > 0)
    q += ` min_retweets:${input.minimumRetweets}`;
  if (input.minimumFavorites != null && input.minimumFavorites > 0)
    q += ` min_faves:${input.minimumFavorites}`;
  if (input.minimumReplies != null && input.minimumReplies > 0)
    q += ` min_replies:${input.minimumReplies}`;
  if (input.onlyVerifiedUsers) q += ` filter:verified`;
  if (input.start) q += ` since:${input.start}`;
  if (input.end) q += ` until:${input.end}`;
  return q.trim();
}

async function searchPage(
  query: string,
  queryType: 'Latest' | 'Top',
  cursor: string,
  apiKey: string
): Promise<{ tweets: unknown[]; hasNextPage: boolean; nextCursor: string }> {
  const params = new URLSearchParams({ query, queryType });
  if (cursor) params.set('cursor', cursor);
  const res = await fetch(`${BASE_URL}/twitter/tweet/advanced_search?${params}`, {
    headers: { 'X-API-Key': apiKey },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`twitterapi.io search failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    tweets?: unknown[];
    has_next_page?: boolean;
    next_cursor?: string;
  };

  return {
    tweets: data.tweets ?? [],
    hasNextPage: data.has_next_page ?? false,
    nextCursor: data.next_cursor ?? '',
  };
}

async function collectSearch(
  query: string,
  queryType: 'Latest' | 'Top',
  limit: number,
  apiKey: string
): Promise<unknown[]> {
  const collected: unknown[] = [];
  let cursor = '';
  let first = true;

  while (collected.length < limit) {
    if (!first) await sleep(FREE_TIER_DELAY_MS);
    first = false;

    const page = await searchPage(query, queryType, cursor, apiKey);
    collected.push(...page.tweets);
    if (!page.hasNextPage || !page.nextCursor) break;
    cursor = page.nextCursor;
  }

  return collected.slice(0, limit);
}

export class TwitterApiIoClient {
  private readonly apiKey = env.TWITTER_API_IO_KEY;

  async run(input: ApifyTweetScraperInput): Promise<TwitterApiIoRunResult> {
    const allQueries: string[] = [];
    const seenIds = new Set<string>();
    const collected: unknown[] = [];

    const totalSources =
      input.searchTerms.length +
      input.twitterHandles.length +
      input.conversationIds.length;
    const perQueryLimit =
      totalSources > 0 ? Math.ceil(input.maxItems / totalSources) : input.maxItems;

    const queryTypes: ('Latest' | 'Top')[] =
      input.sort === 'Latest + Top'
        ? ['Latest', 'Top']
        : input.sort === 'Top'
          ? ['Top']
          : ['Latest'];

    const addItems = (items: unknown[]) => {
      for (const item of items) {
        if (collected.length >= input.maxItems) return;
        const r = item as Record<string, unknown>;
        const id = String(r['id'] ?? '');
        if (!id || seenIds.has(id)) continue;
        seenIds.add(id);
        collected.push(item);
      }
    };

    let queryCount = 0;

    async function runQuery(q: string, qt: 'Latest' | 'Top') {
      // Delay before every query except the very first one
      if (queryCount > 0) await sleep(FREE_TIER_DELAY_MS);
      queryCount++;
      allQueries.push(q);
      const items = await collectSearch(q, qt, perQueryLimit, apiKey);
      addItems(items);
    }

    const apiKey = this.apiKey;

    // 1. searchTerms
    for (const term of input.searchTerms) {
      if (collected.length >= input.maxItems) break;
      for (const qt of queryTypes) {
        if (collected.length >= input.maxItems) break;
        await runQuery(buildQuery(term, input), qt);
      }
    }

    // 2. twitterHandles → from:<handle>
    for (const handle of input.twitterHandles) {
      if (collected.length >= input.maxItems) break;
      for (const qt of queryTypes) {
        if (collected.length >= input.maxItems) break;
        await runQuery(buildQuery(`from:${handle.replace(/^@/, '')}`, input), qt);
      }
    }

    // 3. conversationIds → conversation_id:<id>
    for (const convId of input.conversationIds) {
      if (collected.length >= input.maxItems) break;
      for (const qt of queryTypes) {
        if (collected.length >= input.maxItems) break;
        await runQuery(buildQuery(`conversation_id:${convId}`, input), qt);
      }
    }

    if (input.startUrls.length > 0) {
      console.warn(
        `[twitterapi.io] startUrls are not supported and will be skipped (${input.startUrls.length} URL(s)).`
      );
    }

    return { items: collected, queries: allQueries };
  }
}
