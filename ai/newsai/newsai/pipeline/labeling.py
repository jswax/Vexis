"""
Auto-labeling: raw % move over the impact window, then percentile scaling to [-10, 10].
"""

from __future__ import annotations

import numpy as np


def raw_delta_pct(price_t0: float, price_tn: float) -> float:
    if price_t0 == 0:
        raise ValueError("price_t0 cannot be zero")
    return (price_tn - price_t0) / price_t0 * 100.0


def impact_score_from_delta(raw_delta: float, p95_abs_delta: float) -> float:
    """
    score = clip((raw_delta / p95) * 10, -10, 10)
    p95_abs_delta should be the 95th percentile of |delta| over the training distribution.
    """
    if p95_abs_delta <= 0:
        return 0.0
    scaled = (raw_delta / p95_abs_delta) * 10.0
    return float(np.clip(scaled, -10.0, 10.0))


def neutral_bucket(score: float, band: float = 1.0) -> bool:
    """Scores in (-band, band) are treated as neutral / hard-to-learn."""
    return abs(score) < band


def compute_p95_abs(deltas: list[float] | np.ndarray) -> float:
    arr = np.asarray(np.abs(deltas), dtype=float)
    if arr.size == 0:
        return 0.5
    return float(np.percentile(arr, 95))
