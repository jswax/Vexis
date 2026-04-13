export function computeReturn(price0: number, price1: number): number {
  if (!Number.isFinite(price0) || !Number.isFinite(price1) || price0 <= 0) return 0;
  return price1 / price0 - 1;
}

export function computeExcessReturn(rawReturn: number, benchmarkReturn: number | null): number | null {
  if (benchmarkReturn == null) return null;
  return rawReturn - benchmarkReturn;
}

