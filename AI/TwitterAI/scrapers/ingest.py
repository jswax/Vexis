"""
Ingestion service: run a query, normalize, deduplicate, persist to DB with full job lifecycle.

Two-phase design:
  Phase 1 — scrape → normalize → batched upsert authors/tweets/matches/features → commit → job SUCCEEDED
  Phase 2 — run model predictions in a separate session (never blocks job completion)
"""

from __future__ import annotations

import json
import threading
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from db.models import (
    Tweet,
    TweetAssetMatch,
    TweetFeatures,
    TweetIngestionJob,
    TweetPrediction,
    TwitterAuthor,
)
from pipeline.asset_matching import extract_tickers
from pipeline.match_filter import filter_matches_for_ingest
from pipeline.deduper import exact_text_hash, near_dup_hash
from pipeline.feature_scoring import compute_feature_scores
from config import get_settings
from pipeline.qqq_signal import QQQ_CORE_TICKERS, QQQ_TRAINING_MATCH_TICKERS
from log_buffer import log, ts
from scrapers import apify_twitter as twapi
from scrapers.normalizer import NormalizedAuthor, NormalizedBundle, normalize
from scrapers.apify_twitter import IngestQuery, RunResult

_QQQ_ALLOWED: frozenset[str] = frozenset(QQQ_CORE_TICKERS) | frozenset({
    "QQQ", "QQQM", "SPY",
})

# Multi-row INSERT … ON CONFLICT chunk sizes (round-trip vs statement size tradeoff)
UPSERT_CHUNK = 200
PREDICTION_UPSERT_CHUNK = 400


@dataclass
class IngestResult:
    job_id: str
    items_received: int
    items_normalized: int
    items_skipped: int
    tweets_upserted: int
    authors_upserted: int
    asset_matches_created: int
    features_upserted: int
    predictions_created: int = 0
    # Absolute path to JSONL (tweet text + posted_at); None if no tweets after dedupe.
    scrape_export_path: str | None = None


@dataclass
class _PredTarget:
    tweet_id: str
    text: str
    ticker: str
    asset_type: str
    match_method: str
    match_confidence: float
    username: str | None
    author_verified: bool
    followers_count: int | None
    following_count: int | None
    statuses_count: int | None
    spam_score: float | None
    credibility_score: float | None
    is_retweet: bool
    is_reply: bool
    is_quote: bool
    has_images: bool
    has_video: bool
    like_count: int | None
    retweet_count: int | None
    reply_count: int | None
    view_count: int | None
    created_at: datetime | None


def _new_id() -> str:
    return str(uuid.uuid4())


def _create_and_commit_running_job(
    query: IngestQuery,
    *,
    source: str,
    source_label: str | None,
) -> str:
    from db.connection import get_session_factory

    Session = get_session_factory()
    with Session() as session:
        job = TweetIngestionJob(
            id=_new_id(),
            source=source,
            provider="apify",
            status="RUNNING",
            actor_id="kaitoeasyapi/twitter-x-data-tweet-scraper-pay-per-result-cheapest",
            query_config_json={
                "search_terms": query.search_terms,
                "twitter_handles": query.twitter_handles,
                "max_items": query.max_items,
                "source_label": source_label,
            },
            started_at=datetime.now(tz=timezone.utc),
        )
        session.add(job)
        session.commit()
        return job.id


def scrape_export_relpath(job_id: str) -> str:
    """Relative path under AI/TwitterAI/ for the scrape manifest (same path written when tweets exist)."""
    return (Path("exports") / "scrapes" / f"scrape_{job_id}.jsonl").as_posix()


def _write_scrape_tweet_export(job_id: str, bundles: list[NormalizedBundle]) -> str | None:
    """
    Write one JSONL line per tweet after normalize/dedupe: posted time (UTC ISO) and full text.

    Stored under AI/TwitterAI/exports/scrapes/ keyed by ingestion job id.
    """
    if not bundles:
        return None
    exports_dir = Path(__file__).resolve().parent.parent / "exports" / "scrapes"
    exports_dir.mkdir(parents=True, exist_ok=True)
    path = exports_dir / f"scrape_{job_id}.jsonl"
    with path.open("w", encoding="utf-8") as f:
        for b in bundles:
            posted = b.tweet.created_at_twitter
            if posted.tzinfo is None:
                posted = posted.replace(tzinfo=timezone.utc)
            else:
                posted = posted.astimezone(timezone.utc)
            row = {
                "posted_at": posted.isoformat().replace("+00:00", "Z"),
                "text": b.tweet.text,
                "tweet_external_id": b.tweet.external_id,
                "url": b.tweet.url,
                "author_username": b.author.username,
            }
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    return str(path.resolve())


