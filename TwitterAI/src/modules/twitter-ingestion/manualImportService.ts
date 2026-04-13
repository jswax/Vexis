/**
 * Manual tweet import — bypasses Apify entirely.
 *
 * Accepts an array of tweet objects in any of:
 *   1. Apify apidojo/tweet-scraper format (what the normalizer already handles)
 *   2. Twitter API v2 format — { data: Tweet[], includes: { users: User[] } }
 *   3. Simple flat format — { id, text, created_at, username, ... }
 *
 * The same normalization, ticker extraction, and feature scoring pipeline runs
 * as with the regular Apify ingestion, so imported tweets flow through
 * `compute-outcomes` exactly the same way.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { TickerExtractorService } from '../asset-matching/tickerExtractor.service.js';
import { normalizeApifyTweetItem } from './tweetNormalizer.js';
import { exactTextHash } from './tweetDeduper.js';
import { computeFeatureScores } from './featureScoring.js';

export type ManualImportResult = {
  itemsReceived: number;
  itemsNormalized: number;
  itemsSkipped: number;
  tweetsUpserted: number;
  authorsUpserted: number;
  assetMatchesCreated: number;
  featuresUpserted: number;
};

type V2Tweet = {
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
  referenced_tweets?: { type: string; id: string }[];
  attachments?: { media_keys?: string[] };
  lang?: string;
};

type V2User = {
  id: string;
  name?: string;
  username?: string;
  verified?: boolean;
  public_metrics?: {
    followers_count?: number;
    following_count?: number;
    tweet_count?: number;
  };
};

/**
 * Detect and normalise Twitter API v2 format into Apify-compatible flat objects.
 * v2 format: { data: V2Tweet[], includes: { users: V2User[] } }
 */
function flattenV2Response(raw: unknown): unknown[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj['data'])) return [];

  const usersById = new Map<string, V2User>();
  const includes = obj['includes'] as Record<string, unknown> | undefined;
  if (includes && Array.isArray(includes['users'])) {
    for (const u of includes['users'] as V2User[]) {
      if (u.id) usersById.set(u.id, u);
    }
  }

  return (obj['data'] as V2Tweet[]).map((t) => {
    const user = t.author_id ? usersById.get(t.author_id) : undefined;
    const isRetweet = t.referenced_tweets?.some((r) => r.type === 'retweeted') ?? false;
    const isReply = t.referenced_tweets?.some((r) => r.type === 'replied_to') ?? false;
    const isQuote = t.referenced_tweets?.some((r) => r.type === 'quoted') ?? false;

    return {
      id: t.id,
      text: t.text,
      createdAt: t.created_at,
      created_at: t.created_at,
      lang: t.lang,
      likeCount: t.public_metrics?.like_count,
      retweetCount: t.public_metrics?.retweet_count,
      replyCount: t.public_metrics?.reply_count,
      quoteCount: t.public_metrics?.quote_count,
      bookmarkCount: t.public_metrics?.bookmark_count,
      viewCount: t.public_metrics?.impression_count,
      isRetweet,
      isReply,
      isQuote,
      hasImages: false,
      hasVideo: false,
      url: `https://x.com/i/web/status/${t.id}`,
      author: user
        ? {
            id: user.id,
            username: user.username,
            displayName: user.name,
            name: user.name,
            verified: user.verified ?? false,
            followersCount: user.public_metrics?.followers_count,
            followingCount: user.public_metrics?.following_count,
            statusesCount: user.public_metrics?.tweet_count,
          }
        : undefined,
    };
  });
}

/**
 * Accept input that is:
 *   - An array of raw tweet objects (Apify or simple flat format)
 *   - A Twitter API v2 response object { data: [], includes: {} }
 *   - A single raw tweet object
 */
function resolveItems(input: unknown): unknown[] {
  if (Array.isArray(input)) return input;
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    const obj = input as Record<string, unknown>;
    // Twitter API v2 response
    if (Array.isArray(obj['data'])) return flattenV2Response(input);
    // Single tweet object
    return [input];
  }
  return [];
}

export class ManualImportService {
  private readonly tickerExtractor = new TickerExtractorService();

