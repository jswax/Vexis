import { env } from '../../config/env.js';

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export class ImpactScoreService {
  computeImpactScore(volAdjustedReturn: number | null): number {
    if (volAdjustedReturn == null || !Number.isFinite(volAdjustedReturn)) return 0;
    const scaled = volAdjustedReturn * env.IMPACT_SCORE_MULTIPLIER;
    const rounded = Math.round(scaled);
    return clamp(rounded, -10, 10);
  }
}

