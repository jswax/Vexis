"""
Alpaca Market Data provider.

Performance design:
  get_bars_batch()            — fetch raw 1-min bars for N tickers in ONE API call.
  map_tweet_to_pricepoints()  — map pre-fetched bars to PricePoints for a single tweet.
                                Called N times (once per tweet) but makes ZERO API calls.

This keeps the API call count at 1-2 per compute run (one batch + maybe one
pagination page) regardless of how many tweets or tickers are in the batch.

Per-tweet timestamp mapping rules:
  base (t0):   FLOOR  — last bar at/before tweet time  -> actual price when tweet posted.
  horizons:   CEILING — first bar at/after horizon time -> price the market reached,
              then walk forward to the next strictly later 1-min print when needed
              so sparse tape does not blank out M15/M30/... in the UI.
"""

from __future__ import annotations

import statistics
import time
from bisect import bisect_left, bisect_right
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

import requests

from config import get_settings
from log_buffer import log, ts as log_ts

ET = ZoneInfo("America/New_York")
_cache: dict[str, Any] = {}
HTTP_TIMEOUT_S = 25
SLOW_REQUEST_S = 3.0
_executor = ThreadPoolExecutor(max_workers=8)


# ── Types ─────────────────────────────────────────────────────────────────────

@dataclass
class PricePoint:
    timestamp: datetime
    price: float
    volume: float | None
    vwap: float | None
    rsi: float | None
    macd: float | None
    atr: float | None
    realized_volatility: float | None
    market_open_flag: bool
    session_type: str | None
    raw_json: dict[str, Any]


# ── Internal helpers ──────────────────────────────────────────────────────────

def _to_iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _realized_vol(bars: list[dict]) -> float | None:
    rets = [
        bars[i]["c"] / bars[i - 1]["c"] - 1
        for i in range(1, len(bars))
        if bars[i - 1].get("c") and bars[i - 1]["c"] > 0 and bars[i].get("c")
    ]
    return statistics.stdev(rets) if len(rets) >= 2 else None


def _normalize_crypto(ticker: str) -> str:
    t = ticker.upper().strip()
    if "/" in t:
        return t
    if t.endswith("USD") and len(t) > 3:
        return f"{t[:-3]}/USD"
    return f"{t}/USD"


def _infer_session(dt: datetime) -> tuple[bool, str]:
    et = dt.astimezone(ET)
    if et.weekday() >= 5:
        return False, "closed"
    m = et.hour * 60 + et.minute
    if 9 * 60 + 30 <= m < 16 * 60:
        return True, "regular"
    return False, "off_hours"


def _floor(bar_ts: list[datetime], target: datetime) -> int:
    """Last bar at/before target. Falls back to 0."""
    return max(0, bisect_right(bar_ts, target) - 1)


def _alpaca_headers() -> dict[str, str]:
    s = get_settings()
    return {"APCA-API-KEY-ID": s.alpaca_api_key, "APCA-API-SECRET-KEY": s.alpaca_api_secret}


def _http_get(url: str) -> requests.Response:
    t0 = time.perf_counter()
    last_exc: Exception | None = None
    for attempt in range(1, 4):
        fut = _executor.submit(
            requests.get,
            url,
            headers=_alpaca_headers(),
            timeout=(5, HTTP_TIMEOUT_S),
        )
        try:
            resp = fut.result(timeout=HTTP_TIMEOUT_S + 10)
            # Retry transient failures
            if resp.status_code == 429 or resp.status_code >= 500:
                raise requests.HTTPError(
                    f"Alpaca transient HTTP {resp.status_code}",
                    response=resp,
                )
            break
        except Exception as exc:
            last_exc = exc
            if attempt >= 3:
                if isinstance(exc, FuturesTimeout):
                    raise TimeoutError(f"Alpaca timed out: {url[:80]}") from exc
                raise
            backoff = min(6.0, 0.5 * (2 ** (attempt - 1)))
            log(f"[{log_ts()}]   alpaca: retry {attempt}/3 in {backoff:.1f}s ({type(exc).__name__})")
            time.sleep(backoff)
    else:  # pragma: no cover
        raise last_exc  # type: ignore[misc]

    elapsed = time.perf_counter() - t0
    if elapsed >= SLOW_REQUEST_S:
        log(f"[{log_ts()}]   alpaca: {elapsed:.1f}s for request")
    resp.raise_for_status()
    return resp


