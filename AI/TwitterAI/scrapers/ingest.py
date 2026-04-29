"""
Ingestion service: run a query, normalize, deduplicate, persist to DB with full job lifecycle.
"""

from __future__ import annotations

import threading
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from db.models import (
    AssetAlias,
    MarketSnapshot,
    Tweet,
    TweetAssetMatch,
    TweetFeatures,
    TweetIngestionJob,
    TweetOutcome,
    TweetPrediction,
    TwitterAuthor,
)
from pipeline.asset_matching import extract_tickers
from pipeline.match_filter import filter_matches_for_ingest
from pipeline.deduper import exact_text_hash, near_dup_hash
from pipeline.feature_scoring import compute_feature_scores
from config import get_settings
from pipeline.qqq_signal import QQQ_CORE_TICKERS
from log_buffer import log, ts
from scrapers import twitterapiio as twapi
from scrapers.normalizer import normalize
from scrapers.twitterapiio import IngestQuery, RunResult

# Only track tickers that are part of QQQ / directly affect it.
# Non-QQQ tickers are silently dropped at the asset-match stage.
_QQQ_ALLOWED: frozenset[str] = frozenset(QQQ_CORE_TICKERS) | frozenset({
    "QQQ", "QQQM", "SPY",
})


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
            provider="twitterapi.io",
            status="RUNNING",
            actor_id="twitterapi.io",
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


