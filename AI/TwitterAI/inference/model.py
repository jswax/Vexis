"""
TwitterAI direction prediction — inference module.

Provides a lazy-loading Predictor that:
  1. Loads the model bundle (LightGBM + TF-IDF + SVD) on first call.
  2. Predicts BULLISH / BEARISH / NEUTRAL for every horizon in
     HORIZONS_ORDERED given a (tweet, ticker, author) context.
  3. Returns typed HorizonPrediction dataclasses that are safe to
     serialize to JSON / store in the DB.

Usage
─────
    from inference.model import get_predictor

    preds = get_predictor().predict_all_horizons(
        text="NVDA crushes earnings guidance raised...",
        ticker="NVDA",
        asset_type="STOCK",
        match_method="cashtag",
        match_confidence=0.95,
        username="example_user",
        author_verified=True,
        followers_count=50_000,
        spam_score=0.05,
        credibility_score=0.8,
        created_at=datetime.now(timezone.utc),
    )
    for p in preds:
        print(p.horizon, p.direction, f"{p.confidence:.2%}")
"""

from __future__ import annotations

import sys
import threading
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

# ── Project root on path ───────────────────────────────────────────────────────
_HERE = Path(__file__).resolve().parent
_ROOT = _HERE.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from log_buffer import log
from train.features import (
    DIRECTION_LABELS,
    HORIZONS_ORDERED,
    IDX_TO_LABEL,
    LABEL_TO_IDX,
    extract_features,
    features_to_vector,
)

# ── Types ──────────────────────────────────────────────────────────────────────

@dataclass
class HorizonPrediction:
    horizon: str
    direction: str          # NEUTRAL | BULLISH | BEARISH
    confidence: float       # probability of the predicted class
    bullish_prob: float
    bearish_prob: float
    neutral_prob: float
    model_version: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


# ── Model bundle path resolution ───────────────────────────────────────────────

MODELS_DIR = _ROOT / "models"


def _resolve_bundle_path(version: str | None = None) -> Path | None:
    """
    Return the path to the model bundle file.
    If version is None, read models/latest.txt for the current best model.
    Returns None if no trained model exists yet.
    """
    latest_ptr = MODELS_DIR / "latest.txt"

    if version is not None:
        p = MODELS_DIR / f"twitterai_direction_{version}.joblib"
        return p if p.exists() else None

    if latest_ptr.exists():
        name = latest_ptr.read_text().strip()
        p = MODELS_DIR / name
        return p if p.exists() else None

    # Fallback: any .joblib file in models/
    candidates = sorted(MODELS_DIR.glob("twitterai_direction_*.joblib"))
    return candidates[-1] if candidates else None


# ── Predictor ──────────────────────────────────────────────────────────────────

