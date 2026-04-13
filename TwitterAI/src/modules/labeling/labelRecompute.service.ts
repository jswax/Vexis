import { prisma } from '../../db/prisma.js';
import { ImpactScoreService } from './impactScore.service.js';
import { DirectionLabelService } from './directionLabel.service.js';

export class LabelRecomputeService {
  constructor(
    private readonly impact = new ImpactScoreService(),
    private readonly direction = new DirectionLabelService()
  ) {}

  async recomputeAll(opts?: { limit?: number }) {
    const limit = opts?.limit ?? 500;
    const outcomes = await prisma.tweetOutcome.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    let updated = 0;
    for (const o of outcomes) {
      const volAdj =
        o.volAdjustedReturn ??
        (o.excessReturn != null && o.expectedVolatility != null && o.expectedVolatility > 0
          ? o.excessReturn / o.expectedVolatility
          : o.excessReturn);

      const impactScore = this.impact.computeImpactScore(volAdj ?? null);
      const directionLabel = this.direction.computeDirectionLabel(o.excessReturn, o.rawReturn);

      await prisma.tweetOutcome.update({
        where: { id: o.id },
        data: { impactScore, directionLabel },
      });
      updated += 1;
    }

    return { scanned: outcomes.length, updated };
  }
}