def _tweet_lang_primary_is_en(lang: str | None) -> bool:
    if not lang or not str(lang).strip():
        return False
    primary = str(lang).strip().lower().split("-", 1)[0]
    return primary == "en"


def _gather_bundles(
    raw_items: list[dict[str, Any]],
    *,
    scraped_at: datetime,
    source_label: str | None,
    source_query_type: str | None,
    english_only: bool | None = None,
) -> list[NormalizedBundle]:
    """Normalize Apify items with the same dedupe rules as before (dedupe is CPU-only)."""
    if english_only is None:
        english_only = bool(get_settings().ingest_english_only)
    seen_external_ids: set[str] = set()
    seen_text_hashes: set[str] = set()
    out: list[NormalizedBundle] = []
    skipped_non_en = 0
    for raw in raw_items:
        bundle = normalize(
            raw,
            scraped_at=scraped_at,
            source_query=source_label,
            source_query_type=source_query_type,
        )
        if bundle is None:
            continue
        if english_only and not _tweet_lang_primary_is_en(bundle.tweet.language):
            skipped_non_en += 1
            continue
        if bundle.tweet.external_id in seen_external_ids:
            continue
        seen_external_ids.add(bundle.tweet.external_id)
        text_hash = exact_text_hash(bundle.tweet.text)
        if text_hash in seen_text_hashes:
            continue
        seen_text_hashes.add(text_hash)
        out.append(bundle)
    if skipped_non_en:
        log(f"[{ts()}] ingest: skipped {skipped_non_en} tweet(s) (non-English or missing lang tag)")
    return out


def _author_row(a: NormalizedAuthor) -> dict[str, Any]:
    return {
        "id": _new_id(),
        "external_id": a.external_id,
        "username": a.username,
        "display_name": a.display_name,
        "verified": a.verified,
        "followers_count": a.followers_count,
        "following_count": a.following_count,
        "favourites_count": a.favourites_count,
        "statuses_count": a.statuses_count,
        "raw_json": a.raw_json,
    }


def _bulk_upsert_authors(
    session: Session,
    authors: list[NormalizedAuthor],
) -> dict[str, str]:
    """Upsert authors; return mapping external_id → internal author id."""
    if not authors:
        return {}
    values = [_author_row(a) for a in authors]
    stmt = pg_insert(TwitterAuthor).values(values)
    stmt = stmt.on_conflict_do_update(
        index_elements=["external_id"],
        set_={
            "username": stmt.excluded.username,
            "display_name": stmt.excluded.display_name,
            "verified": stmt.excluded.verified,
            "followers_count": stmt.excluded.followers_count,
            "following_count": stmt.excluded.following_count,
            "raw_json": stmt.excluded.raw_json,
        },
    ).returning(TwitterAuthor.id, TwitterAuthor.external_id)
    rows = session.execute(stmt).all()
    return {str(ext_id): str(i) for i, ext_id in rows}


def _tweet_row(
    bundle: NormalizedBundle,
    *,
    author_id: str,
    text_hash: str,
    dup_hash: str,
) -> dict[str, Any]:
    tw = bundle.tweet
    raw_with_quality = dict(tw.raw_json)
    raw_with_quality["_quality"] = {
        "exact_text_hash": text_hash,
        "near_dup_hash": dup_hash,
    }
    return {
        "id": _new_id(),
        "external_id": tw.external_id,
        "url": tw.url,
        "text": tw.text,
        "raw_json": raw_with_quality,
        "language": tw.language,
        "created_at_twitter": tw.created_at_twitter,
        "scraped_at": tw.scraped_at,
        "source_query": tw.source_query,
        "source_query_type": tw.source_query_type,
        "matched_search_term": tw.matched_search_term,
        "like_count": tw.like_count,
        "retweet_count": tw.retweet_count,
        "reply_count": tw.reply_count,
        "quote_count": tw.quote_count,
        "bookmark_count": tw.bookmark_count,
        "view_count": tw.view_count,
        "is_reply": tw.is_reply,
        "is_retweet": tw.is_retweet,
        "is_quote": tw.is_quote,
        "has_images": tw.has_images,
        "has_video": tw.has_video,
        "author_id": author_id,
    }