def _make_price_point(
    bars: list[dict],
    idx: int,
    bar_ts: list[datetime],
    *,
    symbol: str,
    is_crypto: bool,
) -> PricePoint:
    best = bars[idx]
    bar_time = bar_ts[idx]
    rv = _realized_vol(bars[max(0, idx - 60): idx + 1])
    if is_crypto:
        market_open, session = True, "24x7"
    else:
        market_open, session = _infer_session(bar_time)
    return PricePoint(
        timestamp=bar_time,
        price=float(best["c"]),
        volume=best.get("v"),
        vwap=best.get("vw"),
        rsi=None, macd=None, atr=None,
        realized_volatility=rv,
        market_open_flag=market_open,
        session_type=session,
        raw_json={"source": "alpaca", "symbol": symbol, "bar": best},
    )


# ── Primary: batch bar fetch ──────────────────────────────────────────────────

def get_bars_batch(
    tickers: list[str],
    start: datetime,
    end: datetime,
) -> dict[str, list[dict]]:
    """
    Fetch 1-minute bars for all stock/ETF tickers in ONE paginated Alpaca request.
    Returns {TICKER: [bar, ...]}. Results are cached.
    Crypto tickers are silently skipped (handled separately if needed).
    """
    if not tickers:
        return {}

    settings = get_settings()
    symbols = sorted({t.upper() for t in tickers})
    sym_str = ",".join(symbols)
    cache_key = f"batch:{sym_str}:{_to_iso(start)}:{_to_iso(end)}"
    if cache_key in _cache:
        log(f"[{log_ts()}]   alpaca: cache hit for {len(symbols)} syms")
        return _cache[cache_key]

    base_url = "https://data.alpaca.markets/v2/stocks/bars"
    result: dict[str, list[dict]] = {s: [] for s in symbols}
    page_token: str | None = None
    page = 0

    log(
        f"[{log_ts()}]   alpaca: batch fetching {len(symbols)} syms "
        f"{_to_iso(start)} -> {_to_iso(end)}"
    )

    while True:
        page += 1
        params = (
            f"symbols={sym_str}&timeframe=1Min"
            f"&start={_to_iso(start)}&end={_to_iso(end)}"
            f"&limit=10000&adjustment=raw&feed={settings.alpaca_stock_feed}&sort=asc"
        )
        if page_token:
            params += f"&page_token={page_token}"

        data = _http_get(f"{base_url}?{params}").json()
        bars_map: dict = data.get("bars") or {}
        for sym, bars in bars_map.items():
            result.setdefault(sym.upper(), []).extend(bars or [])

        page_token = data.get("next_page_token")
        total = sum(len(v) for v in result.values())
        log(f"[{log_ts()}]   alpaca: page {page} — {total} bars total, "
            f"next_page={bool(page_token)}")
        if not page_token:
            break

    _cache[cache_key] = result
    return result


# ── Per-tweet mapping (zero API calls) ───────────────────────────────────────

def map_tweet_to_pricepoints(
    bars: list[dict],
    base_ts: datetime,
    horizon_times: list[datetime],
    *,
    symbol: str,
    is_crypto: bool = False,
) -> tuple[PricePoint | None, list[PricePoint | None]]:
    """
    Given pre-fetched bars for one ticker, compute:
      - base PricePoint  (floor: last bar at/before base_ts)
      - horizon PricePoints: first bar at/after each horizon_time, then advance
        to the next strictly later 1-minute print than the previous horizon so
        sparse tape / session gaps do not reuse the same bar for M5→M15→… and
        horizons stay ordered in time.

    If there is no bar strictly after the previous chosen print and still inside
    the fetched window, that horizon is None (no clamping to the series end).

    Makes ZERO API calls — purely in-memory bar lookups.
    """
    if not bars:
        return None, [None] * len(horizon_times)

    bar_ts = [datetime.fromisoformat(b["t"].replace("Z", "+00:00")) for b in bars]
    base_ts_utc = _utc(base_ts)

    # Base: floor (last bar at/before tweet time)
    base_idx = _floor(bar_ts, base_ts_utc)
    base_pp = _make_price_point(bars, base_idx, bar_ts, symbol=symbol, is_crypto=is_crypto)
    prev_ts = bar_ts[base_idx]

    horizon_pps: list[PricePoint | None] = []
    for h_ts in horizon_times:
        h_ts_utc = _utc(h_ts)
        j = bisect_left(bar_ts, h_ts_utc)
        while j < len(bar_ts) and bar_ts[j] <= prev_ts:
            j += 1
        if j >= len(bar_ts):
            horizon_pps.append(None)
            continue
        horizon_pps.append(
            _make_price_point(bars, j, bar_ts, symbol=symbol, is_crypto=is_crypto)
        )
        prev_ts = bar_ts[j]

    return base_pp, horizon_pps


