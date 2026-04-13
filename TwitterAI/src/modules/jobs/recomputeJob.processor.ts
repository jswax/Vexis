import { LabelRecomputeService } from '../labeling/labelRecompute.service.js';

export class RecomputeJobProcessor {
  constructor(private readonly svc = new LabelRecomputeService()) {}

  async run(opts?: { limit?: number }) {
    return this.svc.recomputeAll({ limit: opts?.limit });
  }
}

