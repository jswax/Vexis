"""
Compute market outcomes for tweets with QQQ-relevant asset matches.

Speed design:
- Collect every unique ticker across the batch.
- Call get_bars_batch() ONCE — one Alpaca API request for all tickers + benchmark.
- The per-tweet loop calls map_tweet_to_pricepoints() (zero API calls) which
  correctly uses floor for base and ceiling for horizons, avoiding bar collapse.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from db.models import MarketSnapshot, Tweet, TweetAssetMatch, TweetOutcome
from log_buffer import log, ts as log_ts
from pipeline.labeling import (
    HORIZONS,
    compute_direction_label,
    compute_excess_return,
    compute_expected_volatility,
    compute_impact_score,
    compute_return,
    compute_vol_adjusted_return,
    resolve_benchmark_ticker,
    scale_expected_volatility_for_horizon,
)
from pipeline.qqq_signal import QQQ_CORE_TICKERS
from prices.alpaca_bars import PricePoint, get_bars_batch, map_tweet_to_pricepoints

_QQQ_ALLOWED: frozenset[str] = frozenset(QQQ_CORE_TICKERS) | frozenset({
    "QQQ", "QQQM", "SPY",
})

BENCH_TICKER = "SPY"


@dataclass
class OutcomeResult:
    provider: str
    scanned: int
    processed: int
    created_outcomes: int
    skipped_no_asset: int
    errors: int
    chunks_completed: int = 1


def _new_id() -> str:
    return str(uuid.uuid4())


def _utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


_EXPECTED_OUTCOMES_PER_TICKER = len(HORIZONS)


def _ordered_tweet_ids_for_compute(
    session: Session,
    limit: int,
    *,
    qqq_only: bool,
    force: bool,
    candidate_cap: int | None = None,
) -> list[str]:
    """
    Tweet IDs to run through the Alpaca labeling loop.

    When force=False: tweets that have at least one QQQ-allowed match and, for
    every such ticker on that tweet, fewer than len(HORIZONS) outcome rows.
    This backfills partial grids (e.g. only M5+D1 from an older run) which would
    otherwise never be selected because the tweet already had some outcomes.
    """
    if force:
        return list(
            session.execute(
                select(Tweet.id)
                .where(Tweet.id.in_(select(TweetAssetMatch.tweet_id)))
                .order_by(Tweet.created_at_twitter.desc())
                .limit(limit)
            ).scalars().all()
        )

    if candidate_cap is None:
        overfetch = min(max(limit * 25, limit), 3000)
    else:
        overfetch = max(limit * 25, min(int(candidate_cap), 500_000))
    candidate_ids = list(
        session.execute(
            select(Tweet.id)
            .where(Tweet.id.in_(select(TweetAssetMatch.tweet_id)))
            .order_by(Tweet.created_at_twitter.desc())
            .limit(overfetch)
        ).scalars().all()
    )
    if not candidate_ids:
        return []

    matches_all = (
        session.execute(
            select(TweetAssetMatch).where(TweetAssetMatch.tweet_id.in_(candidate_ids))
        )
        .scalars()
        .all()
    )
    outcomes_all = (
        session.execute(
            select(TweetOutcome).where(TweetOutcome.tweet_id.in_(candidate_ids))
        )
        .scalars()
        .all()
    )

    allowed_by_tweet: dict[str, set[str]] = {}
    for m in matches_all:
        tk = (m.ticker or "").upper()
        if qqq_only and tk not in _QQQ_ALLOWED:
            continue
        allowed_by_tweet.setdefault(m.tweet_id, set()).add(tk)

    pair_counts: dict[tuple[str, str], int] = {}
    for o in outcomes_all:
        pair_counts[(o.tweet_id, (o.ticker or "").upper())] = (
            pair_counts.get((o.tweet_id, (o.ticker or "").upper()), 0) + 1
        )

    selected: list[str] = []
    for tid in candidate_ids:
        allowed = allowed_by_tweet.get(tid, set())
        if not allowed:
            continue
        if any(pair_counts.get((tid, tk), 0) < _EXPECTED_OUTCOMES_PER_TICKER for tk in allowed):
            selected.append(tid)
        if len(selected) >= limit:
            break
    return selected


def _compute_outcomes_one_chunk(
    session: Session,
    limit: int,
    *,
    qqq_only: bool,
    force: bool,
    candidate_cap: int | None,
) -> OutcomeResult:
    tweet_ids = _ordered_tweet_ids_for_compute(
        session, limit, qqq_only=qqq_only, force=force, candidate_cap=candidate_cap
    )
    if not tweet_ids:
        return OutcomeResult("alpaca", 0, 0, 0, 0, 0, 0)

    id_order = {tid: i for i, tid in enumerate(tweet_ids)}
    tweets = sorted(
        session.execute(select(Tweet).where(Tweet.id.in_(tweet_ids))).scalars().all(),
        key=lambda t: id_order[t.id],
    )

    total = len(tweets)
    processed = 0
    created_outcomes = 0
    skipped_no_asset = 0
    errors = 0

    if not tweets:
        log(f"[{log_ts()}]   outcomes: nothing to process")
        return OutcomeResult("alpaca", 0, 0, 0, 0, 0, 0)

    log(f"[{log_ts()}]   outcomes: {total} tweets to process")

    # ── Step 1: collect all matches and tickers upfront ───────────────────────
    tweet_matches: dict[str, list[TweetAssetMatch]] = {}  # tweet.id -> [TweetAssetMatch]
    all_tickers: set[str] = {BENCH_TICKER}
    tweet_times: list[datetime] = []

    tweet_ids = [t.id for t in tweets]
    matches_all = (
        session.execute(
            select(TweetAssetMatch)
            .where(TweetAssetMatch.tweet_id.in_(tweet_ids))
            .order_by(TweetAssetMatch.tweet_id, TweetAssetMatch.confidence.desc())
        )
        .scalars()
        .all()
    )
    for m in matches_all:
        if qqq_only and (m.ticker or "").upper() not in _QQQ_ALLOWED:
            continue
        tweet_matches.setdefault(m.tweet_id, []).append(m)

    for tweet in tweets:
        matches = tweet_matches.get(tweet.id, [])
        if not matches:
            tweet_matches[tweet.id] = []
            continue
        tweet_times.append(_utc(tweet.created_at_twitter))
        for m in matches:
            all_tickers.add(m.ticker.upper())

    # ── Step 2: ONE batch API call covering the full time window ──────────────
    if not tweet_times:
        return OutcomeResult("alpaca", total, 0, 0, total, 0, 1)

    pad_s = 2 * 60 * 60
    max_horizon_s = max(h["seconds"] for h in HORIZONS)
    start_t = min(tweet_times) - timedelta(seconds=pad_s)
    # Extra slack so D1 and intraday horizons still have a next session print after
    # weekends / overnight gaps (strictly increasing horizon bars need later minutes).
    end_t = max(tweet_times) + timedelta(seconds=max_horizon_s + pad_s) + timedelta(days=2)

    log(
        f"[{log_ts()}]   outcomes: fetching {len(all_tickers)} tickers "
        f"bars {start_t.strftime('%Y-%m-%dT%H:%MZ')} -> {end_t.strftime('%Y-%m-%dT%H:%MZ')} ..."
    )

    try:
        bars_map: dict[str, list[dict]] = get_bars_batch(list(all_tickers), start_t, end_t)
    except Exception as e:
        log(f"[{log_ts()}]   outcomes: batch fetch FAILED: {e}")
        return OutcomeResult("alpaca", total, 0, 0, 0, total, 1)

    log(f"[{log_ts()}]   outcomes: batch done — starting per-tweet labeling")

    # ── Step 3: per-tweet labeling using map_tweet_to_pricepoints ─────────────
    # map_tweet_to_pricepoints uses floor for base and ceiling for horizons,
    # which gives distinct prices for each horizon even when bars are sparse.
    bench_bars = bars_map.get(BENCH_TICKER, [])

    # Bulk-upsert buffers (dramatically faster than per-row executes).
    SNAPSHOT_BATCH = 500
    OUTCOME_BATCH = 2500
    snapshot_rows: list[dict] = []
    outcome_rows: list[dict] = []

    def _flush_snapshots() -> None:
        nonlocal snapshot_rows
        if not snapshot_rows:
            return
        # Postgres can't apply ON CONFLICT DO UPDATE twice to the same target row
        # within a single INSERT statement. If our buffer contains duplicate keys
        # (e.g., multiple matches mapping to the same tweet+ticker), we must
        # collapse them first.
        deduped: dict[tuple[str, str], dict] = {}
        for r in snapshot_rows:
            tweet_id = str(r.get("tweet_id"))
            ticker = str(r.get("ticker") or "").strip().upper()
            r["tweet_id"] = tweet_id
            r["ticker"] = ticker
            deduped[(tweet_id, ticker)] = r  # keep last row for key
        snapshot_rows = list(deduped.values())
        # Upsert by (tweet_id, ticker)
        stmt = (
            pg_insert(MarketSnapshot)
            .values(snapshot_rows)
            .on_conflict_do_update(
                index_elements=["tweet_id", "ticker"],
                set_={
                    "timestamp":         pg_insert(MarketSnapshot).excluded.timestamp,
                    "price":             pg_insert(MarketSnapshot).excluded.price,
                    "volume":            pg_insert(MarketSnapshot).excluded.volume,
                    "vwap":              pg_insert(MarketSnapshot).excluded.vwap,
                    "rsi":               pg_insert(MarketSnapshot).excluded.rsi,
                    "macd":              pg_insert(MarketSnapshot).excluded.macd,
                    "atr":               pg_insert(MarketSnapshot).excluded.atr,
                    "realized_volatility": pg_insert(MarketSnapshot).excluded.realized_volatility,
                    "benchmark_ticker":   pg_insert(MarketSnapshot).excluded.benchmark_ticker,
                    "benchmark_price":    pg_insert(MarketSnapshot).excluded.benchmark_price,
                    "market_open_flag":   pg_insert(MarketSnapshot).excluded.market_open_flag,
                    "session_type":       pg_insert(MarketSnapshot).excluded.session_type,
                    "raw_json":           pg_insert(MarketSnapshot).excluded.raw_json,
                },
            )
        )
        session.execute(stmt)
        snapshot_rows = []

    def _flush_outcomes() -> None:
        nonlocal outcome_rows
        if not outcome_rows:
            return
        # Same issue as snapshots: collapse duplicates within the batch so a
        # single ON CONFLICT target row isn't affected twice.
        deduped: dict[tuple[str, str, str], dict] = {}
        for r in outcome_rows:
            tweet_id = str(r.get("tweet_id"))
            ticker = str(r.get("ticker") or "").strip().upper()
            horizon = str(r.get("horizon") or "").strip().upper()
            r["tweet_id"] = tweet_id
            r["ticker"] = ticker
            r["horizon"] = horizon
            deduped[(tweet_id, ticker, horizon)] = r  # keep last
        outcome_rows = list(deduped.values())
        stmt = (
            pg_insert(TweetOutcome)
            .values(outcome_rows)
            .on_conflict_do_update(
                index_elements=["tweet_id", "ticker", "horizon"],
                set_={
                    "price_at_tweet":       pg_insert(TweetOutcome).excluded.price_at_tweet,
                    "price_at_horizon":     pg_insert(TweetOutcome).excluded.price_at_horizon,
                    "raw_return":           pg_insert(TweetOutcome).excluded.raw_return,
                    "benchmark_return":     pg_insert(TweetOutcome).excluded.benchmark_return,
                    "excess_return":        pg_insert(TweetOutcome).excluded.excess_return,
                    "expected_volatility":  pg_insert(TweetOutcome).excluded.expected_volatility,
                    "vol_adjusted_return":  pg_insert(TweetOutcome).excluded.vol_adjusted_return,
                    "impact_score":         pg_insert(TweetOutcome).excluded.impact_score,
                    "direction_label":      pg_insert(TweetOutcome).excluded.direction_label,
                },
            )
        )
        session.execute(stmt)
        outcome_rows = []

    for i, tweet in enumerate(tweets, 1):
        matches = tweet_matches[tweet.id]

        if not matches:
            skipped_no_asset += 1
            continue

        t0 = _utc(tweet.created_at_twitter)
        horizon_times = [t0 + timedelta(seconds=h["seconds"]) for h in HORIZONS]

        # Benchmark prices for this tweet's time slice (one call per tweet, zero API)
        bench_base, bench_horizon_pps = map_tweet_to_pricepoints(
            bench_bars, t0, horizon_times, symbol=BENCH_TICKER
        )

        for match in matches:
            ticker = match.ticker.upper()
            asset_type = match.asset_type
            ticker_bars = bars_map.get(ticker, [])

            snap, horizon_pps = map_tweet_to_pricepoints(
                ticker_bars, t0, horizon_times, symbol=ticker
            )

            if snap is None:
                log(f"[{log_ts()}]   [{i}/{total}] {ticker} — no base price")
                errors += 1
                continue

            snapshot_rows.append(
                {
                    "id": _new_id(),
                    "tweet_id": tweet.id,
                    "ticker": ticker,
                    "asset_type": asset_type,
                    "timestamp": snap.timestamp,
                    "price": snap.price,
                    "volume": snap.volume,
                    "vwap": snap.vwap,
                    "rsi": snap.rsi,
                    "macd": snap.macd,
                    "atr": snap.atr,
                    "realized_volatility": snap.realized_volatility,
                    "benchmark_ticker": BENCH_TICKER,
                    "benchmark_price": None,
                    "market_open_flag": snap.market_open_flag,
                    "session_type": snap.session_type,
                    "raw_json": snap.raw_json,
                }
            )
            if len(snapshot_rows) >= SNAPSHOT_BATCH:
                _flush_snapshots()

            for h_idx, h in enumerate(HORIZONS):
                horizon = h["horizon"]
                price_at_horizon = horizon_pps[h_idx]

                if price_at_horizon is None:
                    # No usable later print inside the fetched bar window.
                    continue

                raw_return = compute_return(snap.price, price_at_horizon.price)

                benchmark_return = None
                bench_h = bench_horizon_pps[h_idx]
                if bench_base and bench_h:
                    benchmark_return = compute_return(bench_base.price, bench_h.price)

                excess_return  = compute_excess_return(raw_return, benchmark_return)
                expected_vol_1m = compute_expected_volatility(
                    price_at_tweet=snap.price,
                    atr=snap.atr,
                    realized_volatility=snap.realized_volatility,
                )
                expected_vol = scale_expected_volatility_for_horizon(
                    expected_vol_1m,
                    horizon_seconds=h["seconds"],
                )
                vol_adj        = compute_vol_adjusted_return(excess_return, expected_vol)
                impact_score   = compute_impact_score(
                    vol_adj,
                    market_open_flag=snap.market_open_flag,
                    session_type=snap.session_type,
                )
                direction      = compute_direction_label(excess_return, raw_return, horizon=horizon)

                outcome_rows.append(
                    {
                        "id": _new_id(),
                        "tweet_id": tweet.id,
                        "ticker": ticker,
                        "horizon": horizon,
                        "price_at_tweet": snap.price,
                        "price_at_horizon": price_at_horizon.price,
                        "raw_return": raw_return,
                        "benchmark_return": benchmark_return,
                        "excess_return": excess_return,
                        "expected_volatility": expected_vol,
                        "vol_adjusted_return": vol_adj,
                        "impact_score": impact_score,
                        "direction_label": direction,
                    }
                )
                created_outcomes += 1
                # Keep logs light: only print very high-impact outcomes.
                if abs(int(impact_score)) >= 8:
                    log(
                        f"[{log_ts()}]   [{i}/{total}] {ticker}/{horizon} "
                        f"ret={raw_return * 100:+.3f}% "
                        + (
                            f"bench={benchmark_return * 100:+.3f}% "
                            if benchmark_return is not None
                            else ""
                        )
                        + f"impact={impact_score:+d} {direction}"
                    )
                if len(outcome_rows) >= OUTCOME_BATCH:
                    _flush_outcomes()

        processed += 1
        if processed % 25 == 0 or processed == total:
            log(f"[{log_ts()}]   outcomes: {processed}/{total} tweets done "
                f"(outcomes={created_outcomes} errors={errors})")

    # Flush any remaining buffered writes.
    _flush_snapshots()
    _flush_outcomes()

    return OutcomeResult(
        provider="alpaca",
        scanned=total,
        processed=processed,
        created_outcomes=created_outcomes,
        skipped_no_asset=skipped_no_asset,
        errors=errors,
        chunks_completed=1,
    )


def compute_for_unprocessed(
    session: Session,
    limit: int = 50,
    *,
    qqq_only: bool = True,
    force: bool = False,
    run_all: bool = False,
    chunk_size: int = 80,
    candidate_cap_run_all: int = 400_000,
) -> OutcomeResult:
    """
    Compute outcomes for tweets with matches. By default (run_all=False), process
    up to ``limit`` tweets that still need work (no outcomes or incomplete
    horizons per allowed ticker).

    When run_all=True, repeat internal batches of ``chunk_size`` until no such
    tweets remain (scans up to ``candidate_cap_run_all`` newest matched tweets
    per batch to find work). Already-complete tweets are not recomputed unless
    force=True (not exposed on the public API today).
    """
    if not run_all:
        r = _compute_outcomes_one_chunk(
            session, limit, qqq_only=qqq_only, force=force, candidate_cap=None
        )
        if r.scanned == 0:
            log(f"[{log_ts()}]   outcomes: nothing to process (all caught up or no matches)")
        return OutcomeResult(
            provider=r.provider,
            scanned=r.scanned,
            processed=r.processed,
            created_outcomes=r.created_outcomes,
            skipped_no_asset=r.skipped_no_asset,
            errors=r.errors,
            chunks_completed=1 if r.scanned else 0,
        )

    eff_chunk = max(20, min(int(chunk_size), 250))
    agg = OutcomeResult("alpaca", 0, 0, 0, 0, 0, 0)
    n_chunks = 0
    max_chunks = 10_000
    while n_chunks < max_chunks:
        r = _compute_outcomes_one_chunk(
            session,
            eff_chunk,
            qqq_only=qqq_only,
            force=force,
            candidate_cap=candidate_cap_run_all,
        )
        if r.scanned == 0:
            break
        n_chunks += 1
        agg = OutcomeResult(
            provider="alpaca",
            scanned=agg.scanned + r.scanned,
            processed=agg.processed + r.processed,
            created_outcomes=agg.created_outcomes + r.created_outcomes,
            skipped_no_asset=agg.skipped_no_asset + r.skipped_no_asset,
            errors=agg.errors + r.errors,
            chunks_completed=n_chunks,
        )
        log(
            f"[{log_ts()}]   outcomes: run_all chunk {n_chunks} "
            f"(+{r.scanned} tweets, +{r.created_outcomes} outcome rows, cumulative tweets={agg.scanned})"
        )
    if agg.scanned == 0:
        log(f"[{log_ts()}]   outcomes: run_all — nothing to process (all caught up or no matches)")
    else:
        log(f"[{log_ts()}]   outcomes: run_all finished ({n_chunks} chunk(s), {agg.scanned} tweets, {agg.created_outcomes} outcome rows)")
    return OutcomeResult(
        provider=agg.provider,
        scanned=agg.scanned,
        processed=agg.processed,
        created_outcomes=agg.created_outcomes,
        skipped_no_asset=agg.skipped_no_asset,
        errors=agg.errors,
        chunks_completed=n_chunks,
    )
