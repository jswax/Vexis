"""
Recompute impact_score and direction_label for existing outcomes (e.g. after tuning multipliers).
"""

from __future__ import annotations

import time
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from db.models import TweetOutcome
from log_buffer import log, ts
from pipeline.labeling import (
    compute_direction_label,
    compute_impact_score,
    compute_vol_adjusted_return,
)


@dataclass
class RecomputeResult:
    scanned: int
    updated: int


def recompute_all(session: Session, limit: int = 500) -> RecomputeResult:
    outcomes = (
        session.execute(
            select(TweetOutcome)
            .order_by(TweetOutcome.created_at.desc())
            .limit(limit)
        )
        .scalars()
        .all()
    )

    updated = 0
    total = len(outcomes)
    if total:
        log(f"[{ts()}]   recompute: processing {total} outcomes...")

    for i, o in enumerate(outcomes, 1):
        vol_adj = o.vol_adjusted_return
        if vol_adj is None and o.excess_return is not None:
            vol_adj = compute_vol_adjusted_return(o.excess_return, o.expected_volatility)

        impact_score = compute_impact_score(vol_adj)
        direction = compute_direction_label(o.excess_return, o.raw_return)

        o.impact_score = impact_score
        o.direction_label = direction
        updated += 1

        if i % 250 == 0:
            log(f"[{ts()}]   recompute: progress {i}/{total}")

    session.flush()
    return RecomputeResult(scanned=len(outcomes), updated=updated)
