import type { AssetType, OutcomeHorizon } from '@prisma/client';

export type PricePoint = {
  timestamp: Date;
  price: number;
  volume?: number | null;
  vwap?: number | null;
  rsi?: number | null;
  macd?: number | null;
  atr?: number | null;
  realizedVolatility?: number | null;
  marketOpenFlag: boolean;
  sessionType?: string | null;
  rawJson: unknown;
};

export type MarketDataProvider = {
  name: string;
  getNearestPrice(opts: { ticker: string; assetType: AssetType; timestamp: Date }): Promise<PricePoint>;
};

export const HORIZONS: { horizon: OutcomeHorizon; ms: number }[] = [
  { horizon: 'M5', ms: 5 * 60 * 1000 },
  { horizon: 'M15', ms: 15 * 60 * 1000 },
  { horizon: 'H1', ms: 60 * 60 * 1000 },
  { horizon: 'H4', ms: 4 * 60 * 60 * 1000 },
  { horizon: 'D1', ms: 24 * 60 * 60 * 1000 },
];

