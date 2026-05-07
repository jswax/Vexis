"""
TwitterAI direction prediction model — training pipeline.

Architecture
────────────
One LightGBM classifier per horizon (M5 … D1). Each model sees:
  • Tabular features  — author stats, ticker identity (top QQQ holdings + QQQ/QQQM),
                        QQQ channel scores, sentiment, time signals, metadata, engagement
  • Text features     — TF-IDF (unigrams + bigrams) → TruncatedSVD (64 dims)

Training rows use TweetOutcome ticker QQQ (including rows whose price path came from
a top holding), but ticker one-hots / match features come from the best holding or
ETF match on that tweet (see QQQ_TRAINING_MATCH_TICKERS).

Horizon is NOT a feature. Training one model per horizon prevents horizon_idx
from dominating the global model and forces each classifier to learn actual
tweet→direction signal for that timeframe.

TF-IDF and SVD are fitted once on all data and shared across all horizon models
so text representations are globally coherent.

Saved artifacts  (models/twitterai_direction_<version>.joblib)
────────────────────────────────────────────────────────────────
  bundle = {
      "models"        : dict[horizon, LGBMClassifier],   # {"M5": ..., "D1": ...}
      "tfidf"         : TfidfVectorizer,
      "svd"           : TruncatedSVD,
      "feature_names" : list[str],
      "meta"          : dict,
  }

Usage
─────
    cd AI/TwitterAI
    python -m train.train
    python -m train.train --min-outcomes 30
    python -m train.train --version v2
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import warnings
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.decomposition import TruncatedSVD
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import (
    classification_report,
    confusion_matrix,
    f1_score,
)
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sqlalchemy import select

warnings.filterwarnings("ignore", category=UserWarning)

_HERE = Path(__file__).resolve().parent
_ROOT = _HERE.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from db.connection import get_session_factory
from db.models import (
    Tweet,
    TweetAssetMatch,
    TweetFeatures,
    TweetOutcome,
    TwitterAuthor,
)
from log_buffer import log
from pipeline.qqq_signal import QQQ_TRAINING_MATCH_TICKERS
from train.features import (
    DIRECTION_LABELS,
    HORIZONS_ORDERED,
    LABEL_TO_IDX,
    extract_features,
)

# ── Constants ──────────────────────────────────────────────────────────────────

MODELS_DIR = _ROOT / "models"
MODEL_VERSION = "v1"

# Per-horizon LightGBM params — lighter than a global model since each split
# has ~1/7 of total rows. min_child_samples=5 handles thin BEARISH class.
LGBM_PARAMS: dict = {
    "n_estimators": 600,
    "learning_rate": 0.05,
    "num_leaves": 31,
    "max_depth": 6,
    "min_child_samples": 5,
    "subsample": 0.8,
    "subsample_freq": 1,
    "colsample_bytree": 0.8,
    "reg_alpha": 0.2,
    "reg_lambda": 2.0,
    "class_weight": "balanced",
    "n_jobs": -1,
    "random_state": 42,
    "verbose": -1,
}

TFIDF_PARAMS: dict = {
    "max_features": 4000,
    "ngram_range": (1, 2),
    "sublinear_tf": True,
    "min_df": 3,
    "strip_accents": "unicode",
    "analyzer": "word",
    "token_pattern": r"(?u)\b[a-zA-Z\$][a-zA-Z\$]{1,}\b",
}
SVD_N_COMPONENTS = 64

MIN_HORIZON_ROWS = 30   # minimum samples to train a horizon model
MIN_TOTAL_ROWS = 50

# All class indices for sklearn metrics — required when a horizon slice omits a label
# so target_names (3 names) still aligns with classification_report / confusion_matrix.
_DIRECTION_LABEL_INDICES: list[int] = list(range(len(DIRECTION_LABELS)))


# ── Data loading ───────────────────────────────────────────────────────────────

def load_training_data(
    session,
    *,
    min_outcomes: int = 1,
    verbose: bool = True,
) -> tuple[list[dict], list[str]]:
    if verbose:
        log("[train] Loading training data from DB...")

    outcomes = (
        session.execute(
            select(TweetOutcome)
            .where(TweetOutcome.ticker == "QQQ")
            .where(TweetOutcome.price_at_horizon.is_not(None))
            .order_by(TweetOutcome.created_at)
        )
        .scalars()
        .all()
    )
    if not outcomes:
        raise RuntimeError("No TweetOutcome rows found. Run compute-outcomes first.")

    if verbose:
        log(f"[train] Found {len(outcomes):,} outcome rows")

    tweet_ids = list({o.tweet_id for o in outcomes})

    tweets = {
        t.id: t
        for t in session.execute(
            select(Tweet).where(Tweet.id.in_(tweet_ids))
        ).scalars()
    }
    author_ids = list({t.author_id for t in tweets.values()})
    authors = {
        a.id: a
        for a in session.execute(
            select(TwitterAuthor).where(TwitterAuthor.id.in_(author_ids))
        ).scalars()
    }
    match_rows = (
        session.execute(
            select(TweetAssetMatch).where(TweetAssetMatch.tweet_id.in_(tweet_ids))
        )
        .scalars()
        .all()
    )
    # QQQ outcomes share one label ticker; features use the best *holding or QQQ ETF* match.
    best_train_match_by_tweet: dict[str, TweetAssetMatch] = {}
    for m in match_rows:
        tkr = (m.ticker or "").upper()
        if tkr not in QQQ_TRAINING_MATCH_TICKERS:
            continue
        tid = m.tweet_id
        prev = best_train_match_by_tweet.get(tid)
        if prev is None or float(m.confidence) > float(prev.confidence):
            best_train_match_by_tweet[tid] = m

    features_rows = {
        f.tweet_id: f
        for f in session.execute(
            select(TweetFeatures).where(TweetFeatures.tweet_id.in_(tweet_ids))
        ).scalars()
    }

    rows: list[dict] = []
    texts: list[str] = []

    for o in outcomes:
        tweet = tweets.get(o.tweet_id)
        if tweet is None:
            continue
        author = authors.get(tweet.author_id)
        match = best_train_match_by_tweet.get(o.tweet_id)
        feat_row = features_rows.get(o.tweet_id)

        rows.append(
            {
                "direction_label": o.direction_label,
                "horizon": o.horizon,
                "text": tweet.text or "",
                "created_at": tweet.created_at_twitter,
                "is_retweet": bool(tweet.is_retweet),
                "is_reply": bool(tweet.is_reply),
                "is_quote": bool(tweet.is_quote),
                "has_images": bool(tweet.has_images),
                "has_video": bool(tweet.has_video),
                "like_count": tweet.like_count,
                "retweet_count": tweet.retweet_count,
                "reply_count": tweet.reply_count,
                "view_count": tweet.view_count,
                "username": author.username if author else None,
                "author_verified": bool(author.verified) if author else False,
                "followers_count": author.followers_count if author else None,
                "following_count": author.following_count if author else None,
                "statuses_count": author.statuses_count if author else None,
                "ticker": (match.ticker or "QQQ") if match else "QQQ",
                "asset_type": match.asset_type if match else "ETF",
                "match_method": match.match_method if match else "",
                "match_confidence": float(match.confidence) if match else 0.7,
                "spam_score": feat_row.spam_score if feat_row else None,
                "credibility_score": feat_row.credibility_score if feat_row else None,
            }
        )
        texts.append(tweet.text or "")

    if verbose:
        label_counts: dict[str, int] = {}
        horizon_counts: dict[str, int] = {}
        for r in rows:
            label_counts[r["direction_label"]] = label_counts.get(r["direction_label"], 0) + 1
            horizon_counts[r["horizon"]] = horizon_counts.get(r["horizon"], 0) + 1
        log(f"[train] Usable rows: {len(rows):,}  labels={label_counts}")
        log(f"[train] Per-horizon counts: {horizon_counts}")

    return rows, texts


# ── Feature matrix construction ────────────────────────────────────────────────

def build_feature_matrix(
    rows: list[dict],
    texts: list[str],
    *,
    tfidf: TfidfVectorizer | None = None,
    svd: TruncatedSVD | None = None,
    fit: bool = True,
    verbose: bool = True,
    use_ticker_ohe: bool = True,
) -> tuple[np.ndarray, list[str], TfidfVectorizer, TruncatedSVD]:
    if verbose:
        log(f"[train] Extracting tabular features from {len(rows):,} rows...")

    tab_dicts = [
        extract_features(
            text=r["text"],
            username=r["username"],
            author_verified=r["author_verified"],
            followers_count=r["followers_count"],
            following_count=r["following_count"],
            statuses_count=r["statuses_count"],
            spam_score=r["spam_score"],
            credibility_score=r["credibility_score"],
            ticker=r["ticker"],
            asset_type=r["asset_type"],
            match_method=r["match_method"],
            match_confidence=r["match_confidence"],
            is_retweet=r["is_retweet"],
            is_reply=r["is_reply"],
            is_quote=r["is_quote"],
            has_images=r["has_images"],
            has_video=r["has_video"],
            like_count=r["like_count"],
            retweet_count=r["retweet_count"],
            reply_count=r["reply_count"],
            view_count=r["view_count"],
            created_at=r["created_at"],
            use_ticker_ohe=use_ticker_ohe,
        )
        for r in rows
    ]

    tab_feature_names: list[str] = sorted(tab_dicts[0].keys())
    X_tab = np.array(
        [[d.get(k, 0.0) for k in tab_feature_names] for d in tab_dicts],
        dtype=np.float32,
    )

    if verbose:
        log(f"[train] Tabular shape: {X_tab.shape}")
        log("[train] Fitting TF-IDF + TruncatedSVD on all tweet text...")

    if fit:
        tfidf = TfidfVectorizer(**TFIDF_PARAMS)
        X_tfidf = tfidf.fit_transform(texts)

        actual_svd_n = min(SVD_N_COMPONENTS, X_tfidf.shape[1] - 1)
        svd = TruncatedSVD(n_components=actual_svd_n, random_state=42)
        X_text = svd.fit_transform(X_tfidf)
        if verbose:
            expl = svd.explained_variance_ratio_.sum()
            log(
                f"[train] TF-IDF vocab: {len(tfidf.vocabulary_):,}  "
                f"SVD components: {actual_svd_n}  "
                f"variance explained: {expl:.1%}"
            )
    else:
        assert tfidf is not None and svd is not None
        X_tfidf = tfidf.transform(texts)
        X_text = svd.transform(X_tfidf)

    text_feature_names = [f"lsa_{i}" for i in range(X_text.shape[1])]
    X = np.hstack([X_tab, X_text.astype(np.float32)])
    all_feature_names = tab_feature_names + text_feature_names

    if verbose:
        log(f"[train] Combined feature matrix: {X.shape}")

    return X, all_feature_names, tfidf, svd  # type: ignore[return-value]


# ── Single-horizon model training ─────────────────────────────────────────────

def train_one_horizon(
    X: np.ndarray,
    y: np.ndarray,
    *,
    feature_names: list[str],
    horizon: str,
    verbose: bool = True,
) -> tuple[object, dict]:
    try:
        from lightgbm import LGBMClassifier
    except ImportError:
        raise RuntimeError("lightgbm is required. Run: pip install lightgbm")

    n_samples = X.shape[0]
    present_classes = np.unique(y)
    n_classes = len(present_classes)

    if verbose:
        dist = {DIRECTION_LABELS[int(cls)]: int(cnt)
                for cls, cnt in zip(*np.unique(y, return_counts=True))}
        log(f"[train] [{horizon}] {n_samples:,} samples, {n_classes} classes  {dist}")

    model = LGBMClassifier(**LGBM_PARAMS)
    X_df = pd.DataFrame(X, columns=feature_names)

    cv_folds = min(5, max(2, n_samples // 30))
    if verbose:
        log(f"[train] [{horizon}] Cross-validation: {cv_folds} folds...")

    cv = StratifiedKFold(n_splits=cv_folds, shuffle=True, random_state=42)

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        cv_preds = cross_val_predict(model, X_df, y, cv=cv, method="predict")

    cv_macro_f1 = f1_score(y, cv_preds, average="macro", zero_division=0)
    cv_weighted_f1 = f1_score(y, cv_preds, average="weighted", zero_division=0)
    cv_report = classification_report(
        y, cv_preds,
        labels=_DIRECTION_LABEL_INDICES,
        target_names=DIRECTION_LABELS,
        zero_division=0,
        output_dict=True,
    )
    cv_conf = confusion_matrix(
        y, cv_preds, labels=_DIRECTION_LABEL_INDICES
    ).tolist()

    if verbose:
        log(f"[train] [{horizon}] macro-F1: {cv_macro_f1:.4f}  weighted-F1: {cv_weighted_f1:.4f}")
        log(
            f"[train] [{horizon}] Report:\n"
            + classification_report(
                y,
                cv_preds,
                labels=_DIRECTION_LABEL_INDICES,
                target_names=DIRECTION_LABELS,
                zero_division=0,
            )
        )

    if verbose:
        log(f"[train] [{horizon}] Fitting final model...")

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        model.fit(X_df, y)

    importances = model.feature_importances_
    top_idx = np.argsort(importances)[::-1][:15]
    top_features = [
        {"feature": feature_names[i], "importance": float(importances[i])}
        for i in top_idx
    ]
    if verbose:
        log(f"[train] [{horizon}] Top features: " +
            ", ".join(f"{fi['feature']}({fi['importance']:.0f})" for fi in top_features[:5]))

    metrics = {
        "cv_folds": cv_folds,
        "cv_macro_f1": cv_macro_f1,
        "cv_weighted_f1": cv_weighted_f1,
        "cv_classification_report": cv_report,
        "cv_confusion_matrix": cv_conf,
        "top_features": top_features,
        "train_samples": n_samples,
        "n_features": int(X.shape[1]),
        "class_distribution": {
            DIRECTION_LABELS[int(cls)]: int(cnt)
            for cls, cnt in zip(*np.unique(y, return_counts=True))
        },
    }
    return model, metrics


# ── Save bundle ────────────────────────────────────────────────────────────────

def save_bundle(
    *,
    models: dict[str, object],
    tfidf: TfidfVectorizer,
    svd: TruncatedSVD,
    feature_names: list[str],
    meta: dict,
    version: str,
    output_dir: Path,
    verbose: bool = True,
) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    out_path = output_dir / f"twitterai_direction_{version}.joblib"

    bundle = {
        "models": models,       # dict[horizon, LGBMClassifier]
        "tfidf": tfidf,
        "svd": svd,
        "feature_names": feature_names,
        "meta": meta,
    }

    joblib.dump(bundle, out_path, compress=3)

    meta_path = output_dir / f"twitterai_direction_{version}_meta.json"
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2, default=str)

    (output_dir / "latest.txt").write_text(out_path.name)

    if verbose:
        size_mb = out_path.stat().st_size / 1024 / 1024
        log(f"[train] Saved: {out_path}  ({size_mb:.1f} MB)")

    return out_path


# ── Main pipeline ──────────────────────────────────────────────────────────────

def run_training(
    *,
    min_outcomes: int = 1,
    version: str = MODEL_VERSION,
    output_dir: Path = MODELS_DIR,
    verbose: bool = True,
    use_ticker_ohe: bool = True,
) -> dict:
    t_start = time.perf_counter()

    Session = get_session_factory()
    with Session() as session:
        rows, texts = load_training_data(
            session, min_outcomes=min_outcomes, verbose=verbose
        )

    if len(rows) < MIN_TOTAL_ROWS:
        msg = (
            f"Only {len(rows)} labeled samples (need {MIN_TOTAL_ROWS}). "
            "Run compute-outcomes first."
        )
        log(f"[train] ERROR: {msg}")
        raise RuntimeError(msg)

    # ── Temporal train/test split (80/20 by tweet time) ──────────────────────
    # Sort by tweet created_at so older tweets train the model and newer tweets
    # evaluate it — the only split that reflects real-world prediction conditions.
    created_ats = [r["created_at"] for r in rows]
    sort_idx = np.argsort([dt.timestamp() if dt else 0 for dt in created_ats])
    cutoff_pos = int(len(sort_idx) * 0.80)
    train_idx = set(sort_idx[:cutoff_pos].tolist())
    test_idx = set(sort_idx[cutoff_pos:].tolist())

    train_cutoff_at = created_ats[sort_idx[cutoff_pos]].isoformat() if created_ats[sort_idx[cutoff_pos]] else None
    if verbose:
        log(f"[train] Temporal split: {len(train_idx)} train / {len(test_idx)} test")
        log(f"[train] Train cutoff: {train_cutoff_at}")

    rows_train = [rows[i] for i in range(len(rows)) if i in train_idx]
    texts_train = [texts[i] for i in range(len(rows)) if i in train_idx]
    rows_test = [rows[i] for i in range(len(rows)) if i in test_idx]
    texts_test = [texts[i] for i in range(len(rows)) if i in test_idx]

    y_all = np.array(
        [LABEL_TO_IDX.get(r["direction_label"], 0) for r in rows],
        dtype=np.int32,
    )
    y_train = np.array(
        [LABEL_TO_IDX.get(r["direction_label"], 0) for r in rows_train],
        dtype=np.int32,
    )
    y_test = np.array(
        [LABEL_TO_IDX.get(r["direction_label"], 0) for r in rows_test],
        dtype=np.int32,
    )
    horizons_train = np.array([r["horizon"] for r in rows_train])
    horizons_test = np.array([r["horizon"] for r in rows_test])

    # Fit text transformers on TRAIN only (no test data leakage)
    X_train, feature_names, tfidf, svd = build_feature_matrix(
        rows_train, texts_train, fit=True, verbose=verbose, use_ticker_ohe=use_ticker_ohe
    )
    X_test, _, _, _ = build_feature_matrix(
        rows_test, texts_test, tfidf=tfidf, svd=svd, fit=False, verbose=False, use_ticker_ohe=use_ticker_ohe
    )

    # Train one model per horizon
    per_horizon_models: dict[str, object] = {}
    per_horizon_metrics: dict[str, dict] = {}

    for horizon in HORIZONS_ORDERED:
        train_mask = horizons_train == horizon
        n = int(train_mask.sum())
        if n < MIN_HORIZON_ROWS:
            log(f"[train] [{horizon}] Only {n} train samples — skipping (need {MIN_HORIZON_ROWS})")
            continue

        X_h = X_train[train_mask]
        y_h = y_train[train_mask]
        model_h, metrics_h = train_one_horizon(
            X_h, y_h,
            feature_names=feature_names,
            horizon=horizon,
            verbose=verbose,
        )

        # ── Held-out test evaluation ─────────────────────────────────────────
        test_mask = horizons_test == horizon
        if test_mask.sum() >= 10:
            X_htest = X_test[test_mask]
            y_htest = y_test[test_mask]
            test_preds = model_h.predict(  # type: ignore[union-attr]
                pd.DataFrame(X_htest, columns=feature_names)
            )
            test_macro_f1 = f1_score(y_htest, test_preds, average="macro", zero_division=0)
            test_report = classification_report(
                y_htest,
                test_preds,
                labels=_DIRECTION_LABEL_INDICES,
                target_names=DIRECTION_LABELS,
                zero_division=0,
                output_dict=True,
            )
            metrics_h["test_macro_f1"] = test_macro_f1
            metrics_h["test_samples"] = int(test_mask.sum())
            metrics_h["test_classification_report"] = test_report
            if verbose:
                log(f"[train] [{horizon}] Held-out test macro-F1: {test_macro_f1:.4f}  (n={test_mask.sum()})")
        else:
            metrics_h["test_macro_f1"] = None
            metrics_h["test_samples"] = int(test_mask.sum())

        per_horizon_models[horizon] = model_h
        per_horizon_metrics[horizon] = metrics_h

    if not per_horizon_models:
        raise RuntimeError(
            "No horizons had enough data to train. Run compute-outcomes first."
        )

    f1s = [m["cv_macro_f1"] for m in per_horizon_metrics.values()]
    overall_macro_f1 = float(np.mean(f1s))
    overall_weighted_f1 = float(np.mean([m["cv_weighted_f1"] for m in per_horizon_metrics.values()]))
    test_f1s = [m["test_macro_f1"] for m in per_horizon_metrics.values() if m.get("test_macro_f1") is not None]
    overall_test_f1 = float(np.mean(test_f1s)) if test_f1s else None

    if verbose:
        log("[train] ── Per-horizon summary ─────────────────────────────────────")
        log(f"[train]   {'H':4s}  {'CV-F1':>8s}  {'Test-F1':>8s}  {'Train':>6s}  {'Test':>5s}")
        for h, m in per_horizon_metrics.items():
            test_f1_str = f"{m['test_macro_f1']:.4f}" if m.get("test_macro_f1") is not None else "   n/a"
            log(
                f"[train]   {h:4s}  {m['cv_macro_f1']:>8.4f}  {test_f1_str:>8s}  "
                f"{m['train_samples']:>6d}  {m.get('test_samples', 0):>5d}"
            )
        test_f1_str = f"{overall_test_f1:.4f}" if overall_test_f1 is not None else "n/a"
        log(f"[train] Mean CV-F1: {overall_macro_f1:.4f}  Mean Test-F1: {test_f1_str}")

    meta = {
        "version": version,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "train_cutoff_at": train_cutoff_at,
        "direction_labels": DIRECTION_LABELS,
        "horizons": list(per_horizon_models.keys()),
        "cv_macro_f1": overall_macro_f1,
        "cv_weighted_f1": overall_weighted_f1,
        "test_macro_f1": overall_test_f1,
        "per_horizon": per_horizon_metrics,
        "total_train_samples": len(rows_train),
        "total_test_samples": len(rows_test),
        "n_features": len(feature_names),
        "use_ticker_ohe": use_ticker_ohe,
        "class_distribution": {
            DIRECTION_LABELS[int(cls)]: int(cnt)
            for cls, cnt in zip(*np.unique(y_train, return_counts=True))
        },
    }

    out_path = save_bundle(
        models=per_horizon_models,
        tfidf=tfidf,
        svd=svd,
        feature_names=feature_names,
        meta=meta,
        version=version,
        output_dir=output_dir,
        verbose=verbose,
    )

    elapsed = time.perf_counter() - t_start
    meta["elapsed_seconds"] = round(elapsed, 2)
    meta["model_path"] = str(out_path)

    log(f"[train] Done in {elapsed:.1f}s  — mean macro-F1: {overall_macro_f1:.4f}")
    return meta


def main() -> int:
    parser = argparse.ArgumentParser(description="Train TwitterAI direction model")
    parser.add_argument("--min-outcomes", type=int, default=1)
    parser.add_argument("--version", type=str, default=MODEL_VERSION)
    parser.add_argument("--out", type=str, default=str(MODELS_DIR))
    args = parser.parse_args()

    try:
        metrics = run_training(
            min_outcomes=args.min_outcomes,
            version=args.version,
            output_dir=Path(args.out),
        )
        print(json.dumps({"ok": True, **metrics}, indent=2, default=str))
        return 0
    except Exception as exc:
        print(f"Training failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
