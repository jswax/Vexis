"""
FastAPI app — tweet ingestion, outcome computation, dataset export.
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import threading

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from config import get_settings
from db.connection import get_session_factory
from db.models import Tweet
from jobs.outcomes import compute_for_unprocessed
from jobs.recompute import recompute_all
from log_buffer import clear as clear_logs
from log_buffer import get_lines as get_log_lines
from log_buffer import log
from log_buffer import ts
from scrapers.ingest import run as run_ingest, start_background_ingest
from scrapers.twitterapiio import IngestQuery
from train.export import build_rows, export_jsonl

app = FastAPI(title="TwitterAI", version="0.1.0")

Session = get_session_factory()


def _filter_orm_asset_matches(text: str, matches: list[Any]) -> list[Any]:
    """Apply the same ticker-spam / holdings-list rules as ingestion for API responses."""
    from pipeline.asset_matching import TickerMatch
    from pipeline.match_filter import filter_matches_for_ingest

    dicts: list[TickerMatch] = [
        TickerMatch(
            asset_type=m.asset_type,
            ticker=m.ticker,
            confidence=float(m.confidence),
            match_method=m.match_method,
            matched_text=m.ticker,
        )
        for m in matches
    ]
    filtered = filter_matches_for_ingest(text, dicts)
    keep_order = [d["ticker"].upper() for d in filtered]
    keep_set = set(keep_order)
    out = [m for m in matches if (m.ticker or "").upper() in keep_set]
    # Preserve descending confidence order from the query, but follow filtered ordering
    pri = {t: i for i, t in enumerate(keep_order)}
    out.sort(key=lambda m: pri.get((m.ticker or "").upper(), 9999))
    return out


def _require_token(request: Request) -> None:
    """
    Optional protection for mutating endpoints.
    If TWITTERAI_TOKEN is set, require header `x-twitterai-token` to match.
    """
    token = (get_settings().twitterai_token or "").strip()
    if not token:
        return
    provided = (request.headers.get("x-twitterai-token") or "").strip()
    if provided != token:
        raise HTTPException(status_code=401, detail="Unauthorized")


# ── Health ──────────────────────────────────────────────────────────────────

@app.get("/health")
def health() -> dict:
    return {"status": "ok"}

@app.get("/api/twitter/logs")
def logs(limit: int = 400) -> dict[str, Any]:
    return {"lines": get_log_lines(limit=limit)}

@app.get("/api/twitter/status")
def status(job_id: str | None = None) -> dict[str, Any]:
    """
    High-level health snapshot for the pipeline: row counts + last ingest job.
    Pass job_id to fetch that specific ingest job (recommended for polling).
    """
    from sqlalchemy import func, select
    from db.models import TweetIngestionJob, TweetOutcome

    with Session() as session:
        tweet_count = session.execute(select(func.count()).select_from(Tweet)).scalar_one()
        outcome_count = session.execute(select(func.count()).select_from(TweetOutcome)).scalar_one()

        last_outcome_at = session.execute(
            select(func.max(TweetOutcome.created_at))
        ).scalar_one()

        if job_id:
            last_job = session.get(TweetIngestionJob, job_id)
        else:
            last_job = session.execute(
                select(TweetIngestionJob)
                .order_by(TweetIngestionJob.created_at.desc(), TweetIngestionJob.id.desc())
                .limit(1)
            ).scalar_one_or_none()

        def _snap(o: Any) -> dict[str, Any] | None:
            if o is None:
                return None
            from enum import Enum

            out: dict[str, Any] = {}
            for c in o.__table__.columns:
                v = getattr(o, c.name)
                if isinstance(v, Enum):
                    v = v.value
                out[c.name] = v
            return out

        return {
            "tweets": int(tweet_count or 0),
            "outcomes": int(outcome_count or 0),
            "last_outcome_at": last_outcome_at.isoformat() if last_outcome_at else None,
            "last_ingest_job": _snap(last_job),
        }


@app.post("/api/twitter/logs/clear")
def logs_clear(_: None = Depends(_require_token)) -> dict[str, Any]:
    clear_logs()
    log(f"[{ts()}] logs cleared")
    return {"ok": True}


# ── Ingestion ────────────────────────────────────────────────────────────────

class IngestRequest(BaseModel):
    search_terms: list[str] = Field(default_factory=list)
    twitter_handles: list[str] = Field(default_factory=list)
    conversation_ids: list[str] = Field(default_factory=list)
    max_items: int = Field(default=100, ge=1, le=3000)
    sort: str = Field(default="Latest")
    tweet_language: str | None = None
    minimum_retweets: int | None = None
    minimum_favorites: int | None = None
    only_verified_users: bool = False
    start: str | None = None
    end: str | None = None
    source_label: str | None = None
    background: bool = Field(
        default=True,
        description="If true, return 202 immediately and run ingest in a background thread (avoids HTTP timeouts).",
    )


@app.post("/api/twitter/ingest", response_model=None)
def ingest(req: IngestRequest, _: None = Depends(_require_token)):
    global _ingest_running
    if _ingest_running:
        raise HTTPException(status_code=409, detail="Ingest already in progress")
    if not _ingest_lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="Ingest lock is held")
    _ingest_running = True

    # QQQ-first defaults: if user doesn't specify, make QQQ the normal ingest target.
    from pipeline.qqq_ingest_profile import DEFAULT_QQQ_HANDLES, DEFAULT_QQQ_SEARCH_TERMS

    search_terms = req.search_terms
    twitter_handles = req.twitter_handles
    if not search_terms and not twitter_handles and not req.conversation_ids:
        search_terms = DEFAULT_QQQ_SEARCH_TERMS
        twitter_handles = DEFAULT_QQQ_HANDLES

    log(
        f"[{__name__}] ingest start (max_items={req.max_items}, "
        f"terms={len(search_terms)}, handles={len(twitter_handles)}, convs={len(req.conversation_ids)})"
    )

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
    label = req.source_label or "qqq:api:/api/twitter/ingest"
    if req.background:
        def _bg_done() -> None:
            global _ingest_running
            _ingest_running = False
            _ingest_lock.release()

        job_id = start_background_ingest(q, source="api", source_label=label, on_done=_bg_done)
        log(f"[{__name__}] ingest accepted (background) job_id={job_id}")
        return JSONResponse(
            status_code=202,
            content={
                "accepted": True,
                "background": True,
                "job_id": job_id,
                "message": "Ingest running in the background. Poll GET /api/twitter/status until "
                "last_ingest_job.id matches and status is SUCCEEDED or FAILED.",
            },
        )

    try:
        result = run_ingest(q, source="api", source_label=label)
    finally:
        _ingest_running = False
        _ingest_lock.release()
    log(
        f"[{__name__}] ingest done (items_received={result.items_received}, "
        f"items_normalized={result.items_normalized}, tweets_upserted={result.tweets_upserted}, "
        f"asset_matches_created={result.asset_matches_created}, "
        f"predictions_created={result.predictions_created})"
    )
    return {
        "job_id": result.job_id,
        "items_received": result.items_received,
        "items_normalized": result.items_normalized,
        "items_skipped": result.items_skipped,
        "tweets_upserted": result.tweets_upserted,
        "authors_upserted": result.authors_upserted,
        "asset_matches_created": result.asset_matches_created,
        "features_upserted": result.features_upserted,
        "predictions_created": result.predictions_created,
    }


# ── Outcome computation ───────────────────────────────────────────────────────

class OutcomeRequest(BaseModel):
    limit: int = Field(default=50, ge=1, le=500)
    qqq_only: bool = True
    all_tweets: bool = Field(
        default=False,
        description="Process every tweet that still needs outcomes, in internal batches (ignores limit).",
    )
    chunk_size: int = Field(default=80, ge=20, le=250)


@app.post("/api/twitter/compute-outcomes")
def compute_outcomes(req: OutcomeRequest, _: None = Depends(_require_token)) -> dict:
    log(
        f"[{__name__}] compute-outcomes start "
        f"(all_tweets={req.all_tweets}, limit={req.limit}, chunk_size={req.chunk_size}, qqq_only={req.qqq_only})"
    )
    with Session() as session:
        result = compute_for_unprocessed(
            session,
            limit=req.limit,
            qqq_only=req.qqq_only,
            force=False,
            run_all=req.all_tweets,
            chunk_size=req.chunk_size,
        )
        session.commit()
    log(f"[{__name__}] compute-outcomes done (created_outcomes={result.created_outcomes}, errors={result.errors})")
    return {
        "provider": result.provider,
        "scanned": result.scanned,
        "processed": result.processed,
        "created_outcomes": result.created_outcomes,
        "skipped_no_asset": result.skipped_no_asset,
        "errors": result.errors,
        "qqq_only": req.qqq_only,
        "all_tweets": req.all_tweets,
        "chunks_completed": result.chunks_completed,
    }


class RecomputeRequest(BaseModel):
    limit: int = Field(default=500, ge=1, le=2_000_000)
    """When true, every outcome row is updated (limit is ignored)."""
    all_rows: bool = False
    export_full_json: bool = Field(
        default=True,
        description="When all_rows, write full training rows as JSONL (same format as Export / data.jsonl).",
    )
    export_out_file: str | None = Field(
        default=None,
        description="Optional path; .json is rewritten to .jsonl. Default recompute_all_<utc>.jsonl under exports/.",
    )


@app.post("/api/twitter/recompute-labels")
def recompute_labels(req: RecomputeRequest, _: None = Depends(_require_token)) -> dict:
    eff_limit: int | None = None if req.all_rows else req.limit
    log(
        f"[{__name__}] recompute-labels start "
        f"({'all rows' if eff_limit is None else f'limit={eff_limit}'})"
    )
    with Session() as session:
        result = recompute_all(session, limit=eff_limit)
        session.commit()
    log(
        f"[{__name__}] recompute-labels DB update committed "
        f"(scanned={result.scanned}, updated={result.updated})"
    )

    diagnostic_export: dict[str, Any] | None = None
    if req.all_rows and req.export_full_json:
        log(
            f"[{__name__}] diagnostic export: building training rows "
            f"(same as Export tab; may take ~10-60s for large DBs)..."
        )
        exports_dir = Path(__file__).resolve().parent.parent / "exports"
        with Session() as export_session:
            rows = build_rows(export_session, limit=None)
        if req.export_out_file and req.export_out_file.strip():
            out_path = Path(req.export_out_file.strip())
            if not out_path.is_absolute():
                out_path = exports_dir / out_path
            if out_path.suffix.lower() != ".jsonl":
                out_path = out_path.with_suffix(".jsonl")
        else:
            ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
            out_path = exports_dir / f"recompute_all_{ts}.jsonl"
        out_path.parent.mkdir(parents=True, exist_ok=True)
        n_written = export_jsonl(rows, str(out_path), filters=None)
        diagnostic_export = {"path": str(out_path.resolve()), "rows": n_written}
        log(
            f"[{__name__}] diagnostic export: wrote {n_written} rows to {out_path.resolve()}"
        )

    log(f"[{__name__}] recompute-labels finished (all_rows={req.all_rows})")

    return {
        "ok": True,
        "scanned": result.scanned,
        "updated": result.updated,
        "all_rows": req.all_rows,
        "diagnostic_export": diagnostic_export,
    }


# ── Model status ─────────────────────────────────────────────────────────────

@app.get("/api/twitter/model-status")
def model_status() -> dict:
    """Return the current model metadata (version, metrics, trained_at)."""
    try:
        from inference.model import get_predictor
        p = get_predictor()
        if not p.is_ready:
            return {"ready": False, "reason": p._load_error or "No trained model found. Run training first."}
        m = p.meta
        # Build per-horizon summary for the UI
        per_horizon = m.get("per_horizon", {})
        horizon_summary = {
            h: {
                "cv_macro_f1": hm.get("cv_macro_f1"),
                "train_samples": hm.get("train_samples"),
                "class_distribution": hm.get("class_distribution"),
                "top_features": (hm.get("top_features") or [])[:5],
            }
            for h, hm in per_horizon.items()
        }
        # Legacy single-model bundles may still have top_features at root
        top_features = m.get("top_features") or []
        if not top_features and per_horizon:
            first_h = next(iter(per_horizon.values()), {})
            top_features = (first_h.get("top_features") or [])[:10]

        return {
            "ready": True,
            "version": m.get("version"),
            "trained_at": m.get("trained_at"),
            "train_cutoff_at": m.get("train_cutoff_at"),
            "cv_macro_f1": m.get("cv_macro_f1"),
            "cv_weighted_f1": m.get("cv_weighted_f1"),
            "test_macro_f1": m.get("test_macro_f1"),
            "train_samples": m.get("total_train_samples") or m.get("train_samples"),
            "test_samples": m.get("total_test_samples"),
            "n_features": m.get("n_features"),
            "class_distribution": m.get("class_distribution"),
            "top_features": top_features[:10],
            "per_horizon": horizon_summary,
        }
    except Exception as exc:
        return {"ready": False, "reason": str(exc)}


# ── Model training ────────────────────────────────────────────────────────────

# Global lock: only one training run at a time
_training_lock = threading.Lock()
_training_state: dict = {"running": False, "last_result": None}

# Global lock: only one ingest at a time
_ingest_lock = threading.Lock()
_ingest_running = False


class TrainRequest(BaseModel):
    version: str = Field(default="v1", description="Model version tag")
    min_outcomes: int = Field(
        default=1, ge=1,
        description="Minimum outcome rows per tweet to include in training",
    )
    use_ticker_ohe: bool = Field(
        default=True,
        description="Include per-ticker one-hot features (NVDA, TSLA, etc.). Disable to test whether text/author signal generalises without ticker identity.",
    )


@app.post("/api/twitter/train")
def train_model(req: TrainRequest, _: None = Depends(_require_token)) -> dict:
    """
    Trigger a full model training run (blocking).
    Loads labeled data from the DB, trains LightGBM + TF-IDF, saves artifacts,
    then reloads the predictor so new ingests immediately use the updated model.
    """
    if _training_state["running"]:
        raise HTTPException(status_code=409, detail="Training already in progress")

    if not _training_lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="Training lock is held")

    _training_state["running"] = True
    log(f"[{ts()}] training: started (version={req.version})")
    try:
        from train.train import run_training
        metrics = run_training(
            min_outcomes=req.min_outcomes,
            version=req.version,
            verbose=True,
            use_ticker_ohe=req.use_ticker_ohe,
        )
        # Hot-reload the predictor — new ingests will use the updated model
        try:
            from inference.model import reload_predictor
            reload_predictor()
            log(f"[{ts()}] training: predictor reloaded")
        except Exception as e:
            log(f"[{ts()}] training: predictor reload failed: {e}")

        _training_state["last_result"] = metrics
        log(f"[{ts()}] training: complete — CV macro-F1={metrics.get('cv_macro_f1', '?'):.4f}")
        return {"ok": True, **metrics}
    except Exception as exc:
        log(f"[{ts()}] training: FAILED — {exc}")
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        _training_state["running"] = False
        _training_lock.release()


# ── Backfill predictions ──────────────────────────────────────────────────────

class BackfillRequest(BaseModel):
    limit: int = Field(default=200, ge=1, le=5000)
    all_tweets: bool = False


@app.post("/api/twitter/backfill-predictions")
def backfill_predictions(req: BackfillRequest, _: None = Depends(_require_token)) -> dict:
    """
    Run model inference on existing tweets that have no predictions yet
    (e.g. tweets ingested before the model was trained).
    """
    from sqlalchemy import select, func
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    from db.models import TweetAssetMatch, TweetFeatures, TweetPrediction, TwitterAuthor
    from inference.model import get_predictor

    predictor = get_predictor()
    if not predictor.is_ready:
        raise HTTPException(
            status_code=400,
            detail="No trained model available. Run /api/twitter/train first.",
        )

    log(f"[{ts()}] backfill-predictions: start (all={req.all_tweets}, limit={req.limit})")

    with Session() as session:
        # Find tweets that have asset matches but no predictions yet
        already_predicted = select(TweetPrediction.tweet_id).distinct()
        stmt = (
            select(Tweet)
            .where(Tweet.id.in_(select(TweetAssetMatch.tweet_id).distinct()))
            .where(Tweet.id.notin_(already_predicted))
            .order_by(Tweet.created_at_twitter.desc())
        )
        if not req.all_tweets:
            stmt = stmt.limit(req.limit)

        tweets = session.execute(stmt).scalars().all()
        log(f"[{ts()}] backfill-predictions: {len(tweets)} tweets to process")

        if not tweets:
            return {"ok": True, "processed": 0, "predictions_created": 0}

        tweet_ids = [t.id for t in tweets]
        author_map = {
            a.id: a
            for a in session.execute(
                select(TwitterAuthor).where(
                    TwitterAuthor.id.in_({t.author_id for t in tweets})
                )
            ).scalars()
        }
        match_map: dict[str, list] = {}
        for m in session.execute(
            select(TweetAssetMatch)
            .where(TweetAssetMatch.tweet_id.in_(tweet_ids))
            .order_by(TweetAssetMatch.confidence.desc())
        ).scalars():
            match_map.setdefault(m.tweet_id, []).append(m)

        feat_map = {
            f.tweet_id: f
            for f in session.execute(
                select(TweetFeatures).where(TweetFeatures.tweet_id.in_(tweet_ids))
            ).scalars()
        }

        processed = 0
        predictions_created = 0

        for tweet in tweets:
            author = author_map.get(tweet.author_id)
            matches = match_map.get(tweet.id, [])
            feats = feat_map.get(tweet.id)

            if not matches:
                continue

            for m in matches:
                try:
                    horizon_preds = predictor.predict_all_horizons(
                        text=tweet.text or "",
                        ticker=m.ticker,
                        asset_type=m.asset_type,
                        match_method=m.match_method,
                        match_confidence=float(m.confidence),
                        username=author.username if author else None,
                        author_verified=bool(author.verified) if author else False,
                        followers_count=author.followers_count if author else None,
                        following_count=author.following_count if author else None,
                        statuses_count=author.statuses_count if author else None,
                        spam_score=feats.spam_score if feats else None,
                        credibility_score=feats.credibility_score if feats else None,
                        is_retweet=bool(tweet.is_retweet),
                        is_reply=bool(tweet.is_reply),
                        is_quote=bool(tweet.is_quote),
                        has_images=bool(tweet.has_images),
                        has_video=bool(tweet.has_video),
                        like_count=tweet.like_count,
                        retweet_count=tweet.retweet_count,
                        reply_count=tweet.reply_count,
                        view_count=tweet.view_count,
                        created_at=tweet.created_at_twitter,
                    )
                    for hp in horizon_preds:
                        stmt2 = (
                            pg_insert(TweetPrediction)
                            .values(
                                id=str(__import__("uuid").uuid4()),
                                tweet_id=tweet.id,
                                ticker=m.ticker,
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
                        r = session.execute(stmt2)
                        predictions_created += r.rowcount
                except Exception:
                    pass

            processed += 1
            if processed % 50 == 0:
                log(f"[{ts()}] backfill-predictions: {processed}/{len(tweets)}")

        session.commit()

    log(f"[{ts()}] backfill-predictions: done ({processed} tweets, {predictions_created} preds)")
    return {
        "ok": True,
        "processed": processed,
        "predictions_created": predictions_created,
        "model_version": predictor.model_version,
    }


# ── Single-tweet predict ──────────────────────────────────────────────────────

class PredictRequest(BaseModel):
    tweet_id: str


@app.post("/api/twitter/predict")
def predict_tweet(req: PredictRequest, _: None = Depends(_require_token)) -> dict:
    """Run model inference for a single tweet already in the DB."""
    from sqlalchemy import select
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    from db.models import TweetAssetMatch, TweetFeatures, TweetPrediction, TwitterAuthor
    from inference.model import get_predictor

    predictor = get_predictor()
    if not predictor.is_ready:
        raise HTTPException(
            status_code=400,
            detail="No trained model available. Run /api/twitter/train first.",
        )

    with Session() as session:
        tweet = session.get(Tweet, req.tweet_id)
        if not tweet:
            raise HTTPException(status_code=404, detail="Tweet not found")

        author = session.get(__import__("db.models", fromlist=["TwitterAuthor"]).TwitterAuthor, tweet.author_id)
        matches = (
            session.execute(
                select(TweetAssetMatch)
                .where(TweetAssetMatch.tweet_id == req.tweet_id)
                .order_by(TweetAssetMatch.confidence.desc())
            )
            .scalars()
            .all()
        )
        feat_row = (
            session.execute(
                select(TweetFeatures).where(TweetFeatures.tweet_id == req.tweet_id)
            )
            .scalar_one_or_none()
        )

        all_preds: list[dict] = []
        for m in matches:
            horizon_preds = predictor.predict_all_horizons(
                text=tweet.text or "",
                ticker=m.ticker,
                asset_type=m.asset_type,
                match_method=m.match_method,
                match_confidence=float(m.confidence),
                username=author.username if author else None,
                author_verified=bool(author.verified) if author else False,
                followers_count=author.followers_count if author else None,
                following_count=author.following_count if author else None,
                statuses_count=author.statuses_count if author else None,
                spam_score=feat_row.spam_score if feat_row else None,
                credibility_score=feat_row.credibility_score if feat_row else None,
                is_retweet=bool(tweet.is_retweet),
                is_reply=bool(tweet.is_reply),
                is_quote=bool(tweet.is_quote),
                has_images=bool(tweet.has_images),
                has_video=bool(tweet.has_video),
                like_count=tweet.like_count,
                retweet_count=tweet.retweet_count,
                reply_count=tweet.reply_count,
                view_count=tweet.view_count,
                created_at=tweet.created_at_twitter,
            )
            for hp in horizon_preds:
                stmt = (
                    pg_insert(TweetPrediction)
                    .values(
                        id=str(__import__("uuid").uuid4()),
                        tweet_id=tweet.id,
                        ticker=m.ticker,
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
                session.execute(stmt)
                all_preds.append({"ticker": m.ticker, **hp.to_dict()})

        session.commit()

    return {
        "tweet_id": req.tweet_id,
        "model_version": predictor.model_version,
        "predictions": all_preds,
    }


# ── Tweet list ───────────────────────────────────────────────────────────────

@app.get("/api/twitter/tweets")
def list_tweets(
    limit: int = 20,
    offset: int = 0,
    ticker: str | None = None,
    qqq: bool = False,
    test_only: bool = False,
) -> dict[str, Any]:
    from sqlalchemy import case, func, select
    from db.models import TweetAssetMatch, TweetFeatures, TweetOutcome, TweetPrediction, TwitterAuthor
    from pipeline.qqq_signal import SOURCE_WEIGHTS, score_tweet_for_qqq

    # Grab train cutoff from loaded model (None if not trained yet)
    try:
        from inference.model import get_predictor as _get_pred
        _cutoff_str = (_get_pred().meta or {}).get("train_cutoff_at")
        from datetime import timezone as _tz
        train_cutoff_dt = datetime.fromisoformat(_cutoff_str).astimezone(_tz.utc) if _cutoff_str else None
    except Exception:
        train_cutoff_dt = None

    with Session() as session:
        # Subquery: max |impact_score| per tweet (None when no outcomes yet)
        max_impact_sq = (
            select(
                TweetOutcome.tweet_id,
                func.max(func.abs(TweetOutcome.impact_score)).label("max_abs_impact"),
            )
            .group_by(TweetOutcome.tweet_id)
            .subquery()
        )

        # Base filter used for totals + pagination
        base_filter = None
        if ticker:
            base_filter = Tweet.id.in_(
                select(TweetAssetMatch.tweet_id).where(
                    TweetAssetMatch.ticker == ticker.upper()
                )
            )
        # test_only: restrict to tweets newer than the train/test cutoff
        if test_only and train_cutoff_dt is not None:
            cutoff_filter = Tweet.created_at_twitter >= train_cutoff_dt
            base_filter = cutoff_filter if base_filter is None else (base_filter & cutoff_filter)

        # Global section totals (ignores limit/offset)
        totals_stmt = (
            select(
                func.count(Tweet.id).label("total"),
                func.sum(
                    case(
                        (max_impact_sq.c.max_abs_impact.is_(None), 1),
                        else_=0,
                    )
                ).label("uncomputed"),
                func.sum(
                    case(
                        (
                            (max_impact_sq.c.max_abs_impact >= 1)
                            & (max_impact_sq.c.max_abs_impact < 5),
                            1,
                        ),
                        else_=0,
                    )
                ).label("impact_1_5"),
                func.sum(
                    case(
                        (
                            (max_impact_sq.c.max_abs_impact >= 5)
                            & (max_impact_sq.c.max_abs_impact < 8),
                            1,
                        ),
                        else_=0,
                    )
                ).label("impact_5_8"),
                func.sum(
                    case(
                        (
                            (max_impact_sq.c.max_abs_impact >= 8)
                            & (max_impact_sq.c.max_abs_impact <= 10),
                            1,
                        ),
                        else_=0,
                    )
                ).label("impact_8_10"),
            )
            .select_from(Tweet)
            .outerjoin(max_impact_sq, Tweet.id == max_impact_sq.c.tweet_id)
        )
        if base_filter is not None:
            totals_stmt = totals_stmt.where(base_filter)
        totals_row = session.execute(totals_stmt).one()
        total = int(totals_row.total or 0)
        section_totals = {
            "uncomputed": int(totals_row.uncomputed or 0),
            "impact_1_5": int(totals_row.impact_1_5 or 0),
            "impact_5_8": int(totals_row.impact_5_8 or 0),
            "impact_8_10": int(totals_row.impact_8_10 or 0),
        }

        eff_limit = min(limit, 500 if test_only else 100)
        stmt = (
            select(Tweet)
            .outerjoin(max_impact_sq, Tweet.id == max_impact_sq.c.tweet_id)
            .order_by(
                # Computed tweets (have outcomes) first, then uncomputed
                case((max_impact_sq.c.max_abs_impact.is_(None), 1), else_=0),
                # Among computed: highest |impact_score| first
                max_impact_sq.c.max_abs_impact.desc().nullslast(),
                # Among uncomputed: newest first
                Tweet.created_at_twitter.desc(),
            )
            .limit(eff_limit)
            .offset(offset)
        )
        if base_filter is not None:
            stmt = stmt.where(base_filter)
        tweets = session.execute(stmt).scalars().all()

        def _dt(v: Any) -> str | None:
            return v.isoformat() if v else None

        rows: list[dict[str, Any]] = []
        if not tweets:
            pass
        else:
            tweet_ids = [t.id for t in tweets]
            author_ids = list({t.author_id for t in tweets})

            authors_by_id = {
                a.id: a
                for a in session.execute(
                    select(TwitterAuthor).where(TwitterAuthor.id.in_(author_ids))
                ).scalars().all()
            }

            matches_by_tweet: dict[str, list[Any]] = {tid: [] for tid in tweet_ids}
            for m in session.execute(
                select(TweetAssetMatch)
                .where(TweetAssetMatch.tweet_id.in_(tweet_ids))
                .order_by(TweetAssetMatch.tweet_id, TweetAssetMatch.confidence.desc())
            ).scalars().all():
                matches_by_tweet.setdefault(m.tweet_id, []).append(m)

            outcomes_by_tweet: dict[str, list[Any]] = {tid: [] for tid in tweet_ids}
            for o in session.execute(
                select(TweetOutcome)
                .where(TweetOutcome.tweet_id.in_(tweet_ids))
                .order_by(TweetOutcome.tweet_id, TweetOutcome.horizon)
            ).scalars().all():
                outcomes_by_tweet.setdefault(o.tweet_id, []).append(o)

            features_by_tweet = {
                f.tweet_id: f
                for f in session.execute(
                    select(TweetFeatures).where(TweetFeatures.tweet_id.in_(tweet_ids))
                ).scalars().all()
            }

            preds_by_tweet: dict[str, list[Any]] = {tid: [] for tid in tweet_ids}
            for p in session.execute(
                select(TweetPrediction)
                .where(TweetPrediction.tweet_id.in_(tweet_ids))
                .order_by(TweetPrediction.tweet_id, TweetPrediction.ticker, TweetPrediction.horizon)
            ).scalars().all():
                preds_by_tweet.setdefault(p.tweet_id, []).append(p)

            for tweet in tweets:
                author = authors_by_id.get(tweet.author_id)
                matches = _filter_orm_asset_matches(
                    tweet.text, list(matches_by_tweet.get(tweet.id, []))
                )
                allowed = {(m.ticker or "").upper() for m in matches}
                outcomes = list(outcomes_by_tweet.get(tweet.id, []))
                if allowed:
                    outcomes = [o for o in outcomes if (o.ticker or "").upper() in allowed]
                features = features_by_tweet.get(tweet.id)
                predictions = list(preds_by_tweet.get(tweet.id, []))
                if allowed:
                    predictions = [p for p in predictions if (p.ticker or "").upper() in allowed]

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

                rows.append({
                    "id": tweet.id,
                    "text": tweet.text,
                    "url": tweet.url,
                    "created_at_twitter": _dt(tweet.created_at_twitter),
                    "is_in_sample": (
                        train_cutoff_dt is not None
                        and tweet.created_at_twitter is not None
                        and tweet.created_at_twitter.astimezone(timezone.utc) < train_cutoff_dt
                    ),
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
                    "predictions": [
                        {
                            "ticker": p.ticker,
                            "horizon": p.horizon,
                            "direction_pred": p.direction_pred,
                            "confidence": float(p.confidence),
                            "bullish_prob": float(p.bullish_prob),
                            "bearish_prob": float(p.bearish_prob),
                            "neutral_prob": float(p.neutral_prob),
                            "model_version": p.model_version,
                        }
                        for p in predictions
                    ],
                    "features": {
                        "spam_score": float(features.spam_score) if features and features.spam_score is not None else None,
                        "credibility_score": float(features.credibility_score) if features and features.credibility_score is not None else None,
                        "model_direction_pred": features.model_direction_pred if features else None,
                        "model_direction_conf": float(features.model_direction_conf) if features and features.model_direction_conf is not None else None,
                        "model_version": features.model_version if features else None,
                    } if features else None,
                    "qqq": {
                        "score": float(qqq_score_obj.score),
                        "reasons": qqq_score_obj.reasons,
                        "allowlisted_source": is_allowlisted,
                    },
                })

    if qqq:
        rows.sort(key=lambda r: (r.get("qqq") or {}).get("score", 0.0), reverse=True)
    return {
        "tweets": rows,
        "count": len(rows),
        "total": int(total or 0),
        "section_totals": section_totals,
        "offset": offset,
        "qqq_mode": qqq,
    }


# ── Tweet lookup ─────────────────────────────────────────────────────────────

@app.get("/api/twitter/tweets/{tweet_id}")
def get_tweet(tweet_id: str) -> dict[str, Any]:
    from sqlalchemy import select
    from db.models import TweetAssetMatch, TweetFeatures, MarketSnapshot, TweetOutcome, TweetPrediction, TwitterAuthor

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
        matches = _filter_orm_asset_matches(tweet.text, list(matches))
        allowed = {(m.ticker or "").upper() for m in matches}
        snapshots = session.execute(
            select(MarketSnapshot).where(MarketSnapshot.tweet_id == tweet_id)
        ).scalars().all()
        if allowed:
            snapshots = [s for s in snapshots if (s.ticker or "").upper() in allowed]
        outcomes = session.execute(
            select(TweetOutcome)
            .where(TweetOutcome.tweet_id == tweet_id)
            .order_by(TweetOutcome.horizon)
        ).scalars().all()
        if allowed:
            outcomes = [o for o in outcomes if (o.ticker or "").upper() in allowed]
        features = session.execute(
            select(TweetFeatures).where(TweetFeatures.tweet_id == tweet_id)
        ).scalar_one_or_none()

        tweet_predictions = (
            session.execute(
                select(TweetPrediction)
                .where(TweetPrediction.tweet_id == tweet_id)
                .order_by(TweetPrediction.ticker, TweetPrediction.horizon)
            )
            .scalars()
            .all()
        )
        if allowed:
            tweet_predictions = [
                p for p in tweet_predictions if (p.ticker or "").upper() in allowed
            ]

        from pipeline.qqq_signal import SOURCE_WEIGHTS, score_tweet_for_qqq

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
        qqq_payload = {
            "score": float(qqq_score_obj.score),
            "reasons": qqq_score_obj.reasons,
            "allowlisted_source": bool(user_norm and user_norm in SOURCE_WEIGHTS),
        }

    def _snap(o: Any) -> dict:
        return {c.name: getattr(o, c.name) for c in o.__table__.columns}

    return {
        **_snap(tweet),
        "author": _snap(author) if author else None,
        "asset_matches": [_snap(m) for m in matches],
        "market_snapshots": [_snap(s) for s in snapshots],
        "outcomes": [_snap(o) for o in outcomes],
        "predictions": [_snap(p) for p in tweet_predictions],
        "features": _snap(features) if features else None,
        "qqq": qqq_payload,
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
def export_dataset(req: ExportRequest, _: None = Depends(_require_token)) -> dict:
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
