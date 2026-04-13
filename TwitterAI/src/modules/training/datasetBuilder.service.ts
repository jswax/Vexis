import { prisma } from '../../db/prisma.js';

export type TrainingRow = {
  tweetId: string;
  tweetExternalId: string;
  createdAtTwitter: string;
  url: string;
  text: string;
  authorUsername: string;
  authorVerified: boolean;
  ticker: string;
  horizon: string;
  impactScore: number;
  directionLabel: string;
  rawReturn: number;
  benchmarkReturn: number | null;
  excessReturn: number | null;
  expectedVolatility: number | null;
  volAdjustedReturn: number | null;
  spamScore: number | null;
  credibilityScore: number | null;
  duplicateGroupId: string | null;
};

export class DatasetBuilderService {
  async buildRows(opts?: { limit?: number }) {
    const limit = opts?.limit ?? 5000;
    const outcomes = await prisma.tweetOutcome.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        tweet: {
          include: {
            author: true,
            features: true,
          },
        },
      },
    });

    const rows: TrainingRow[] = outcomes.map((o) => ({
      tweetId: o.tweetId,
      tweetExternalId: o.tweet.externalId,
      createdAtTwitter: o.tweet.createdAtTwitter.toISOString(),
      url: o.tweet.url,
      text: o.tweet.text,
      authorUsername: o.tweet.author.username,
      authorVerified: o.tweet.author.verified,
      ticker: o.ticker,
      horizon: o.horizon,
      impactScore: o.impactScore,
      directionLabel: o.directionLabel,
      rawReturn: o.rawReturn,
      benchmarkReturn: o.benchmarkReturn ?? null,
      excessReturn: o.excessReturn ?? null,
      expectedVolatility: o.expectedVolatility ?? null,
      volAdjustedReturn: o.volAdjustedReturn ?? null,
      spamScore: o.tweet.features?.spamScore ?? null,
      credibilityScore: o.tweet.features?.credibilityScore ?? null,
      duplicateGroupId: o.tweet.features?.duplicateGroupId ?? null,
    }));

    return rows;
  }
}

