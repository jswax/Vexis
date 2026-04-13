import type { AssetType } from '@prisma/client';
import { env } from '../../config/env.js';

export function resolveBenchmarkTicker(assetType: AssetType): string {
  switch (assetType) {
    case 'CRYPTO':
      return env.DEFAULT_BENCHMARK_CRYPTO;
    case 'STOCK':
    case 'ETF':
    case 'INDEX':
      return env.DEFAULT_BENCHMARK_STOCK;
    default:
      return env.DEFAULT_BENCHMARK_STOCK;
  }
}