# ── Batch prices (used by outcomes job) ──────────────────────────────────────

def get_batch_prices(
    tickers: list[str],
    timestamps: list[datetime],
    *,
    pad_seconds: int = 2 * 60 * 60,
) -> dict[str, dict[datetime, PricePoint | None]]:
    """
    Batch-fetch prices for multiple tickers at multiple timestamps in ONE Alpaca call.
    Returns {TICKER: {timestamp: PricePoint | None}}.
    Uses floor lookup (last bar at/before each timestamp) for all timestamps.
    Crypto tickers are silently skipped (returned as all-None).
    """
    if not tickers or not timestamps:
        return {}

    ts_utc = sorted({_utc(t) for t in timestamps})
    start_t = ts_utc[0] - timedelta(seconds=pad_seconds)
    end_t = ts_utc[-1] + timedelta(seconds=pad_seconds)

    symbols = [t.upper() for t in tickers]
    bars_map = get_bars_batch(symbols, start_t, end_t)

    result: dict[str, dict[datetime, PricePoint | None]] = {}
    for symbol in symbols:
        bars = bars_map.get(symbol, [])
        if not bars:
            result[symbol] = {t: None for t in ts_utc}
            continue

        bar_ts = [datetime.fromisoformat(b["t"].replace("Z", "+00:00")) for b in bars]
        ticker_result: dict[datetime, PricePoint | None] = {}
        for t in ts_utc:
            idx = _floor(bar_ts, t)
            ticker_result[t] = _make_price_point(
                bars, idx, bar_ts, symbol=symbol, is_crypto=False
            )
        result[symbol] = ticker_result

    return result


# ── Legacy wrappers (used by ad-hoc lookups / recompute) ─────────────────────

def get_prices_for_timestamps(
    ticker: str,
    asset_type: str,
    timestamps: list[datetime],
    *,
    pad_seconds: int = 2 * 60 * 60,
) -> dict[datetime, PricePoint | None]:
    """
    Single-ticker convenience wrapper. Fetches bars and maps all timestamps.
    First timestamp uses floor (base), rest use ceiling.
    """
    if not timestamps:
        return {}

    ts_utc = [_utc(t) for t in timestamps]
    start_t = min(ts_utc) - timedelta(seconds=pad_seconds)
    end_t   = max(ts_utc) + timedelta(seconds=pad_seconds)
    sorted_ts = sorted(ts_utc)

    if asset_type == "CRYPTO":
        symbol = _normalize_crypto(ticker)
        settings = get_settings()
        loc = settings.alpaca_crypto_loc
        params = (
            f"symbols={symbol}&timeframe=1Min"
            f"&start={_to_iso(start_t)}&end={_to_iso(end_t)}"
            f"&limit=10000&sort=asc"
        )
        url = f"https://data.alpaca.markets/v1beta3/crypto/{loc}/bars?{params}"
        cache_key = f"crypto:{symbol}:{_to_iso(start_t)}:{_to_iso(end_t)}"
        if cache_key not in _cache:
            data = _http_get(url).json()
            raw = data.get("bars") or {}
            bars = raw.get(symbol, raw) if isinstance(raw, dict) else raw
            _cache[cache_key] = bars if isinstance(bars, list) else []
        bars = _cache[cache_key]
        is_crypto = True
    else:
        symbol = ticker.upper()
        bars_map = get_bars_batch([symbol], start_t, end_t)
        bars = bars_map.get(symbol, [])
        is_crypto = False

    if not bars:
        return {}

    base_ts = sorted_ts[0]
    horizons = sorted_ts[1:]
    base_pp, horizon_pps = map_tweet_to_pricepoints(
        bars, base_ts, horizons, symbol=symbol, is_crypto=is_crypto
    )
    out: dict[datetime, PricePoint | None] = {base_ts: base_pp}
    for t, pp in zip(horizons, horizon_pps):
        out[t] = pp
    return out


def get_nearest_price(ticker: str, asset_type: str, timestamp: datetime) -> PricePoint:
    """Legacy single-point lookup. Raises if no bar found."""
    result = get_prices_for_timestamps(ticker, asset_type, [timestamp])
    pp = result.get(_utc(timestamp))
    if pp is None:
        raise RuntimeError(f"No price data for {ticker} at {timestamp}")
    return pp
