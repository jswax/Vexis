"""
Return computation, volatility adjustment, impact scoring, and direction labeling.
"""

from __future__ import annotations

import math
from typing import Literal

from config import get_settings

HORIZONS: list[dict] = [
    {"horizon": "M5",  "seconds": 5 * 60},
    {"horizon": "M15", "seconds": 15 * 60},
    {"horizon": "H1",  "seconds": 60 * 60},
    {"horizon": "H4",  "seconds": 4 * 60 * 60},
    {"horizon": "D1",  "seconds": 24 * 60 * 60},
]

DIRECTION_THRESHOLD = 0.002  # 20 bps dead-zone


def compute_return(price0: float, price1: float) -> float:
    if not math.isfinite(price0) or not math.isfinite(price1) or price0 <= 0:
        return 0.0
    return price1 / price0 - 1


def compute_excess_return(raw_return: float, benchmark_return: float | None) -> float | None:
    if benchmark_return is None:
        return None
    return raw_return - benchmark_return


def compute_expected_volatility(
    *,
    price_at_tweet: float,
    atr: float | None = None,
    realized_volatility: float | None = None,
) -> float | None:
    if realized_volatility is not None and math.isfinite(realized_volatility) and realized_volatility > 0:
        return realized_volatility
    if atr is not None and math.isfinite(atr) and atr > 0 and price_at_tweet > 0:
        return atr / price_at_tweet
    return None


def compute_vol_adjusted_return(
    excess_return: float | None,
    expected_volatility: float | None,
) -> float | None:
    if excess_return is None:
        return None
    if expected_volatility is None or not math.isfinite(expected_volatility) or expected_volatility <= 0:
        return excess_return
    return excess_return / expected_volatility


def compute_impact_score(vol_adjusted_return: float | None) -> int:
    settings = get_settings()
    if vol_adjusted_return is None or not math.isfinite(vol_adjusted_return):
        return 0
    scaled = vol_adjusted_return * settings.impact_score_multiplier
    rounded = round(scaled)
    return max(-10, min(10, rounded))


def compute_direction_label(
    excess_return: float | None,
    raw_return: float,
) -> Literal["BULLISH", "BEARISH", "NEUTRAL"]:
    r = excess_return if excess_return is not None else raw_return
    if not math.isfinite(r):
        return "NEUTRAL"
    if r >= DIRECTION_THRESHOLD:
        return "BULLISH"
    if r <= -DIRECTION_THRESHOLD:
        return "BEARISH"
    return "NEUTRAL"


def resolve_benchmark_ticker(asset_type: str) -> str:
    settings = get_settings()
    if asset_type == "CRYPTO":
        return settings.default_benchmark_crypto
    return settings.default_benchmark_stock
