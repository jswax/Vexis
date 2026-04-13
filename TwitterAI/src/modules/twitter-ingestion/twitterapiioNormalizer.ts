import type { NormalizedTweetBundle } from './twitterIngestion.types.js';

function safeStr(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function safeInt(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)))
    return Math.trunc(Number(v));
  return null;
}

function safeBool(v: unknown): boolean {
  return v === true;
}

function safeDate(v: unknown): Date | null {
  if (typeof v === 'string' && v.trim()) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function rec(v: unknown): Record<string, unknown> {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  return {};
}

/**
 * Normalize a raw twitterapi.io tweet object into our NormalizedTweetBundle.
 *
 * twitterapi.io Tweet shape:
 *   id, url, text, type, createdAt, lang, source,
 *   retweetCount, replyCount, likeCount, quoteCount, viewCount, bookmarkCount,
 *   isReply, inReplyToId, conversationId,
 *   author (UserInfo), entities (TweetEntities),
 *   quoted_tweet, retweeted_tweet
 *
 * author (UserInfo):
 *   id, userName, name, isBlueVerified, verifiedType,
 *   followers, following, favouritesCount, statusesCount,
 *   profilePicture, coverPicture
 *
 * entities.media[]: { type: 'photo'|'video'|'animated_gif', ... }
 */
export function normalizeTweetApiIoTweet(
  raw: unknown,
  opts?: {
    scrapedAt?: Date;
    sourceQuery?: string | null;
    sourceQueryType?: string | null;
  }
): NormalizedTweetBundle | null {
  const t = rec(raw);

  // ── Tweet ID ───────────────────────────────────────────────────────────────
  const externalId = safeStr(t['id'], '');
  if (!externalId) return null;

  // ── Text ───────────────────────────────────────────────────────────────────
  const text = safeStr(t['text'], '').trim();
  if (!text) return null;

  // ── Date ───────────────────────────────────────────────────────────────────
  const createdAtTwitter = safeDate(t['createdAt']);
  if (!createdAtTwitter) return null;

  // ── Author ─────────────────────────────────────────────────────────────────
  const a = rec(t['author']);
  const authorId = safeStr(a['id'], '');
  const username = safeStr(a['userName'], '').replace(/^@/, '');
  if (!authorId && !username) return null;

  const displayName = safeStr(a['name'], username || 'Unknown');

  // ── Media ──────────────────────────────────────────────────────────────────
  const entities = rec(t['entities']);
  const media = Array.isArray(entities['media']) ? (entities['media'] as unknown[]) : [];
  const hasImages = media.some((m) => rec(m)['type'] === 'photo');
  const hasVideo = media.some(
    (m) => rec(m)['type'] === 'video' || rec(m)['type'] === 'animated_gif'
  );

  // ── Reply / Retweet / Quote flags ──────────────────────────────────────────
  const tweetType = safeStr(t['type'], '');
  const isReply = safeBool(t['isReply']) || tweetType === 'reply';
  const isRetweet = t['retweeted_tweet'] != null || tweetType === 'retweet';
  const isQuote = t['quoted_tweet'] != null || tweetType === 'quote';

  return {
    author: {
      externalId: authorId || `username:${username.toLowerCase()}`,
      username: username || `unknown_${externalId}`,
      displayName: displayName || username || 'Unknown',
      verified: safeBool(a['isBlueVerified']),
      followersCount: safeInt(a['followers']),
      followingCount: safeInt(a['following']),
      favouritesCount: safeInt(a['favouritesCount']),
      statusesCount: safeInt(a['statusesCount']),
      rawJson: a,
    },
    tweet: {
      externalId,
      url: safeStr(t['url'], `https://x.com/i/web/status/${externalId}`),
      text,
      rawJson: raw,
      language: safeStr(t['lang'], '') || null,
      createdAtTwitter,
      scrapedAt: opts?.scrapedAt ?? new Date(),
      sourceQuery: opts?.sourceQuery ?? null,
      sourceQueryType: opts?.sourceQueryType ?? null,
      matchedSearchTerm: null,
      likeCount: safeInt(t['likeCount']),
      retweetCount: safeInt(t['retweetCount']),
      replyCount: safeInt(t['replyCount']),
      quoteCount: safeInt(t['quoteCount']),
      bookmarkCount: safeInt(t['bookmarkCount']),
      viewCount: safeInt(t['viewCount']),
      isReply,
      isRetweet,
      isQuote,
      hasImages,
      hasVideo,
    },
  };
}
