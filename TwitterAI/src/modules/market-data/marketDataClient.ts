import type { AssetType } from '@prisma/client';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/errors.js';
import type { MarketDataProvider, PricePoint } from './marketData.types.js';
import { AlpacaMarketDataProvider } from './providers/alpacaMarketDataProvider.js';

class NoneMarketDataProvider implements MarketDataProvider {
  name = 'none';
  async getNearestPrice(_opts: { ticker: string; assetType: AssetType; timestamp: Date }): Promise<PricePoint> {
    throw new AppError({
      statusCode: 400,
      code: 'MARKET_DATA_PROVIDER_NOT_CONFIGURED',
      message:
        'MARKET_DATA_PROVIDER is not configured. Set MARKET_DATA_PROVIDER to a real provider and implement the adapter in src/modules/market-data.',
      details: {
        configured: env.MARKET_DATA_PROVIDER,
      },
    });
  }
}

export function getMarketDataProvider(): MarketDataProvider {
  // TODO: Add adapters here (Polygon, Alpaca, Binance, Yahoo, etc.).
  // Keep interface stable so the labeling pipeline does not change.
  const provider = env.MARKET_DATA_PROVIDER.toLowerCase();
  switch (provider) {
    case 'alpaca':
      return new AlpacaMarketDataProvider();
    case 'none':
      return new NoneMarketDataProvider();
    default:
      return new NoneMarketDataProvider();
  }
}