class Predictor:
    """
    Thread-safe lazy-loading wrapper around a trained LightGBM bundle.

    A single global instance is created by get_predictor(). The model
    is loaded from disk on the first call to any predict_* method.
    """

    def __init__(self, version: str | None = None) -> None:
        self._version = version
        self._bundle: dict[str, Any] | None = None
        self._lock = threading.Lock()
        self._load_error: str | None = None

    # ── Loading ────────────────────────────────────────────────────────────────

    def _load(self) -> bool:
        """Load bundle from disk. Returns True on success."""
        if self._bundle is not None:
            return True
        if self._load_error:
            return False  # don't retry a known-bad state; caller will skip

        with self._lock:
            if self._bundle is not None:
                return True

            path = _resolve_bundle_path(self._version)
            if path is None:
                self._load_error = (
                    "No trained model found. Run training first via the Train tab."
                )
                return False

            try:
                import joblib

                bundle = joblib.load(path)
                self._bundle = bundle
                ver = (bundle.get("meta") or {}).get("version", "?")
                f1 = (bundle.get("meta") or {}).get("cv_macro_f1", None)
                f1_str = f"  CV macro-F1={f1:.4f}" if f1 else ""
                log(f"[inference] Model loaded: {path.name}  version={ver}{f1_str}")
                return True
            except Exception as exc:
                self._load_error = str(exc)
                log(f"[inference] Failed to load model: {exc}")
                return False

    def reload(self) -> bool:
        """Force reload from disk (e.g. after a new training run)."""
        with self._lock:
            self._bundle = None
            self._load_error = None
        return self._load()

    @property
    def is_ready(self) -> bool:
        return self._load()

    @property
    def model_version(self) -> str:
        if not self._load():
            return "none"
        meta = self._bundle.get("meta") or {}  # type: ignore[union-attr]
        return str(meta.get("version", "unknown"))

    @property
    def meta(self) -> dict[str, Any]:
        if not self._load():
            return {}
        return dict(self._bundle.get("meta") or {})  # type: ignore[union-attr]

    # ── Core inference ─────────────────────────────────────────────────────────

    def _predict_single(
        self, feature_dict: dict[str, float], horizon: str
    ) -> HorizonPrediction:
        """
        Run inference for one (feature_dict, horizon) sample.
        The caller must ensure _load() returned True before calling this.
        Supports both per-horizon bundles (bundle["models"][horizon]) and
        legacy single-model bundles (bundle["model"]).
        """
        assert self._bundle is not None
        # Per-horizon bundle (current format)
        if "models" in self._bundle:
            models: dict = self._bundle["models"]
            model = models.get(horizon) or next(iter(models.values()))
        else:
            model = self._bundle["model"]
        feature_names: list[str] = self._bundle["feature_names"]
        tfidf = self._bundle["tfidf"]
        svd = self._bundle["svd"]
        meta = self._bundle.get("meta") or {}
        version = str(meta.get("version", "unknown"))

        # Tabular part — filter to only the tab features (not LSA)
        n_lsa = svd.n_components
        n_tab = len(feature_names) - n_lsa
        tab_names = feature_names[:n_tab]

        tab_vec = features_to_vector(feature_dict, tab_names)

        # LSA text part
        text = feature_dict.get("_raw_text", "")  # injected by predict methods
        X_tfidf = tfidf.transform([text])
        X_lsa = svd.transform(X_tfidf)

        X = np.array([tab_vec + X_lsa[0].tolist()], dtype=np.float32)
        X_df = pd.DataFrame(X, columns=feature_names)

        proba = model.predict_proba(X_df)[0]  # shape (n_classes,)
        pred_idx = int(proba.argmax())
        pred_label = IDX_TO_LABEL.get(pred_idx, "NEUTRAL")

        neutral_p = float(proba[LABEL_TO_IDX["NEUTRAL"]])
        bullish_p = float(proba[LABEL_TO_IDX["BULLISH"]])
        bearish_p = float(proba[LABEL_TO_IDX["BEARISH"]])

        return HorizonPrediction(
            horizon=horizon,
            direction=pred_label,
            confidence=float(proba[pred_idx]),
            bullish_prob=bullish_p,
            bearish_prob=bearish_p,
            neutral_prob=neutral_p,
            model_version=version,
        )

    # ── Public API ─────────────────────────────────────────────────────────────

    def predict_all_horizons(
        self,
        *,
        text: str,
        ticker: str = "",
        asset_type: str = "STOCK",
        match_method: str = "",
        match_confidence: float = 0.7,
        username: str | None = None,
        author_verified: bool = False,
        followers_count: int | None = None,
        following_count: int | None = None,
        statuses_count: int | None = None,
        spam_score: float | None = None,
        credibility_score: float | None = None,
        is_retweet: bool = False,
        is_reply: bool = False,
        is_quote: bool = False,
        has_images: bool = False,
        has_video: bool = False,
        like_count: int | None = None,
        retweet_count: int | None = None,
        reply_count: int | None = None,
        view_count: int | None = None,
        created_at: datetime | None = None,
    ) -> list[HorizonPrediction]:
        """
        Predict direction for all 7 horizons for a single (tweet, ticker) pair.
        Returns an empty list if no model is loaded.
        """
        if not self._load():
            return []

        # Features are horizon-agnostic; each sub-model handles its own horizon.
        base_feats = extract_features(
            text=text,
            username=username,
            author_verified=author_verified,
            followers_count=followers_count,
            following_count=following_count,
            statuses_count=statuses_count,
            spam_score=spam_score,
            credibility_score=credibility_score,
            ticker=ticker,
            asset_type=asset_type,
            match_method=match_method,
            match_confidence=match_confidence,
            is_retweet=is_retweet,
            is_reply=is_reply,
            is_quote=is_quote,
            has_images=has_images,
            has_video=has_video,
            like_count=like_count,
            retweet_count=retweet_count,
            reply_count=reply_count,
            view_count=view_count,
            created_at=created_at,
        )
        base_feats["_raw_text"] = text  # type: ignore[assignment]

        results: list[HorizonPrediction] = []
        for horizon in HORIZONS_ORDERED:
            results.append(self._predict_single(base_feats, horizon))

        return results

    def predict_horizon(
        self,
        *,
        horizon: str = "D1",
        text: str,
        ticker: str = "",
        asset_type: str = "STOCK",
        match_method: str = "",
        match_confidence: float = 0.7,
        username: str | None = None,
        author_verified: bool = False,
        followers_count: int | None = None,
        following_count: int | None = None,
        statuses_count: int | None = None,
        spam_score: float | None = None,
        credibility_score: float | None = None,
        is_retweet: bool = False,
        is_reply: bool = False,
        is_quote: bool = False,
        has_images: bool = False,
        has_video: bool = False,
        like_count: int | None = None,
        retweet_count: int | None = None,
        reply_count: int | None = None,
        view_count: int | None = None,
        created_at: datetime | None = None,
    ) -> HorizonPrediction | None:
        """
        Predict for a single (tweet, ticker, horizon) triple.
        Returns None if no model is loaded.
        """
        if not self._load():
            return None

        feats = extract_features(
            text=text,
            username=username,
            author_verified=author_verified,
            followers_count=followers_count,
            following_count=following_count,
            statuses_count=statuses_count,
            spam_score=spam_score,
            credibility_score=credibility_score,
            ticker=ticker,
            asset_type=asset_type,
            match_method=match_method,
            match_confidence=match_confidence,
            is_retweet=is_retweet,
            is_reply=is_reply,
            is_quote=is_quote,
            has_images=has_images,
            has_video=has_video,
            like_count=like_count,
            retweet_count=retweet_count,
            reply_count=reply_count,
            view_count=view_count,
            created_at=created_at,
        )
        feats["_raw_text"] = text  # type: ignore[assignment]
        return self._predict_single(feats, horizon)


# ── Global singleton ───────────────────────────────────────────────────────────

_predictor: Predictor | None = None
_predictor_lock = threading.Lock()


def get_predictor() -> Predictor:
    """Return the global Predictor singleton (creates it on first call)."""
    global _predictor
    if _predictor is None:
        with _predictor_lock:
            if _predictor is None:
                _predictor = Predictor()
    return _predictor


def reload_predictor() -> bool:
    """
    Force the global predictor to reload its model bundle.
    Call this after a training run completes so ingest picks up
    the new model without a service restart.
    """
    return get_predictor().reload()
