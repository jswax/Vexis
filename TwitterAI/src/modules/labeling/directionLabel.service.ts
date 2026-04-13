import type { DirectionLabel } from '@prisma/client';

export class DirectionLabelService {
  // A small dead-zone reduces noise for tiny moves.
  // Tune later based on empirical distribution of excess returns.
  private readonly threshold = 0.002; // 20 bps

  computeDirectionLabel(excessReturn: number | null, rawReturn: number): DirectionLabel {
    const r = excessReturn ?? rawReturn;
    if (!Number.isFinite(r)) return 'NEUTRAL';
    if (r >= this.threshold) return 'BULLISH';
    if (r <= -this.threshold) return 'BEARISH';
    return 'NEUTRAL';
  }
}

