"""
FastAPI app — tweet ingestion, outcome computation, dataset export.
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from db.connection import get_session_factory
from db.models import Tweet
from jobs.outcomes import compute_for_unprocessed
from jobs.recompute import recompute_all
from log_buffer import clear as clear_logs
from log_buffer import get_lines as get_log_lines
from log_buffer import log
from log_buffer import ts
from scrapers.ingest import run as run_ingest
from scrapers.twitterapiio import IngestQuery
from train.export import build_rows, export_jsonl

app = FastAPI(title="TwitterAI", version="0.1.0")

Session = get_session_factory()


# ── Health ──────────────────────────────────────────────────────────────────

@app.get("/health")
def health() -> dict:
    return {"status": "ok"}

@app.get("/api/twitter/logs")
def logs(limit: int = 400) -> dict[str, Any]:
    return {"lines": get_log_lines(limit=limit)}


@app.post("/api/twitter/logs/clear")
def logs_clear() -> dict[str, Any]:
    clear_logs()
    log(f"[{ts()}] logs cleared")
    return {"ok": True}


# ── Ingestion ────────────────────────────────────────────────────────────────

class IngestRequest(BaseModel):
    search_terms: list[str] = Field(default_factory=list)
    twitter_handles: list[str] = Field(default_factory=list)
    conversation_ids: list[str] = Field(default_factory=list)
    max_items: int = Field(default=100, ge=1, le=1000)
    sort: str = Field(default="Latest")
    tweet_language: str | None = None
    minimum_retweets: int | None = None
    minimum_favorites: int | None = None
    only_verified_users: bool = False
    start: str | None = None
    end: str | None = None
    source_label: str | None = None


@app.post("/api/twitter/ingest")
def ingest(req: IngestRequest) -> dict:
    # QQQ-first defaults: if user doesn't specify, make QQQ the normal ingest target.
    from pipeline.qqq_ingest_profile import DEFAULT_QQQ_HANDLES, DEFAULT_QQQ_SEARCH_TERMS

    search_terms = req.search_terms
    twitter_handles = req.twitter_handles
    if not search_terms and not twitter_handles and not req.conversation_ids:
        search_terms = DEFAULT_QQQ_SEARCH_TERMS
        twitter_handles = DEFAULT_QQQ_HANDLES

    q = IngestQuery(
        search_terms=search_terms,
        twitter_handles=twitter_handles,
        conversation_ids=req.conversation_ids,
        max_items=req.max_items,
        sort=req.sort,
        tweet_language=req.tweet_language,
        minimum_retweets=req.minimum_retweets,
        minimum_favorites=req.minimum_favorites,
        only_verified_users=req.only_verified_users,
        start=req.start,
        end=req.end,
    )
    with Session() as session:
        result = run_ingest(
            session,
            q,
            source="api",
            source_label=req.source_label or "qqq:api:/api/twitter/ingest",
        )
        session.commit()
    return {
        "job_id": result.job_id,
        "items_received": result.items_received,
        "items_normalized": result.items_normalized,
        "items_skipped": result.items_skipped,
        "tweets_upserted": result.tweets_upserted,
        "authors_upserted": result.authors_upserted,
        "asset_matches_created": result.asset_matches_created,
        "features_upserted": result.features_upserted,
    }


# ── Outcome computation ───────────────────────────────────────────────────────

class OutcomeRequest(BaseModel):
    limit: int = Field(default=50, ge=1, le=500)


@app.post("/api/twitter/compute-outcomes")
def compute_outcomes(req: OutcomeRequest) -> dict:
    log(f"[{__name__}] compute-outcomes start (limit={req.limit})")
    with Session() as session:
        result = compute_for_unprocessed(session, limit=req.limit)
        session.commit()
    log(f"[{__name__}] compute-outcomes done (created_outcomes={result.created_outcomes}, errors={result.errors})")
    return {
        "provider": result.provider,
        "scanned": result.scanned,
        "processed": result.processed,
        "created_outcomes": result.created_outcomes,
        "skipped_no_asset": result.skipped_no_asset,
        "errors": result.errors,
    }


class RecomputeRequest(BaseModel):
    limit: int = Field(default=500, ge=1, le=2000)


@app.post("/api/twitter/recompute-labels")
def recompute_labels(req: RecomputeRequest) -> dict:
    log(f"[{__name__}] recompute-labels start (limit={req.limit})")
    with Session() as session:
        result = recompute_all(session, limit=req.limit)
        session.commit()
    log(f"[{__name__}] recompute-labels done (updated={result.updated})")
    return {"scanned": result.scanned, "updated": result.updated}


# ── Tweet list ───────────────────────────────────────────────────────────────

@app.get("/api/twitter/tweets")
def list_tweets(
    limit: int = 20,
    offset: int = 0,
    ticker: str | None = None,
    qqq: bool = False,
    allowlist_only: bool = False,
) -> dict[str, Any]:
    from sqlalchemy import select
    from db.models import TweetAssetMatch, TweetFeatures, TweetOutcome, TwitterAuthor
    from pipeline.qqq_signal import SOURCE_WEIGHTS, score_tweet_for_qqq

    with Session() as session:
        stmt = (
            select(Tweet)
            .order_by(Tweet.created_at_twitter.desc())
            .limit(min(limit, 100))
            .offset(offset)
        )
        if ticker:
            stmt = stmt.where(
                Tweet.id.in_(
                    select(TweetAssetMatch.tweet_id).where(
                        TweetAssetMatch.ticker == ticker.upper()
                    )
                )
            )
        tweets = session.execute(stmt).scalars().all()

        rows = []
        for tweet in tweets:
            author = session.get(TwitterAuthor, tweet.author_id)
            matches = session.execute(
                select(TweetAssetMatch)
                .where(TweetAssetMatch.tweet_id == tweet.id)
                .order_by(TweetAssetMatch.confidence.desc())
            ).scalars().all()
            outcomes = session.execute(
                select(TweetOutcome)
                .where(TweetOutcome.tweet_id == tweet.id)
                .order_by(TweetOutcome.horizon)
            ).scalars().all()
            features = session.execute(
                select(TweetFeatures).where(TweetFeatures.tweet_id == tweet.id)
            ).scalar_one_or_none()

            def _dt(v: Any) -> str | None:
                return v.isoformat() if v else None

            # QQQ relevance score (computed on the fly; no schema change needed)
            matched_tickers = [m.ticker for m in matches]
            impacts = [int(o.impact_score) for o in outcomes if o.impact_score is not None]
            qqq_score_obj = score_tweet_for_qqq(
                text=tweet.text,
                username=author.username if author else None,
                matched_tickers=matched_tickers,
                spam_score=features.spam_score if features else None,
                credibility_score=features.credibility_score if features else None,
                impact_scores=impacts or None,
            )
            user_norm = (author.username or "").lstrip("@").strip().lower() if author else ""
            is_allowlisted = bool(user_norm and user_norm in SOURCE_WEIGHTS)
            if allowlist_only and not is_allowlisted:
                continue

            rows.append({
                "id": tweet.id,
                "text": tweet.text,
                "url": tweet.url,
                "created_at_twitter": _dt(tweet.created_at_twitter),
                "like_count": tweet.like_count,
                "retweet_count": tweet.retweet_count,
                "reply_count": tweet.reply_count,
                "view_count": tweet.view_count,
                "is_retweet": tweet.is_retweet,
                "author": {
                    "username": author.username,
                    "display_name": author.display_name,
                    "verified": author.verified,
                    "followers_count": author.followers_count,
                } if author else None,
                "asset_matches": [
                    {
                        "ticker": m.ticker,
                        "asset_type": m.asset_type,
                        "confidence": float(m.confidence),
                    }
                    for m in matches
                ],
                "outcomes": [
                    {
                        "ticker": o.ticker,
                        "horizon": o.horizon,
                        "direction_label": o.direction_label,
                        "impact_score": o.impact_score,
                        "raw_return": float(o.raw_return) if o.raw_return is not None else None,
                        "excess_return": float(o.excess_return) if o.excess_return is not None else None,
                    }
                    for o in outcomes
                ],
                "features": {
                    "spam_score": float(features.spam_score) if features and features.spam_score is not None else None,
                    "credibility_score": float(features.credibility_score) if features and features.credibility_score is not None else None,
                } if features else None,
                "qqq": {
                    "score": float(qqq_score_obj.score),
                    "reasons": qqq_score_obj.reasons,
                    "allowlisted_source": is_allowlisted,
                },
            })

    if qqq:
        rows.sort(key=lambda r: (r.get("qqq") or {}).get("score", 0.0), reverse=True)
        # In QQQ mode, drop obvious spam/finfluencer content even if it contains tickers.
        rows = [r for r in rows if (r.get("qqq") or {}).get("score", 0.0) >= 0.6]
    return {"tweets": rows, "count": len(rows), "offset": offset, "qqq_mode": qqq, "allowlist_only": allowlist_only}


# ── Tweet lookup ─────────────────────────────────────────────────────────────

@app.get("/api/twitter/tweets/{tweet_id}")
def get_tweet(tweet_id: str) -> dict[str, Any]:
    from sqlalchemy import select
    from db.models import TweetAssetMatch, TweetFeatures, MarketSnapshot, TweetOutcome, TwitterAuthor

    with Session() as session:
        tweet = session.get(Tweet, tweet_id)
        if not tweet:
            raise HTTPException(status_code=404, detail="Tweet not found")

        author = session.get(TwitterAuthor, tweet.author_id)
        matches = session.execute(
            select(TweetAssetMatch)
            .where(TweetAssetMatch.tweet_id == tweet_id)
            .order_by(TweetAssetMatch.confidence.desc())
        ).scalars().all()
        snapshots = session.execute(
            select(MarketSnapshot).where(MarketSnapshot.tweet_id == tweet_id)
        ).scalars().all()
        outcomes = session.execute(
            select(TweetOutcome)
            .where(TweetOutcome.tweet_id == tweet_id)
            .order_by(TweetOutcome.horizon)
        ).scalars().all()
        features = session.execute(
            select(TweetFeatures).where(TweetFeatures.tweet_id == tweet_id)
        ).scalar_one_or_none()

    def _snap(o: Any) -> dict:
        return {c.name: getattr(o, c.name) for c in o.__table__.columns}

    return {
        **_snap(tweet),
        "author": _snap(author) if author else None,
        "asset_matches": [_snap(m) for m in matches],
        "market_snapshots": [_snap(s) for s in snapshots],
        "outcomes": [_snap(o) for o in outcomes],
        "features": _snap(features) if features else None,
    }


# ── Dataset export ───────────────────────────────────────────────────────────

class ExportRequest(BaseModel):
    out_file: str
    limit: int = Field(default=5000, ge=1)
    max_spam_score: float | None = None
    min_credibility_score: float | None = None
    tickers: list[str] | None = None
    horizons: list[str] | None = None
    min_abs_impact_score: int | None = None


@app.post("/api/twitter/export")
def export_dataset(req: ExportRequest) -> dict:
    with Session() as session:
        rows = build_rows(session, limit=req.limit)

    filters = {
        "max_spam_score": req.max_spam_score,
        "min_credibility_score": req.min_credibility_score,
        "tickers": req.tickers,
        "horizons": req.horizons,
        "min_abs_impact_score": req.min_abs_impact_score,
    }
    written = export_jsonl(rows, req.out_file, filters=filters)
    return {"out_file": req.out_file, "rows": written}
