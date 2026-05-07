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
    {"horizon": "M30", "seconds": 30 * 60},
    {"horizon": "H1",  "seconds": 60 * 60},
    {"horizon": "H4",  "seconds": 4 * 60 * 60},
    {"horizon": "H6",  "seconds": 6 * 60 * 60},
    {"horizon": "D1",  "seconds": 24 * 60 * 60},
]

# Per-horizon thresholds: short horizons use lower thresholds because typical
# intraday excess returns are smaller than daily ones. The same 20bps bar that's
# easy to cross in a day is effectively noise over 5 minutes, so BEARISH/BULLISH
# labels become very sparse at short horizons when using a flat threshold.
HORIZON_THRESHOLDS: dict[str, float] = {
    "M5":  0.001,   # 10 bps — 5-min excess moves rarely exceed 20bps
    "M15": 0.001,   # 10 bps
    "M30": 0.0015,  # 15 bps
    "H1":  0.002,   # 20 bps (original default)
    "H4":  0.002,   # 20 bps
    "H6":  0.002,   # 20 bps
    "D1":  0.003,   # 30 bps — daily moves should be substantial to be directional
}
DIRECTION_THRESHOLD = 0.002  # fallback for callers that don't pass horizon


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
    settings = get_settings()
    denom = max(float(expected_volatility), float(settings.impact_vol_floor))
    return excess_return / denom


def scale_expected_volatility_for_horizon(
    expected_volatility: float | None,
    *,
    horizon_seconds: int,
    bar_seconds: int = 60,
) -> float | None:
    """
    Convert a per-bar (default: 1-minute) volatility estimate into a horizon-scaled
    estimate using sqrt(time) scaling.
    """
    if expected_volatility is None or not math.isfinite(expected_volatility) or expected_volatility <= 0:
        return None
    n = max(1.0, float(horizon_seconds) / float(bar_seconds))
    return float(expected_volatility) * math.sqrt(n)


def compute_impact_score(
    vol_adjusted_return: float | None,
    *,
    market_open_flag: bool | None = None,
    session_type: str | None = None,
) -> int:
    settings = get_settings()
    if vol_adjusted_return is None or not math.isfinite(vol_adjusted_return):
        return 0
    scaled = vol_adjusted_return * settings.impact_score_multiplier
    # Make it harder to score extremely high off-hours.
    if market_open_flag is False or (session_type is not None and session_type != "regular"):
        scaled *= settings.off_hours_impact_multiplier
    rounded = round(scaled)
    return max(-10, min(10, rounded))


def compute_direction_label(
    excess_return: float | None,
    raw_return: float | None,
    horizon: str | None = None,
) -> Literal["BULLISH", "BEARISH", "NEUTRAL"]:
    threshold = HORIZON_THRESHOLDS.get(horizon, DIRECTION_THRESHOLD) if horizon else DIRECTION_THRESHOLD
    r = excess_return if excess_return is not None else raw_return
    if r is None or not math.isfinite(r):
        return "NEUTRAL"
    if r >= threshold:
        return "BULLISH"
    if r <= -threshold:
        return "BEARISH"
    return "NEUTRAL"


def resolve_benchmark_ticker(asset_type: str) -> str:
    settings = get_settings()
    if asset_type == "CRYPTO":
        return settings.default_benchmark_crypto
    return settings.default_benchmark_stock