def _execute_ingest_core(
    session: Session,
    job: TweetIngestionJob,
    query: IngestQuery,
    source_label: str | None,
) -> IngestResult:
    run_result: RunResult = twapi.run_ingest(query)
    scraped_at = datetime.now(tz=timezone.utc)

    items_normalized = 0
    tweets_upserted = 0
    authors_upserted = 0
    asset_matches_created = 0
    features_upserted = 0
    predictions_created = 0

    # Optional: skip model I/O during large ingests (use backfill-predictions after).
    predictor = None
    if get_settings().ingest_predictions:
        try:
            from inference.model import get_predictor

            predictor = get_predictor()
        except Exception:
            predictor = None

    seen_external_ids: set[str] = set()
    seen_text_hashes: set[str] = set()

    source_query_type = (
        "searchTerms" if query.search_terms
        else "twitterHandles" if query.twitter_handles
        else None
    )

    for raw in run_result.items:
        bundle = normalize(
            raw,
            scraped_at=scraped_at,
            source_query=source_label,
            source_query_type=source_query_type,
        )
        if bundle is None:
            continue
        if bundle.tweet.external_id in seen_external_ids:
            continue
        seen_external_ids.add(bundle.tweet.external_id)

        text_hash = exact_text_hash(bundle.tweet.text)
        if text_hash in seen_text_hashes:
            continue
        seen_text_hashes.add(text_hash)

        items_normalized += 1

        # Upsert author
        stmt = (
            pg_insert(TwitterAuthor)
            .values(
                id=_new_id(),
                external_id=bundle.author.external_id,
                username=bundle.author.username,
                display_name=bundle.author.display_name,
                verified=bundle.author.verified,
                followers_count=bundle.author.followers_count,
                following_count=bundle.author.following_count,
                favourites_count=bundle.author.favourites_count,
                statuses_count=bundle.author.statuses_count,
                raw_json=bundle.author.raw_json,
            )
            .on_conflict_do_update(
                index_elements=["external_id"],
                set_={
                    "username": bundle.author.username,
                    "display_name": bundle.author.display_name,
                    "verified": bundle.author.verified,
                    "followers_count": bundle.author.followers_count,
                    "following_count": bundle.author.following_count,
                    "raw_json": bundle.author.raw_json,
                },
            )
            .returning(TwitterAuthor.id)
        )
        author_id = session.execute(stmt).scalar_one()
        authors_upserted += 1

        # Upsert tweet
        dup_hash = near_dup_hash(bundle.tweet.text)
        raw_with_quality = dict(bundle.tweet.raw_json)
        raw_with_quality["_quality"] = {
            "exact_text_hash": text_hash,
            "near_dup_hash": dup_hash,
        }

        tweet_stmt = (
            pg_insert(Tweet)
            .values(
                id=_new_id(),
                external_id=bundle.tweet.external_id,
                url=bundle.tweet.url,
                text=bundle.tweet.text,
                raw_json=raw_with_quality,
                language=bundle.tweet.language,
                created_at_twitter=bundle.tweet.created_at_twitter,
                scraped_at=bundle.tweet.scraped_at,
                source_query=bundle.tweet.source_query,
                source_query_type=bundle.tweet.source_query_type,
                matched_search_term=bundle.tweet.matched_search_term,
                like_count=bundle.tweet.like_count,
                retweet_count=bundle.tweet.retweet_count,
                reply_count=bundle.tweet.reply_count,
                quote_count=bundle.tweet.quote_count,
                bookmark_count=bundle.tweet.bookmark_count,
                view_count=bundle.tweet.view_count,
                is_reply=bundle.tweet.is_reply,
                is_retweet=bundle.tweet.is_retweet,
                is_quote=bundle.tweet.is_quote,
                has_images=bundle.tweet.has_images,
                has_video=bundle.tweet.has_video,
                author_id=author_id,
            )
            .on_conflict_do_update(
                index_elements=["external_id"],
                set_={
                    "url": bundle.tweet.url,
                    "text": bundle.tweet.text,
                    "raw_json": raw_with_quality,
                    "like_count": bundle.tweet.like_count,
                    "retweet_count": bundle.tweet.retweet_count,
                    "view_count": bundle.tweet.view_count,
                },
            )
            .returning(Tweet.id)
        )
        tweet_id = session.execute(tweet_stmt).scalar_one()
        tweets_upserted += 1

        # Asset matches — QQQ universe only
        matches = [
            m for m in extract_tickers(bundle.tweet.text, session=session)
            if m["ticker"].upper() in _QQQ_ALLOWED
        ]
        matches = filter_matches_for_ingest(bundle.tweet.text, matches)
        for m in matches:
            match_stmt = (
                pg_insert(TweetAssetMatch)
                .values(
                    id=_new_id(),
                    tweet_id=tweet_id,
                    asset_type=m["asset_type"],
                    ticker=m["ticker"],
                    confidence=m["confidence"],
                    match_method=m["match_method"],
                )
                .on_conflict_do_nothing(
                    index_elements=["tweet_id", "ticker", "match_method"]
                )
            )
            result = session.execute(match_stmt)
            asset_matches_created += result.rowcount

        # Features
        scores = compute_feature_scores(
            text=bundle.tweet.text,
            like_count=bundle.tweet.like_count,
            retweet_count=bundle.tweet.retweet_count,
            reply_count=bundle.tweet.reply_count,
            is_retweet=bundle.tweet.is_retweet,
            is_reply=bundle.tweet.is_reply,
            has_images=bundle.tweet.has_images,
            has_video=bundle.tweet.has_video,
            verified=bundle.author.verified,
            followers_count=bundle.author.followers_count,
            following_count=bundle.author.following_count,
            statuses_count=bundle.author.statuses_count,
        )
        # ── Model predictions ──────────────────────────────────────────
        # Run inference for every (tweet, ticker) pair and store per-horizon
        # predictions in tweet_predictions. Also stash the D1 summary in
        # tweet_features for fast access without an extra join.
        d1_direction: str | None = None
        d1_conf: float | None = None
        model_ver: str | None = None

        if predictor is not None and predictor.is_ready and matches:
            for m in matches:
                try:
                    horizon_preds = predictor.predict_all_horizons(
                        text=bundle.tweet.text,
                        ticker=m["ticker"],
                        asset_type=m["asset_type"],
                        match_method=m["match_method"],
                        match_confidence=m["confidence"],
                        username=bundle.author.username,
                        author_verified=bundle.author.verified,
                        followers_count=bundle.author.followers_count,
                        following_count=bundle.author.following_count,
                        statuses_count=bundle.author.statuses_count,
                        spam_score=scores["spam_score"],
                        credibility_score=scores["credibility_score"],
                        is_retweet=bundle.tweet.is_retweet,
                        is_reply=bundle.tweet.is_reply,
                        is_quote=bundle.tweet.is_quote,
                        has_images=bundle.tweet.has_images,
                        has_video=bundle.tweet.has_video,
                        like_count=bundle.tweet.like_count,
                        retweet_count=bundle.tweet.retweet_count,
                        reply_count=bundle.tweet.reply_count,
                        view_count=bundle.tweet.view_count,
                        created_at=bundle.tweet.created_at_twitter,
                    )
                    for hp in horizon_preds:
                        pred_stmt = (
                            pg_insert(TweetPrediction)
                            .values(
                                id=_new_id(),
                                tweet_id=tweet_id,
                                ticker=m["ticker"],
                                horizon=hp.horizon,
                                model_version=hp.model_version,
                                direction_pred=hp.direction,
                                bullish_prob=hp.bullish_prob,
                                bearish_prob=hp.bearish_prob,
                                neutral_prob=hp.neutral_prob,
                                confidence=hp.confidence,
                            )
                            .on_conflict_do_update(
                                index_elements=[
                                    "tweet_id", "ticker", "horizon", "model_version"
                                ],
                                set_={
                                    "direction_pred": hp.direction,
                                    "bullish_prob": hp.bullish_prob,
                                    "bearish_prob": hp.bearish_prob,
                                    "neutral_prob": hp.neutral_prob,
                                    "confidence": hp.confidence,
                                },
                            )
                        )
                        r = session.execute(pred_stmt)
                        predictions_created += r.rowcount

                        # Capture D1 summary from the first/best-confidence ticker
                        if hp.horizon == "D1" and d1_direction is None:
                            d1_direction = hp.direction
                            d1_conf = hp.confidence
                            model_ver = hp.model_version
                except Exception:
                    pass  # never let prediction errors break ingest

        feat_stmt = (
            pg_insert(TweetFeatures)
            .values(
                id=_new_id(),
                tweet_id=tweet_id,
                spam_score=scores["spam_score"],
                credibility_score=scores["credibility_score"],
                duplicate_group_id=scores["duplicate_group_id"],
                embedding_model=None,
                model_direction_pred=d1_direction,
                model_direction_conf=d1_conf,
                model_version=model_ver,
            )
            .on_conflict_do_update(
                index_elements=["tweet_id"],
                set_={
                    "spam_score": scores["spam_score"],
                    "credibility_score": scores["credibility_score"],
                    "duplicate_group_id": scores["duplicate_group_id"],
                    "model_direction_pred": d1_direction,
                    "model_direction_conf": d1_conf,
                    "model_version": model_ver,
                },
            )
        )
        session.execute(feat_stmt)
        features_upserted += 1

    job.status = "SUCCEEDED"
    job.items_requested = query.max_items
    job.items_received = len(run_result.items)
    job.finished_at = datetime.now(tz=timezone.utc)
    session.flush()

    return IngestResult(
        job_id=job.id,
        items_received=len(run_result.items),
        items_normalized=items_normalized,
        items_skipped=len(run_result.items) - items_normalized,
        tweets_upserted=tweets_upserted,
        authors_upserted=authors_upserted,
        asset_matches_created=asset_matches_created,
        features_upserted=features_upserted,
        predictions_created=predictions_created,
    )


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
            result = _execute_ingest_core(session, job, query, source_label)
            session.commit()
            return result
        except Exception as exc:
            session.rollback()
            job = session.get(TweetIngestionJob, job_id)
            if job:
                job.status = "FAILED"
                job.error_message = str(exc)[:12000]
                job.finished_at = datetime.now(tz=timezone.utc)
                session.commit()
            raise


def start_background_ingest(
    query: IngestQuery,
    *,
    source: str = "api",
    source_label: str | None = None,
) -> str:
    job_id = _create_and_commit_running_job(query, source=source, source_label=source_label)

    def worker() -> None:
        from db.connection import get_session_factory

        Session = get_session_factory()
        try:
            with Session() as session:
                job = session.get(TweetIngestionJob, job_id)
                if not job:
                    return
                _execute_ingest_core(session, job, query, source_label)
                session.commit()
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

    threading.Thread(target=worker, daemon=True).start()
    return job_id