def _bulk_upsert_tweets(
    session: Session,
    tweet_values: list[dict[str, Any]],
) -> dict[str, str]:
    """Upsert tweets; return mapping tweet external_id → internal tweet id."""
    if not tweet_values:
        return {}
    stmt = pg_insert(Tweet).values(tweet_values)
    stmt = stmt.on_conflict_do_update(
        index_elements=["external_id"],
        set_={
            "url": stmt.excluded.url,
            "text": stmt.excluded.text,
            "raw_json": stmt.excluded.raw_json,
            "like_count": stmt.excluded.like_count,
            "retweet_count": stmt.excluded.retweet_count,
            "view_count": stmt.excluded.view_count,
        },
    ).returning(Tweet.id, Tweet.external_id)
    rows = session.execute(stmt).all()
    return {str(ext_id): str(tid) for tid, ext_id in rows}


def _bulk_insert_matches(
    session: Session,
    match_values: list[dict[str, Any]],
) -> int:
    if not match_values:
        return 0
    created = 0
    for i in range(0, len(match_values), UPSERT_CHUNK):
        chunk = match_values[i : i + UPSERT_CHUNK]
        stmt = pg_insert(TweetAssetMatch).values(chunk).on_conflict_do_nothing(
            index_elements=["tweet_id", "ticker", "match_method"]
        )
        r = session.execute(stmt)
        created += r.rowcount or 0
    return created


def _bulk_upsert_features(session: Session, feat_values: list[dict[str, Any]]) -> None:
    if not feat_values:
        return
    for i in range(0, len(feat_values), UPSERT_CHUNK):
        chunk = feat_values[i : i + UPSERT_CHUNK]
        stmt = pg_insert(TweetFeatures).values(chunk)
        stmt = stmt.on_conflict_do_update(
            index_elements=["tweet_id"],
            set_={
                "spam_score": stmt.excluded.spam_score,
                "credibility_score": stmt.excluded.credibility_score,
                "duplicate_group_id": stmt.excluded.duplicate_group_id,
            },
        )
        session.execute(stmt)


def flush_prediction_rows_batch(session: Session, rows: list[dict[str, Any]]) -> int:
    if not rows:
        return 0
    # Deduplicate by constraint key so ON CONFLICT DO UPDATE doesn't see the same key twice
    deduped: dict[tuple, dict] = {}
    for row in rows:
        key = (row["tweet_id"], row["ticker"], row["horizon"], row["model_version"])
        deduped[key] = row
    rows = list(deduped.values())
    n = 0
    for i in range(0, len(rows), PREDICTION_UPSERT_CHUNK):
        chunk = rows[i : i + PREDICTION_UPSERT_CHUNK]
        stmt = pg_insert(TweetPrediction).values(chunk)
        stmt = stmt.on_conflict_do_update(
            index_elements=["tweet_id", "ticker", "horizon", "model_version"],
            set_={
                "direction_pred": stmt.excluded.direction_pred,
                "bullish_prob": stmt.excluded.bullish_prob,
                "bearish_prob": stmt.excluded.bearish_prob,
                "neutral_prob": stmt.excluded.neutral_prob,
                "confidence": stmt.excluded.confidence,
            },
        )
        r = session.execute(stmt)
        n += r.rowcount or 0
    return n


def flush_feature_model_summaries_batch(
    session: Session,
    summaries: list[dict[str, Any]],
) -> None:
    if not summaries:
        return
    for i in range(0, len(summaries), UPSERT_CHUNK):
        chunk = summaries[i : i + UPSERT_CHUNK]
        stmt = pg_insert(TweetFeatures).values(chunk)
        stmt = stmt.on_conflict_do_update(
            index_elements=["tweet_id"],
            set_={
                "model_direction_pred": stmt.excluded.model_direction_pred,
                "model_direction_conf": stmt.excluded.model_direction_conf,
                "model_version": stmt.excluded.model_version,
            },
        )
        session.execute(stmt)


# ── Phase 1: scrape + upsert ───────────────────────────────────────────────────

