"""
Compute market outcomes for tweets that have asset matches but no outcomes yet.
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from db.models import MarketSnapshot, Tweet, TweetAssetMatch, TweetOutcome
from pipeline.labeling import (
    HORIZONS,
    compute_direction_label,
    compute_excess_return,
    compute_expected_volatility,
    compute_impact_score,
    compute_return,
    compute_vol_adjusted_return,
    resolve_benchmark_ticker,
)
from prices.alpaca_bars import get_prices_for_timestamps
from log_buffer import log, ts
from pipeline.qqq_signal import QQQ_CORE_TICKERS


@dataclass
class OutcomeResult:
    provider: str
    scanned: int
    processed: int
    created_outcomes: int
    skipped_no_asset: int
    errors: int


def _new_id() -> str:
    return str(uuid.uuid4())


def compute_for_unprocessed(session: Session, limit: int = 50, *, qqq_only: bool = True) -> OutcomeResult:
    # Tweets that have asset matches but zero outcomes
    subq_matches = select(TweetAssetMatch.tweet_id).correlate(Tweet)
    subq_outcomes = select(TweetOutcome.tweet_id).correlate(Tweet)

    tweets = (
        session.execute(
            select(Tweet)
            .where(Tweet.id.in_(select(TweetAssetMatch.tweet_id)))
            .where(Tweet.id.not_in(select(TweetOutcome.tweet_id)))
            .order_by(Tweet.created_at_twitter.desc())
            .limit(limit)
        )
        .scalars()
        .all()
    )

    processed = 0
    created_outcomes = 0
    skipped_no_asset = 0
    errors = 0
    total = len(tweets)

    log(f"[{ts()}]   outcomes: processing {total} tweets...")

    for i, tweet in enumerate(tweets, 1):
        matches = (
            session.execute(
                select(TweetAssetMatch)
                .where(TweetAssetMatch.tweet_id == tweet.id)
                .order_by(TweetAssetMatch.confidence.desc())
            )
            .scalars()
            .all()
        )

        if not matches:
            skipped_no_asset += 1
            continue

        if qqq_only:
            matches = [
                m
                for m in matches
                if (m.ticker or "").upper() in QQQ_CORE_TICKERS
                or (m.ticker or "").upper() in ("QQQ", "NDX")
            ]
            if not matches:
                skipped_no_asset += 1
                continue

        for match in matches:
            ticker = match.ticker
            asset_type = match.asset_type
            benchmark_ticker = resolve_benchmark_ticker(asset_type)

            log(f"[{ts()}]   [{i}/{total}] {ticker} — fetching snapshot...")

            # Batch-fetch all required timestamps once per ticker and benchmark.
            try:
                t0 = tweet.created_at_twitter
                horizon_times = [t0 + timedelta(seconds=h["seconds"]) for h in HORIZONS]
                ts_all = [t0, *horizon_times]

                px = get_prices_for_timestamps(ticker, asset_type, ts_all)

                bench_asset = "CRYPTO" if asset_type == "CRYPTO" else "ETF"
                bpx = get_prices_for_timestamps(benchmark_ticker, bench_asset, ts_all)

                snap = px[t0]
            except Exception as e:
                log(f"[{ts()}]   [{i}/{total}] {ticker} — snapshot error: {e}")
                errors += 1
                continue

            # Upsert snapshot
            session.execute(
                pg_insert(MarketSnapshot)
                .values(
                    id=_new_id(),
                    tweet_id=tweet.id,
                    ticker=ticker,
                    asset_type=asset_type,
                    timestamp=snap.timestamp,
                    price=snap.price,
                    volume=snap.volume,
                    vwap=snap.vwap,
                    rsi=snap.rsi,
                    macd=snap.macd,
                    atr=snap.atr,
                    realized_volatility=snap.realized_volatility,
                    benchmark_ticker=benchmark_ticker,
                    benchmark_price=None,
                    market_open_flag=snap.market_open_flag,
                    session_type=snap.session_type,
                    raw_json=snap.raw_json,
                )
                .on_conflict_do_update(
                    index_elements=["tweet_id", "ticker"],
                    set_={"price": snap.price, "raw_json": snap.raw_json},
                )
            )

            for h in HORIZONS:
                horizon = h["horizon"]
                horizon_time = tweet.created_at_twitter + timedelta(seconds=h["seconds"])

                # Skip if outcome already exists
                existing = session.execute(
                    select(TweetOutcome).where(
                        TweetOutcome.tweet_id == tweet.id,
                        TweetOutcome.ticker == ticker,
                        TweetOutcome.horizon == horizon,
                    )
                ).scalar_one_or_none()
                if existing:
                    continue

                price_at_horizon = px.get(horizon_time)
                if not price_at_horizon:
                    # Keep output light; errors are common with missing entitlements/timestamps.
                    if errors % 10 == 0:
                        log(f"[{ts()}]   [{i}/{total}] {ticker} — horizon fetch errors so far: {errors}")
                    errors += 1
                    continue

                raw_return = compute_return(snap.price, price_at_horizon.price)

                benchmark_return = None
                try:
                    b0 = bpx.get(tweet.created_at_twitter)
                    b1 = bpx.get(horizon_time)
                    if b0 and b1:
                        benchmark_return = compute_return(b0.price, b1.price)
                except Exception:
                    pass

                excess_return = compute_excess_return(raw_return, benchmark_return)
                expected_vol = compute_expected_volatility(
                    price_at_tweet=snap.price,
                    atr=snap.atr,
                    realized_volatility=snap.realized_volatility,
                )
                vol_adj = compute_vol_adjusted_return(excess_return, expected_vol)
                impact_score = compute_impact_score(vol_adj)
                direction = compute_direction_label(excess_return, raw_return)

                session.execute(
                    pg_insert(TweetOutcome)
                    .values(
                        id=_new_id(),
                        tweet_id=tweet.id,
                        ticker=ticker,
                        horizon=horizon,
                        price_at_tweet=snap.price,
                        price_at_horizon=price_at_horizon.price,
                        raw_return=raw_return,
                        benchmark_return=benchmark_return,
                        excess_return=excess_return,
                        expected_volatility=expected_vol,
                        vol_adjusted_return=vol_adj,
                        impact_score=impact_score,
                        direction_label=direction,
                    )
                    .on_conflict_do_update(
                        index_elements=["tweet_id", "ticker", "horizon"],
                        set_={
                            "price_at_tweet": snap.price,
                            "price_at_horizon": price_at_horizon.price,
                            "raw_return": raw_return,
                            "benchmark_return": benchmark_return,
                            "excess_return": excess_return,
                            "expected_volatility": expected_vol,
                            "vol_adjusted_return": vol_adj,
                            "impact_score": impact_score,
                            "direction_label": direction,
                        },
                    )
                )
                created_outcomes += 1

        processed += 1
        if processed % 5 == 0:
            log(
                f"[{ts()}]   outcomes: progress {processed}/{total} tweets "
                f"(created={created_outcomes}, errors={errors})"
            )

    return OutcomeResult(
        provider="alpaca",
        scanned=len(tweets),
        processed=processed,
        created_outcomes=created_outcomes,
        skipped_no_asset=skipped_no_asset,
        errors=errors,
    )