  async import(
    rawInput: unknown,
    opts?: { sourceLabel?: string }
  ): Promise<ManualImportResult> {
    const items = resolveItems(rawInput);
    const scrapedAt = new Date();
    const sourceLabel = opts?.sourceLabel ?? 'manual';

    let itemsNormalized = 0;
    let tweetsUpserted = 0;
    let authorsUpserted = 0;
    let assetMatchesCreated = 0;
    let featuresUpserted = 0;

    const seenExternalIds = new Set<string>();
    const seenExactTextHashes = new Set<string>();

    for (const raw of items) {
      const bundle = normalizeApifyTweetItem(raw, {
        scrapedAt,
        sourceQuery: sourceLabel,
        sourceQueryType: 'manual',
      });
      if (!bundle) continue;
      if (seenExternalIds.has(bundle.tweet.externalId)) continue;
      seenExternalIds.add(bundle.tweet.externalId);

      const textHash = exactTextHash(bundle.tweet.text);
      if (seenExactTextHashes.has(textHash)) continue;
      seenExactTextHashes.add(textHash);

      itemsNormalized += 1;

      const author = await prisma.twitterAuthor.upsert({
        where: { externalId: bundle.author.externalId },
        update: {
          username: bundle.author.username,
          displayName: bundle.author.displayName,
          verified: bundle.author.verified,
          followersCount: bundle.author.followersCount ?? undefined,
          followingCount: bundle.author.followingCount ?? undefined,
          favouritesCount: bundle.author.favouritesCount ?? undefined,
          statusesCount: bundle.author.statusesCount ?? undefined,
          rawJson: bundle.author.rawJson as Prisma.InputJsonValue,
        },
        create: {
          externalId: bundle.author.externalId,
          username: bundle.author.username,
          displayName: bundle.author.displayName,
          verified: bundle.author.verified,
          followersCount: bundle.author.followersCount ?? undefined,
          followingCount: bundle.author.followingCount ?? undefined,
          favouritesCount: bundle.author.favouritesCount ?? undefined,
          statusesCount: bundle.author.statusesCount ?? undefined,
          rawJson: bundle.author.rawJson as Prisma.InputJsonValue,
        },
      });
      authorsUpserted += 1;

      const tweet = await prisma.tweet.upsert({
        where: { externalId: bundle.tweet.externalId },
        update: {
          url: bundle.tweet.url,
          text: bundle.tweet.text,
          rawJson: bundle.tweet.rawJson as Prisma.InputJsonValue,
          language: bundle.tweet.language ?? undefined,
          createdAtTwitter: bundle.tweet.createdAtTwitter,
          scrapedAt: bundle.tweet.scrapedAt,
          sourceQuery: bundle.tweet.sourceQuery ?? undefined,
          sourceQueryType: bundle.tweet.sourceQueryType ?? undefined,
          likeCount: bundle.tweet.likeCount ?? undefined,
          retweetCount: bundle.tweet.retweetCount ?? undefined,
          replyCount: bundle.tweet.replyCount ?? undefined,
          quoteCount: bundle.tweet.quoteCount ?? undefined,
          bookmarkCount: bundle.tweet.bookmarkCount ?? undefined,
          viewCount: bundle.tweet.viewCount ?? undefined,
          isReply: bundle.tweet.isReply,
          isRetweet: bundle.tweet.isRetweet,
          isQuote: bundle.tweet.isQuote,
          hasImages: bundle.tweet.hasImages,
          hasVideo: bundle.tweet.hasVideo,
          authorId: author.id,
        },
        create: {
          externalId: bundle.tweet.externalId,
          url: bundle.tweet.url,
          text: bundle.tweet.text,
          rawJson: bundle.tweet.rawJson as Prisma.InputJsonValue,
          language: bundle.tweet.language ?? undefined,
          createdAtTwitter: bundle.tweet.createdAtTwitter,
          scrapedAt: bundle.tweet.scrapedAt,
          sourceQuery: bundle.tweet.sourceQuery ?? undefined,
          sourceQueryType: bundle.tweet.sourceQueryType ?? undefined,
          likeCount: bundle.tweet.likeCount ?? undefined,
          retweetCount: bundle.tweet.retweetCount ?? undefined,
          replyCount: bundle.tweet.replyCount ?? undefined,
          quoteCount: bundle.tweet.quoteCount ?? undefined,
          bookmarkCount: bundle.tweet.bookmarkCount ?? undefined,
          viewCount: bundle.tweet.viewCount ?? undefined,
          isReply: bundle.tweet.isReply,
          isRetweet: bundle.tweet.isRetweet,
          isQuote: bundle.tweet.isQuote,
          hasImages: bundle.tweet.hasImages,
          hasVideo: bundle.tweet.hasVideo,
          authorId: author.id,
        },
      });
      tweetsUpserted += 1;

      const matches = await this.tickerExtractor.extract(tweet.text);
      if (matches.length) {
        const created = await prisma.tweetAssetMatch.createMany({
          data: matches.map((m) => ({
            tweetId: tweet.id,
            assetType: m.assetType,
            ticker: m.ticker,
            confidence: m.confidence,
            matchMethod: m.matchMethod,
          })),
          skipDuplicates: true,
        });
        assetMatchesCreated += created.count;
      }

      const scores = computeFeatureScores(
        {
          text: tweet.text,
          likeCount: bundle.tweet.likeCount,
          retweetCount: bundle.tweet.retweetCount,
          replyCount: bundle.tweet.replyCount,
          isRetweet: bundle.tweet.isRetweet,
          isReply: bundle.tweet.isReply,
          hasImages: bundle.tweet.hasImages,
          hasVideo: bundle.tweet.hasVideo,
        },
        {
          verified: author.verified,
          followersCount: author.followersCount,
          followingCount: author.followingCount,
          statusesCount: author.statusesCount,
        }
      );

      await prisma.tweetFeatures.upsert({
        where: { tweetId: tweet.id },
        update: {
          spamScore: scores.spamScore,
          credibilityScore: scores.credibilityScore,
          duplicateGroupId: scores.duplicateGroupId,
        },
        create: {
          tweetId: tweet.id,
          spamScore: scores.spamScore,
          credibilityScore: scores.credibilityScore,
          duplicateGroupId: scores.duplicateGroupId,
          embeddingModel: null,
        },
      });
      featuresUpserted += 1;

      const exactHash = exactTextHash(tweet.text);
      const prevRaw =
        tweet.rawJson && typeof tweet.rawJson === 'object' && !Array.isArray(tweet.rawJson)
          ? (tweet.rawJson as Prisma.JsonObject)
          : {};
      await prisma.tweet.update({
        where: { id: tweet.id },
        data: {
          rawJson: {
            ...prevRaw,
            _quality: {
              exactTextHash: exactHash,
              nearDupHash: scores.duplicateGroupId,
            },
          } as Prisma.InputJsonValue,
        },
      });
    }

    return {
      itemsReceived: items.length,
      itemsNormalized,
      itemsSkipped: items.length - itemsNormalized,
      tweetsUpserted,
      authorsUpserted,
      assetMatchesCreated,
      featuresUpserted,
    };
  }
}
