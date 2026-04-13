export function computeExpectedVolatility(opts: {
  priceAtTweet: number;
  atr?: number | null;
  realizedVolatility?: number | null;
}): number | null {
  // If provider gives realizedVolatility, prefer it (already normalized).
  if (opts.realizedVolatility != null && Number.isFinite(opts.realizedVolatility) && opts.realizedVolatility > 0) {
    return opts.realizedVolatility;
  }
  // ATR-to-price is a crude proxy for expected move size.
  if (opts.atr != null && Number.isFinite(opts.atr) && opts.atr > 0 && opts.priceAtTweet > 0) {
    return opts.atr / opts.priceAtTweet;
  }
  return null;
}

export function computeVolAdjustedReturn(excessReturn: number | null, expectedVolatility: number | null): number | null {
  if (excessReturn == null) return null;
  if (expectedVolatility == null || !Number.isFinite(expectedVolatility) || expectedVolatility <= 0) {
    // Without a volatility estimate, keep this as "benchmark-adjusted" return.
    return excessReturn;
  }
  return excessReturn / expectedVolatility;
}

