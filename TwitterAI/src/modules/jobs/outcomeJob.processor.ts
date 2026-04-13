import type { AssetType, OutcomeHorizon } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { getMarketDataProvider } from '../market-data/marketDataClient.js';
import { SnapshotBuilder } from '../market-data/snapshotBuilder.js';
import { HORIZONS } from '../market-data/marketData.types.js';
import { computeExcessReturn, computeReturn } from '../market-data/returnCalculator.js';
import { computeExpectedVolatility, computeVolAdjustedReturn } from '../market-data/volatilityCalculator.js';
import { ImpactScoreService } from '../labeling/impactScore.service.js';
import { DirectionLabelService } from '../labeling/directionLabel.service.js';
import { resolveBenchmarkTicker } from '../market-data/benchmarkResolver.js';

export class OutcomeJobProcessor {
  private readonly snapshotBuilder = new SnapshotBuilder();
  private readonly impact = new ImpactScoreService();
  private readonly direction = new DirectionLabelService();

  async computeForUnprocessedTweets(opts?: { limit?: number }) {
    const limit = opts?.limit ?? 50;
    const provider = getMarketDataProvider();

    // Only fetch tweets that have asset matches but are missing at least one outcome.
    // Tweets without any asset matches are not processable; fully-labeled tweets are skipped.
    const tweets = await prisma.tweet.findMany({
      take: limit,
      where: {
        assetMatches: { some: {} },
        outcomes: { none: {} },
      },
      orderBy: { createdAtTwitter: 'desc' },
      include: {
        assetMatches: { orderBy: { confidence: 'desc' } },
        outcomes: true,
        marketSnapshots: true,
      },
    });

    let processed = 0;
    let createdOutcomes = 0;
    let skippedNoAsset = 0;
    let errors = 0;

    for (const tweet of tweets) {
      if (!tweet.assetMatches.length) {
        skippedNoAsset += 1;
        continue;
      }

      // Process every asset match on the tweet, not just the top one.
      // A tweet mentioning $TSLA and $NVDA should get outcomes for both.
      for (const match of tweet.assetMatches) {
        const ticker = match.ticker;
        const assetType = match.assetType as AssetType;
        const benchmarkTicker = resolveBenchmarkTicker(assetType);

        let snapshot: Awaited<ReturnType<typeof this.snapshotBuilder.buildAndStoreSnapshot>>['snapshot'];
        try {
          const result = await this.snapshotBuilder.buildAndStoreSnapshot({
            tweetId: tweet.id,
            ticker,
            assetType,
            timestamp: tweet.createdAtTwitter,
          });
          snapshot = result.snapshot;
        } catch {
          // Market data unavailable for this ticker at this timestamp; skip.
          errors += 1;
          continue;
        }

        for (const h of HORIZONS) {
          const horizon = h.horizon as OutcomeHorizon;
          const exists = tweet.outcomes.find((o) => o.ticker === ticker && o.horizon === horizon);
          if (exists) continue;

          const horizonTime = new Date(tweet.createdAtTwitter.getTime() + h.ms);
          const priceAtTweet = snapshot.price;

          let priceAtHorizonPoint: Awaited<ReturnType<typeof provider.getNearestPrice>>;
          try {
            priceAtHorizonPoint = await provider.getNearestPrice({
              ticker,
              assetType,
              timestamp: horizonTime,
            });
          } catch {
            errors += 1;
            continue;
          }

          const rawReturn = computeReturn(priceAtTweet, priceAtHorizonPoint.price);

          let benchmarkReturn: number | null = null;
          try {
            const bench0 = await provider.getNearestPrice({
              ticker: benchmarkTicker,
              assetType: assetType === 'CRYPTO' ? 'CRYPTO' : 'ETF',
              timestamp: tweet.createdAtTwitter,
            });
            const bench1 = await provider.getNearestPrice({
              ticker: benchmarkTicker,
              assetType: assetType === 'CRYPTO' ? 'CRYPTO' : 'ETF',
              timestamp: horizonTime,
            });
            benchmarkReturn = computeReturn(bench0.price, bench1.price);
          } catch {
            benchmarkReturn = null;
          }

          const excessReturn = computeExcessReturn(rawReturn, benchmarkReturn);
          const expectedVolatility = computeExpectedVolatility({
            priceAtTweet,
            atr: snapshot.atr,
            realizedVolatility: snapshot.realizedVolatility,
          });
          const volAdjustedReturn = computeVolAdjustedReturn(excessReturn, expectedVolatility);

          const impactScore = this.impact.computeImpactScore(volAdjustedReturn);
          const directionLabel = this.direction.computeDirectionLabel(excessReturn, rawReturn);

          await prisma.tweetOutcome.upsert({
            where: { tweetId_ticker_horizon: { tweetId: tweet.id, ticker, horizon } },
            update: {
              priceAtTweet,
              priceAtHorizon: priceAtHorizonPoint.price,
              rawReturn,
              benchmarkReturn: benchmarkReturn ?? undefined,
              excessReturn: excessReturn ?? undefined,
              expectedVolatility: expectedVolatility ?? undefined,
              volAdjustedReturn: volAdjustedReturn ?? undefined,
              impactScore,
              directionLabel,
            },
            create: {
              tweetId: tweet.id,
              ticker,
              horizon,
              priceAtTweet,
              priceAtHorizon: priceAtHorizonPoint.price,
              rawReturn,
              benchmarkReturn: benchmarkReturn ?? undefined,
              excessReturn: excessReturn ?? undefined,
              expectedVolatility: expectedVolatility ?? undefined,
              volAdjustedReturn: volAdjustedReturn ?? undefined,
              impactScore,
              directionLabel,
            },
          });
          createdOutcomes += 1;
        }
      }

      processed += 1;
    }

    return {
      provider: provider.name,
      scanned: tweets.length,
      processed,
      createdOutcomes,
      skippedNoAsset,
      errors,
    };
  }
}

