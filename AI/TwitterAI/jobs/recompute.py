"""
Recompute impact_score and direction_label for existing outcomes (e.g. after tuning multipliers).
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from db.models import MarketSnapshot, TweetOutcome
from log_buffer import log, ts
from pipeline.labeling import (
    HORIZONS,
    compute_direction_label,
    compute_expected_volatility,
    compute_impact_score,
    compute_vol_adjusted_return,
    scale_expected_volatility_for_horizon,
)


@dataclass
class RecomputeResult:
    scanned: int
    updated: int


def recompute_all(session: Session, limit: int | None = 500) -> RecomputeResult:
    stmt = select(TweetOutcome).order_by(TweetOutcome.created_at.desc())
    if limit is not None:
        stmt = stmt.limit(limit)
    outcomes = session.execute(stmt).scalars().all()

    updated = 0
    total = len(outcomes)
    if total:
        log(f"[{ts()}]   recompute: processing {total} outcomes...")

    tweet_ids = list({o.tweet_id for o in outcomes})
    snap_map: dict[tuple[str, str], MarketSnapshot] = {}

    def _snap_key(tweet_id: str, ticker: str) -> tuple[str, str]:
        return (tweet_id, (ticker or "").strip().upper())

    if tweet_ids:
        for s in session.execute(
            select(MarketSnapshot).where(MarketSnapshot.tweet_id.in_(tweet_ids))
        ).scalars().all():
            snap_map[_snap_key(s.tweet_id, str(s.ticker))] = s

    for i, o in enumerate(outcomes, 1):
        horizon_seconds = next((h["seconds"] for h in HORIZONS if h["horizon"] == o.horizon), None)

        snap = snap_map.get(_snap_key(o.tweet_id, str(o.ticker)))

        # Re-derive expected volatility from the snapshot so recompute is consistent
        # across legacy rows (where expected_volatility may have been stored with
        # different units/assumptions).
        expected_vol_1m = None
        if snap is not None:
            expected_vol_1m = compute_expected_volatility(
                price_at_tweet=snap.price,
                atr=snap.atr,
                realized_volatility=snap.realized_volatility,
            )
        expected_vol = expected_vol_1m
        if horizon_seconds is not None:
            expected_vol = scale_expected_volatility_for_horizon(
                expected_vol_1m, horizon_seconds=horizon_seconds
            )

        # Keep the column updated so downstream consumers see the tuned value.
        o.expected_volatility = expected_vol

        vol_adj = compute_vol_adjusted_return(o.excess_return, expected_vol)
        o.vol_adjusted_return = vol_adj

        impact_score = compute_impact_score(
            vol_adj,
            market_open_flag=snap.market_open_flag if snap else None,
            session_type=snap.session_type if snap else None,
        )
        direction = compute_direction_label(o.excess_return, o.raw_return, horizon=o.horizon)

        o.impact_score = impact_score
        o.direction_label = direction
        updated += 1

        if i % 250 == 0:
            log(f"[{ts()}]   recompute: progress {i}/{total}")

    session.flush()
    return RecomputeResult(scanned=len(outcomes), updated=updated)