def _execute_ingest_core(
    session: Session,
    job: TweetIngestionJob,
    query: IngestQuery,
    source_label: str | None,
) -> tuple[IngestResult, list[_PredTarget]]:
    """
    Scrape, normalize, and upsert tweet data using batched INSERT … ON CONFLICT
    to minimize DB round-trips. One transaction for Phase 1 (single commit in caller).
    """
    run_result: RunResult = twapi.run_ingest(query)
    scraped_at = datetime.now(tz=timezone.utc)
    total_items = len(run_result.items)
    log(f"[{ts()}] ingest: processing {total_items} scraped items...")

    source_query_type = (
        "searchTerms" if query.search_terms
        else "twitterHandles" if query.twitter_handles
        else None
    )

    bundles = _gather_bundles(
        run_result.items,
        scraped_at=scraped_at,
        source_label=source_label,
        source_query_type=source_query_type,
    )
    items_normalized = len(bundles)
    if items_normalized == 0:
        job.status = "SUCCEEDED"
        job.items_requested = query.max_items
        job.items_received = len(run_result.items)
        job.finished_at = datetime.now(tz=timezone.utc)
        session.flush()
        return (
            IngestResult(
                job_id=job.id,
                items_received=len(run_result.items),
                items_normalized=0,
                items_skipped=len(run_result.items),
                tweets_upserted=0,
                authors_upserted=0,
                asset_matches_created=0,
                features_upserted=0,
                scrape_export_path=None,
            ),
            [],
        )

    scrape_export_path = _write_scrape_tweet_export(job.id, bundles)
    if scrape_export_path:
        log(f"[{ts()}] ingest: scrape export ({len(bundles)} tweets) → {scrape_export_path}")

    pred_targets: list[_PredTarget] = []
    from pipeline.asset_matching import _load_db_seeds

    db_seeds = _load_db_seeds(session)
    ingest_preds = get_settings().ingest_predictions

    # Unique authors (last tweet in ingest wins profile fields — same as repeated upserts before)
    authors_by_ext: dict[str, NormalizedAuthor] = {}
    for b in bundles:
        authors_by_ext[b.author.external_id] = b.author

    unique_authors = list(authors_by_ext.values())
    authors_upserted = len(unique_authors)

    author_id_by_ext: dict[str, str] = {}
    for i in range(0, len(unique_authors), UPSERT_CHUNK):
        chunk = unique_authors[i : i + UPSERT_CHUNK]
        author_id_by_ext.update(_bulk_upsert_authors(session, chunk))

    tweets_upserted = 0
    asset_matches_created = 0
    features_upserted = 0

    for chunk_start in range(0, len(bundles), UPSERT_CHUNK):
        chunk = bundles[chunk_start : chunk_start + UPSERT_CHUNK]

        tweet_values: list[dict[str, Any]] = []
        for b in chunk:
            aid = author_id_by_ext.get(b.author.external_id)
            if aid is None:
                # Should not happen: author upsert returned all keys we needed
                author_id_by_ext.update(_bulk_upsert_authors(session, [b.author]))
                aid = author_id_by_ext[b.author.external_id]
            text_hash = exact_text_hash(b.tweet.text)
            dup_hash = near_dup_hash(b.tweet.text)
            tweet_values.append(_tweet_row(b, author_id=aid, text_hash=text_hash, dup_hash=dup_hash))

        tweet_id_by_ext = _bulk_upsert_tweets(session, tweet_values)

        match_rows: list[dict[str, Any]] = []
        feat_rows: list[dict[str, Any]] = []
        seen_match_keys: set[tuple[str, str, str]] = set()

        for b in chunk:
            tw_ext = b.tweet.external_id
            tweet_id = tweet_id_by_ext.get(tw_ext)
            if not tweet_id:
                continue

            matches = [
                m
                for m in extract_tickers(b.tweet.text, db_seeds=db_seeds)
                if m["ticker"].upper() in _QQQ_ALLOWED
            ]
            matches = filter_matches_for_ingest(b.tweet.text, matches)

            scores = compute_feature_scores(
                text=b.tweet.text,
                like_count=b.tweet.like_count,
                retweet_count=b.tweet.retweet_count,
                reply_count=b.tweet.reply_count,
                is_retweet=b.tweet.is_retweet,
                is_reply=b.tweet.is_reply,
                has_images=b.tweet.has_images,
                has_video=b.tweet.has_video,
                verified=b.author.verified,
                followers_count=b.author.followers_count,
                following_count=b.author.following_count,
                statuses_count=b.author.statuses_count,
            )
            feat_rows.append(
                {
                    "id": _new_id(),
                    "tweet_id": tweet_id,
                    "spam_score": scores["spam_score"],
                    "credibility_score": scores["credibility_score"],
                    "duplicate_group_id": scores["duplicate_group_id"],
                    "embedding_model": None,
                    "model_direction_pred": None,
                    "model_direction_conf": None,
                    "model_version": None,
                }
            )

            for m in matches:
                key = (tweet_id, (m["ticker"] or "").upper(), m["match_method"])
                if key in seen_match_keys:
                    continue
                seen_match_keys.add(key)
                match_rows.append(
                    {
                        "id": _new_id(),
                        "tweet_id": tweet_id,
                        "asset_type": m["asset_type"],
                        "ticker": m["ticker"],
                        "confidence": m["confidence"],
                        "match_method": m["match_method"],
                    }
                )

            train_matches = [
                m
                for m in matches
                if (m.get("ticker") or "").upper() in QQQ_TRAINING_MATCH_TICKERS
            ]
            if ingest_preds and train_matches:
                # One QQQ-labelled prediction per tweet; feature vector uses best
                # top-holding / QQQ ETF match; rows are stored with ticker QQQ.
                best = max(train_matches, key=lambda x: float(x["confidence"]))
                pred_targets.append(
                    _PredTarget(
                        tweet_id=tweet_id,
                        text=b.tweet.text,
                        ticker=best["ticker"],
                        asset_type=best["asset_type"],
                        match_method=best["match_method"],
                        match_confidence=best["confidence"],
                        username=b.author.username,
                        author_verified=b.author.verified,
                        followers_count=b.author.followers_count,
                        following_count=b.author.following_count,
                        statuses_count=b.author.statuses_count,
                        spam_score=scores["spam_score"],
                        credibility_score=scores["credibility_score"],
                        is_retweet=b.tweet.is_retweet,
                        is_reply=b.tweet.is_reply,
                        is_quote=b.tweet.is_quote,
                        has_images=b.tweet.has_images,
                        has_video=b.tweet.has_video,
                        like_count=b.tweet.like_count,
                        retweet_count=b.tweet.retweet_count,
                        reply_count=b.tweet.reply_count,
                        view_count=b.tweet.view_count,
                        created_at=b.tweet.created_at_twitter,
                    )
                )

        asset_matches_created += _bulk_insert_matches(session, match_rows)
        _bulk_upsert_features(session, feat_rows)
        features_upserted += len(feat_rows)
        tweets_upserted += len(chunk)

        done = chunk_start + len(chunk)
        if done % 50 == 0 or done == len(bundles) or chunk_start == 0:
            log(f"[{ts()}] ingest: {done}/{len(bundles)} tweets flushed to DB")

    job.status = "SUCCEEDED"
    job.items_requested = query.max_items
    job.items_received = len(run_result.items)
    job.finished_at = datetime.now(tz=timezone.utc)
    session.flush()

    result = IngestResult(
        job_id=job.id,
        items_received=len(run_result.items),
        items_normalized=items_normalized,
        items_skipped=len(run_result.items) - items_normalized,
        tweets_upserted=tweets_upserted,
        authors_upserted=authors_upserted,
        asset_matches_created=asset_matches_created,
        features_upserted=features_upserted,
        scrape_export_path=scrape_export_path,
    )
    return result, pred_targets


