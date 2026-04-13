import type { NormalizedTweetBundle } from './twitterIngestion.types.js';

function safeString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function safeBool(v: unknown, fallback = false): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function safeInt(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Math.trunc(Number(v));
  return null;
}

function safeDate(v: unknown): Date | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  if (typeof v === 'number' && Number.isFinite(v)) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof v === 'string' && v.trim() !== '') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function getNested(raw: unknown, path: string[]): unknown {
  let cur: unknown = raw;
  for (const p of path) {
    const r = asRecord(cur);
    if (!r) return undefined;
    cur = r[p];
  }
  return cur;
}

function pickFirst(raw: unknown, paths: string[][]): unknown {
  for (const p of paths) {
    const v = getNested(raw, p);
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

export function normalizeApifyTweetItem(raw: unknown, opts?: { scrapedAt?: Date; sourceQuery?: string | null; sourceQueryType?: string | null }): NormalizedTweetBundle | null {
  // Apify actor outputs can vary by version/config. We extract defensively by trying multiple paths.
  const tweetExternalIdRaw =
    pickFirst(raw, [
      ['id'],
      ['tweetId'],
      ['tweet_id'],
      ['tweet', 'id'],
      ['tweet', 'tweetId'],
      ['tweet', 'tweet_id'],
      ['data', 'id'],
      ['data', 'tweetId'],
      ['data', 'tweet_id'],
    ]) ?? null;
  const tweetExternalId = tweetExternalIdRaw != null ? String(tweetExternalIdRaw) : '';
  if (!tweetExternalId) return null;

  const textRaw =
    pickFirst(raw, [
      ['fullText'],
      ['full_text'],
      ['text'],
      ['content'],
      ['tweet', 'fullText'],
      ['tweet', 'full_text'],
      ['tweet', 'text'],
      ['tweet', 'content'],
      ['data', 'text'],
      ['data', 'fullText'],
      ['data', 'full_text'],
    ]) ?? '';
  const text = safeString(textRaw, '').trim();
  if (!text) return null;

  const createdAtRaw =
    pickFirst(raw, [
      ['createdAt'],
      ['created_at'],
      ['time'],
      ['timestamp'],
      ['tweet', 'createdAt'],
      ['tweet', 'created_at'],
      ['tweet', 'time'],
      ['data', 'createdAt'],
      ['data', 'created_at'],
    ]) ?? null;
  const createdAtTwitter = safeDate(createdAtRaw);
  if (!createdAtTwitter) return null;

  const authorRaw =
    (pickFirst(raw, [
      ['author'],
      ['user'],
      ['tweet', 'author'],
      ['tweet', 'user'],
      ['data', 'author'],
      ['data', 'user'],
    ]) as unknown) ?? {};

  const authorExternalIdRaw =
    pickFirst(authorRaw, [
      ['id'],
      ['userId'],
      ['user_id'],
    ]) ?? null;
  const authorExternalId = authorExternalIdRaw != null ? String(authorExternalIdRaw) : '';
  const username =
    safeString(
      pickFirst(authorRaw, [
        ['username'],
        ['userName'],
        ['screenName'],
        ['screen_name'],
        ['handle'],
      ]),
      ''
    ).replace(/^@/, '');

  const displayName = safeString(pickFirst(authorRaw, [['displayName'], ['display_name'], ['name']]), username || '');

  if (!authorExternalId && !username) return null;

  const isReply = safeBool(
    pickFirst(raw, [['isReply'], ['is_reply'], ['tweet', 'isReply'], ['tweet', 'is_reply']]),
    pickFirst(raw, [['replyToTweetId'], ['reply_to_tweet_id'], ['tweet', 'replyToTweetId'], ['tweet', 'reply_to_tweet_id']]) != null
  );
  const isRetweet = safeBool(
    pickFirst(raw, [['isRetweet'], ['is_retweet'], ['tweet', 'isRetweet'], ['tweet', 'is_retweet']]),
    pickFirst(raw, [['retweetedTweetId'], ['retweeted_tweet_id'], ['tweet', 'retweetedTweetId'], ['tweet', 'retweeted_tweet_id']]) != null
  );
  const isQuote = safeBool(
    pickFirst(raw, [['isQuote'], ['is_quote'], ['tweet', 'isQuote'], ['tweet', 'is_quote']]),
    pickFirst(raw, [['quotedTweetId'], ['quoted_tweet_id'], ['tweet', 'quotedTweetId'], ['tweet', 'quoted_tweet_id']]) != null
  );

  const photos = pickFirst(raw, [['photos'], ['media'], ['tweet', 'photos'], ['tweet', 'media'], ['data', 'photos'], ['data', 'media']]);
  const videos = pickFirst(raw, [['videos'], ['tweet', 'videos'], ['data', 'videos']]);
  const hasImages = Array.isArray(photos) ? photos.length > 0 : false;
  const hasVideo = Array.isArray(videos) ? videos.length > 0 : false;

  const likeCount = safeInt(pickFirst(raw, [['likeCount'], ['like_count'], ['favorites'], ['favourites'], ['tweet', 'likeCount'], ['tweet', 'like_count']]));
  const retweetCount = safeInt(pickFirst(raw, [['retweetCount'], ['retweet_count'], ['tweet', 'retweetCount'], ['tweet', 'retweet_count']]));
  const replyCount = safeInt(pickFirst(raw, [['replyCount'], ['reply_count'], ['tweet', 'replyCount'], ['tweet', 'reply_count']]));
  const quoteCount = safeInt(pickFirst(raw, [['quoteCount'], ['quote_count'], ['tweet', 'quoteCount'], ['tweet', 'quote_count']]));
  const bookmarkCount = safeInt(pickFirst(raw, [['bookmarkCount'], ['bookmark_count'], ['tweet', 'bookmarkCount'], ['tweet', 'bookmark_count']]));
  const viewCount = safeInt(pickFirst(raw, [['viewCount'], ['view_count'], ['tweet', 'viewCount'], ['tweet', 'view_count']]));

  const scrapedAt = opts?.scrapedAt ?? new Date();

  return {
    author: {
      externalId: authorExternalId || `username:${username.toLowerCase()}`,
      username: username || `unknown_${tweetExternalId}`,
      displayName: displayName || username || 'Unknown',
      verified: safeBool(pickFirst(authorRaw, [['verified'], ['isVerified'], ['is_verified']]), false),
      followersCount: safeInt(pickFirst(authorRaw, [['followersCount'], ['followers_count']])),
      followingCount: safeInt(pickFirst(authorRaw, [['followingCount'], ['following_count']])),
      favouritesCount: safeInt(pickFirst(authorRaw, [['favouritesCount'], ['favoritesCount'], ['favourites_count'], ['favorites_count']])),
      statusesCount: safeInt(pickFirst(authorRaw, [['statusesCount'], ['statuses_count']])),
      rawJson: authorRaw,
    },
    tweet: {
      externalId: tweetExternalId,
      url: safeString(pickFirst(raw, [['url'], ['tweet', 'url'], ['data', 'url']]), `https://x.com/i/web/status/${tweetExternalId}`),
      text,
      rawJson: raw,
      language: safeString(pickFirst(raw, [['language'], ['lang'], ['tweet', 'language'], ['tweet', 'lang']]), '') || null,
      createdAtTwitter,
      scrapedAt,
      sourceQuery: opts?.sourceQuery ?? null,
      sourceQueryType: opts?.sourceQueryType ?? null,
      matchedSearchTerm: safeString(pickFirst(raw, [['matchedSearchTerm'], ['searchTerm'], ['matched_search_term'], ['search_term']]), '') || null,
      likeCount,
      retweetCount,
      replyCount,
      quoteCount,
      bookmarkCount,
      viewCount,
      isReply,
      isRetweet,
      isQuote,
      hasImages,
      hasVideo,
    },
  };
}

