import { Prisma, type AssetType } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { getMarketDataProvider } from './marketDataClient.js';
import type { PricePoint } from './marketData.types.js';
import { resolveBenchmarkTicker } from './benchmarkResolver.js';

export class SnapshotBuilder {
  async buildAndStoreSnapshot(opts: { tweetId: string; ticker: string; assetType: AssetType; timestamp: Date }) {
    const provider = getMarketDataProvider();
    const snap = await provider.getNearestPrice({
      ticker: opts.ticker,
      assetType: opts.assetType,
      timestamp: opts.timestamp,
    });

    const benchmarkTicker = resolveBenchmarkTicker(opts.assetType);
    let benchmark: PricePoint | null = null;
    try {
      benchmark = await provider.getNearestPrice({
        ticker: benchmarkTicker,
        assetType: opts.assetType === 'CRYPTO' ? 'CRYPTO' : 'ETF',
        timestamp: opts.timestamp,
      });
    } catch {
      benchmark = null;
    }

    const row = await prisma.marketSnapshot.upsert({
      where: {
        tweetId_ticker: {
          tweetId: opts.tweetId,
          ticker: opts.ticker,
        },
      },
      update: {
        assetType: opts.assetType,
        timestamp: snap.timestamp,
        price: snap.price,
        volume: snap.volume ?? undefined,
        vwap: snap.vwap ?? undefined,
        rsi: snap.rsi ?? undefined,
        macd: snap.macd ?? undefined,
        atr: snap.atr ?? undefined,
        realizedVolatility: snap.realizedVolatility ?? undefined,
        benchmarkTicker: benchmark ? benchmarkTicker : undefined,
        benchmarkPrice: benchmark ? benchmark.price : undefined,
        marketOpenFlag: snap.marketOpenFlag,
        sessionType: snap.sessionType ?? undefined,
        rawJson: snap.rawJson as Prisma.InputJsonValue,
      },
      create: {
        tweetId: opts.tweetId,
        ticker: opts.ticker,
        assetType: opts.assetType,
        timestamp: snap.timestamp,
        price: snap.price,
        volume: snap.volume ?? undefined,
        vwap: snap.vwap ?? undefined,
        rsi: snap.rsi ?? undefined,
        macd: snap.macd ?? undefined,
        atr: snap.atr ?? undefined,
        realizedVolatility: snap.realizedVolatility ?? undefined,
        benchmarkTicker: benchmark ? benchmarkTicker : undefined,
        benchmarkPrice: benchmark ? benchmark.price : undefined,
        marketOpenFlag: snap.marketOpenFlag,
        sessionType: snap.sessionType ?? undefined,
        rawJson: snap.rawJson as Prisma.InputJsonValue,
      },
    });

    return { snapshot: row, benchmarkAtTweet: benchmark };
  }
}