# ── Phase 2: predictions (separate session, never blocks job status) ───────────

def _run_predictions(targets: list[_PredTarget]) -> int:
    if not targets:
        return 0

    try:
        from inference.model import get_predictor

        predictor = get_predictor()
    except Exception:
        return 0

    if not predictor.is_ready:
        return 0

    from db.connection import get_session_factory

    Session = get_session_factory()
    predictions_created = 0

    try:
        with Session() as session:
            pred_buffer: list[dict[str, Any]] = []
            # Last D1 summary per tweet_id mirrors per-target sequential updates
            feat_summary_by_tweet: dict[str, tuple[str, float, str]] = {}

            for t in targets:
                try:
                    horizon_preds = predictor.predict_all_horizons(
                        text=t.text,
                        ticker=t.ticker,
                        asset_type=t.asset_type,
                        match_method=t.match_method,
                        match_confidence=t.match_confidence,
                        username=t.username,
                        author_verified=t.author_verified,
                        followers_count=t.followers_count,
                        following_count=t.following_count,
                        statuses_count=t.statuses_count,
                        spam_score=t.spam_score,
                        credibility_score=t.credibility_score,
                        is_retweet=t.is_retweet,
                        is_reply=t.is_reply,
                        is_quote=t.is_quote,
                        has_images=t.has_images,
                        has_video=t.has_video,
                        like_count=t.like_count,
                        retweet_count=t.retweet_count,
                        reply_count=t.reply_count,
                        view_count=t.view_count,
                        created_at=t.created_at,
                    )
                except Exception:
                    continue

                d1_direction: str | None = None
                d1_conf: float | None = None
                model_ver: str | None = None

                for hp in horizon_preds:
                    pred_buffer.append(
                        {
                            "id": _new_id(),
                            "tweet_id": t.tweet_id,
                            "ticker": "QQQ",
                            "horizon": hp.horizon,
                            "model_version": hp.model_version,
                            "direction_pred": hp.direction,
                            "bullish_prob": hp.bullish_prob,
                            "bearish_prob": hp.bearish_prob,
                            "neutral_prob": hp.neutral_prob,
                            "confidence": hp.confidence,
                        }
                    )
                    if hp.horizon == "D1" and d1_direction is None:
                        d1_direction = hp.direction
                        d1_conf = hp.confidence
                        model_ver = hp.model_version

                if d1_direction is not None and d1_conf is not None and model_ver is not None:
                    feat_summary_by_tweet[t.tweet_id] = (d1_direction, d1_conf, model_ver)

                if len(pred_buffer) >= PREDICTION_UPSERT_CHUNK:
                    predictions_created += flush_prediction_rows_batch(session, pred_buffer)
                    pred_buffer.clear()

            predictions_created += flush_prediction_rows_batch(session, pred_buffer)

            feat_values = [
                {
                    "id": _new_id(),
                    "tweet_id": tid,
                    "model_direction_pred": d,
                    "model_direction_conf": c,
                    "model_version": v,
                }
                for tid, (d, c, v) in feat_summary_by_tweet.items()
            ]
            flush_feature_model_summaries_batch(session, feat_values)

            session.commit()
    except Exception as exc:
        log(f"[ingest] prediction phase error: {exc!r}")

    return predictions_created


