import { Prisma, type TweetIngestionJobStatus } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { AppError, toErrorMessage } from '../../utils/errors.js';
import { TickerExtractorService } from '../asset-matching/tickerExtractor.service.js';
import { TwitterApiIoClient } from './twitterapiioClient.js';
import { buildApifyTweetScraperInput } from './queryBuilder.js';
import { normalizeTweetApiIoTweet } from './twitterapiioNormalizer.js';
import { exactTextHash } from './tweetDeduper.js';
import { computeFeatureScores } from './featureScoring.js';
import { apifyTweetScraperInputSchema } from './twitterIngestion.types.js';
import type { ApifyTweetScraperInput, IngestSource } from './twitterIngestion.types.js';

export type IngestResult = {
  jobId: string;
  apifyRunId: string | null;
  itemsReceived: number;
  itemsNormalized: number;
  itemsSkipped: number;
  tweetsUpserted: number;
  authorsUpserted: number;
  assetMatchesCreated: number;
  featuresUpserted: number;
};

export class TwitterIngestionService {
  constructor(
    private readonly twitterApiIo = new TwitterApiIoClient(),
    private readonly tickerExtractor = new TickerExtractorService()
  ) {}

  async ingest(input: ApifyTweetScraperInput, opts: { source: IngestSource; sourceLabel?: string }) {
    const parsed = apifyTweetScraperInputSchema.parse(input);
    const ingestInput = buildApifyTweetScraperInput(parsed);

    const job = await prisma.tweetIngestionJob.create({
      data: {
        source: opts.source,
        provider: 'twitterapi.io',
        status: 'CREATED' satisfies TweetIngestionJobStatus,
        actorId: 'twitterapi.io',
        queryConfigJson: ingestInput as Prisma.InputJsonValue,
      },
    });

    const startedAt = new Date();
    await prisma.tweetIngestionJob.update({
      where: { id: job.id },
      data: { status: 'RUNNING', startedAt },
    });

    try {
      const run = await this.twitterApiIo.run(ingestInput);
      const scrapedAt = new Date();

      const items = run.items;
      let itemsNormalized = 0;
      let tweetsUpserted = 0;
      let authorsUpserted = 0;
      let assetMatchesCreated = 0;
      let featuresUpserted = 0;

      const seenExternalIds = new Set<string>();
      const seenExactTextHashes = new Set<string>();

      const sourceQueryType =
        ingestInput.searchTerms.length
          ? 'searchTerms'
          : ingestInput.twitterHandles.length
            ? 'twitterHandles'
            : null;

      for (const raw of items) {
        const bundle = normalizeTweetApiIoTweet(raw, {
          scrapedAt,
          sourceQuery: opts.sourceLabel ?? null,
          sourceQueryType,
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
            matchedSearchTerm: bundle.tweet.matchedSearchTerm ?? undefined,
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
            matchedSearchTerm: bundle.tweet.matchedSearchTerm ?? undefined,
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

        const exactHash = exactTextHash(tweet.text);
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

      await prisma.tweetIngestionJob.update({
        where: { id: job.id },
        data: {
          status: 'SUCCEEDED',
          apifyRunId: null,
          itemsRequested: ingestInput.maxItems,
          itemsReceived: items.length,
          finishedAt: new Date(),
        },
      });

      return {
        jobId: job.id,
        apifyRunId: null,
        itemsReceived: items.length,
        itemsNormalized,
        itemsSkipped: items.length - itemsNormalized,
        tweetsUpserted,
        authorsUpserted,
        assetMatchesCreated,
        featuresUpserted,
      } satisfies IngestResult;
    } catch (err) {
      await prisma.tweetIngestionJob.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          errorMessage: toErrorMessage(err),
          finishedAt: new Date(),
        },
      });
      throw new AppError({
        statusCode: 500,
        code: 'INGESTION_FAILED',
        message: 'Tweet ingestion failed',
        details: { jobId: job.id, error: toErrorMessage(err) },
      });
    }
  }
}
