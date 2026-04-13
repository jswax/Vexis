import type { DirectionLabel, OutcomeHorizon } from '@prisma/client';

export type LabelInputs = {
  horizon: OutcomeHorizon;
  rawReturn: number;
  benchmarkReturn: number | null;
  excessReturn: number | null;
  expectedVolatility: number | null;
  volAdjustedReturn: number | null;
};

export type LabelResult = {
  impactScore: number;
  directionLabel: DirectionLabel;
};