# ── Public entry points ────────────────────────────────────────────────────────

def run(
    query: IngestQuery,
    *,
    source: str = "api",
    source_label: str | None = None,
) -> IngestResult:
    from db.connection import get_session_factory

    job_id = _create_and_commit_running_job(query, source=source, source_label=source_label)
    Session = get_session_factory()
    with Session() as session:
        job = session.get(TweetIngestionJob, job_id)
        if not job:
            raise RuntimeError("ingest job missing after create")
        try:
            result, pred_targets = _execute_ingest_core(session, job, query, source_label)
            session.commit()  # job → SUCCEEDED, tweets visible
        except Exception as exc:
            session.rollback()
            job = session.get(TweetIngestionJob, job_id)
            if job:
                job.status = "FAILED"
                job.error_message = str(exc)[:12000]
                job.finished_at = datetime.now(tz=timezone.utc)
                session.commit()
            raise

    # Phase 2: predictions in a separate session (non-blocking for callers that don't care)
    result.predictions_created = _run_predictions(pred_targets)
    return result


def start_background_ingest(
    query: IngestQuery,
    *,
    source: str = "api",
    source_label: str | None = None,
    on_done: Callable[[], None] | None = None,
) -> str:
    job_id = _create_and_commit_running_job(query, source=source, source_label=source_label)

    def worker() -> None:
        from db.connection import get_session_factory

        Session = get_session_factory()
        pred_targets: list[_PredTarget] = []
        try:
            with Session() as session:
                job = session.get(TweetIngestionJob, job_id)
                if not job:
                    return
                _, pred_targets = _execute_ingest_core(session, job, query, source_label)
                session.commit()  # job → SUCCEEDED immediately
        except Exception as exc:
            log(f"[{ts()}] background ingest FAILED job={job_id}: {exc!r}")
            try:
                with Session() as session:
                    job = session.get(TweetIngestionJob, job_id)
                    if job:
                        job.status = "FAILED"
                        job.error_message = str(exc)[:12000]
                        job.finished_at = datetime.now(tz=timezone.utc)
                        session.commit()
            except Exception as exc2:
                log(f"[{ts()}] could not persist FAILED for job={job_id}: {exc2!r}")
        finally:
            if on_done is not None:
                on_done()

        # Phase 2 runs after on_done so the lock is released and the UI shows SUCCEEDED
        if pred_targets:
            log(f"[{ts()}] ingest predictions phase: {len(pred_targets)} targets")
            _run_predictions(pred_targets)
            log(f"[{ts()}] ingest predictions phase done")

    threading.Thread(target=worker, daemon=True).start()
    return job_id
