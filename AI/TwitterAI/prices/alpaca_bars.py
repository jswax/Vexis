"""
Alpaca Market Data provider — nearest price point for stocks and crypto.
"""

from __future__ import annotations

import math
import statistics
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

import requests

from config import get_settings
from log_buffer import log, ts

ET = ZoneInfo("America/New_York")

_cache: dict[str, Any] = {}

# Keep this low so runs don't look "frozen" on bad networks.
HTTP_TIMEOUT_S = 25
SLOW_REQUEST_S = 3.0

_executor = ThreadPoolExecutor(max_workers=4)


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


def _to_iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _abs_delta_s(a: datetime, b: datetime) -> float:
    return abs((a - b).total_seconds())


def _stddev(nums: list[float]) -> float | None:
    if len(nums) < 2:
        return None
    return statistics.stdev(nums)


def _realized_vol(bars: list[dict]) -> float | None:
    rets: list[float] = []
    for i in range(1, len(bars)):
        p0 = bars[i - 1].get("c")
        p1 = bars[i].get("c")
        if p0 and p1 and p0 > 0:
            rets.append(p1 / p0 - 1)
    return _stddev(rets)


def _normalize_crypto(ticker: str) -> str:
    t = ticker.upper().strip()
    if "/" in t:
        return t
    if t.endswith("USD") and len(t) > 3:
        return f"{t[:-3]}/USD"
    return f"{t}/USD"


def _infer_session(dt: datetime) -> tuple[bool, str]:
    et = dt.astimezone(ET)
    weekday = et.weekday()  # 0=Mon, 6=Sun
    if weekday >= 5:
        return False, "closed"
    minutes = et.hour * 60 + et.minute
    if 9 * 60 + 30 <= minutes < 16 * 60:
        return True, "regular"
    return False, "off_hours"


def _log_slow(url: str, elapsed_s: float) -> None:
    if elapsed_s >= SLOW_REQUEST_S:
        log(f"[{ts()}]   alpaca: {elapsed_s:.1f}s {url}")


def _fetch_bars(url: str, headers: dict) -> list[dict]:
    if url in _cache:
        return _cache[url]
    log(f"[{ts()}]   alpaca: GET {url}")
    t0 = time.perf_counter()
    # Use a hard watchdog to avoid OS-level hangs that ignore socket timeouts.
    fut = _executor.submit(requests.get, url, headers=headers, timeout=(5, HTTP_TIMEOUT_S))
    try:
        resp = fut.result(timeout=HTTP_TIMEOUT_S + 10)
    except FuturesTimeout as e:
        log(f"[{ts()}]   alpaca: TIMEOUT {HTTP_TIMEOUT_S}s {url}")
        raise TimeoutError(f"Alpaca request timed out after {HTTP_TIMEOUT_S}s") from e
    finally:
        _log_slow(url, time.perf_counter() - t0)
    resp.raise_for_status()
    data = resp.json()
    result = data.get("bars") or {}
    if isinstance(result, dict):
        # multi-symbol response; caller passes the symbol key
        result = list(result.values())[0] if result else []
    _cache[url] = result
    return result


def _get_stock_bars(symbol: str, start: datetime, end: datetime) -> list[dict]:
    settings = get_settings()
    base = "https://data.alpaca.markets"
    params = (
        f"symbols={symbol}&timeframe=1Min"
        f"&start={_to_iso(start)}&end={_to_iso(end)}"
        f"&limit=10000&adjustment=raw&feed={settings.alpaca_stock_feed}"
    )
    url = f"{base}/v2/stocks/bars?{params}"
    headers = {
        "APCA-API-KEY-ID": settings.alpaca_api_key,
        "APCA-API-SECRET-KEY": settings.alpaca_api_secret,
    }
    # Use shared fetch (timing + cache).
    bars = _fetch_bars(url, headers=headers)
    if isinstance(bars, dict):
        bars = bars.get(symbol) or []
    return bars  # type: ignore[return-value]


def _get_crypto_bars(symbol: str, start: datetime, end: datetime) -> list[dict]:
    settings = get_settings()
    base = "https://data.alpaca.markets"
    loc = settings.alpaca_crypto_loc
    params = (
        f"symbols={symbol}&timeframe=1Min"
        f"&start={_to_iso(start)}&end={_to_iso(end)}"
        f"&limit=10000&sort=asc"
    )
    url = f"{base}/v1beta3/crypto/{loc}/bars?{params}"
    headers = {
        "APCA-API-KEY-ID": settings.alpaca_api_key,
        "APCA-API-SECRET-KEY": settings.alpaca_api_secret,
    }
    bars = _fetch_bars(url, headers=headers)
    if isinstance(bars, dict):
        bars = bars.get(symbol) or []
    return bars  # type: ignore[return-value]


def get_nearest_price(
    ticker: str,
    asset_type: str,
    timestamp: datetime,
) -> PricePoint:
    if asset_type == "CRYPTO":
        symbol = _normalize_crypto(ticker)
        window_s = 2 * 60 * 60
        start = datetime.fromtimestamp(timestamp.timestamp() - window_s, tz=timezone.utc)
        end = datetime.fromtimestamp(timestamp.timestamp() + window_s, tz=timezone.utc)
        bars = _get_crypto_bars(symbol, start, end)
        if not bars:
            raise RuntimeError(f"No crypto bars for {symbol}")
        best = min(bars, key=lambda b: _abs_delta_s(
            datetime.fromisoformat(b["t"].replace("Z", "+00:00")), timestamp
        ))
        rv = _realized_vol(bars[-60:])
        ts = datetime.fromisoformat(best["t"].replace("Z", "+00:00"))
        return PricePoint(
            timestamp=ts,
            price=float(best["c"]),
            volume=best.get("v"),
            vwap=best.get("vw"),
            rsi=None,
            macd=None,
            atr=None,
            realized_volatility=rv,
            market_open_flag=True,
            session_type="24x7",
            raw_json={"source": "alpaca", "kind": "crypto_bars", "symbol": symbol, "best": best},
        )

    # STOCK / ETF / INDEX
    symbol = ticker.upper().strip()
    windows = [2 * 3600, 12 * 3600, 48 * 3600, 7 * 24 * 3600]
    bars: list[dict] = []
    start = end = None
    for w in windows:
        start = datetime.fromtimestamp(timestamp.timestamp() - w, tz=timezone.utc)
        end = datetime.fromtimestamp(timestamp.timestamp() + w, tz=timezone.utc)
        bars = _get_stock_bars(symbol, start, end)
        if bars:
            break

    if not bars:
        raise RuntimeError(
            f"No stock bars for {symbol}. Check Alpaca entitlements or use a market-hours timestamp."
        )

    best = min(bars, key=lambda b: _abs_delta_s(
        datetime.fromisoformat(b["t"].replace("Z", "+00:00")), timestamp
    ))
    ts = datetime.fromisoformat(best["t"].replace("Z", "+00:00"))
    market_open_flag, session_type = _infer_session(ts)
    rv = _realized_vol(bars[-60:])

    return PricePoint(
        timestamp=ts,
        price=float(best["c"]),
        volume=best.get("v"),
        vwap=best.get("vw"),
        rsi=None,
        macd=None,
        atr=None,
        realized_volatility=rv,
        market_open_flag=market_open_flag,
        session_type=session_type,
        raw_json={"source": "alpaca", "kind": "stock_bars", "symbol": symbol, "best": best},
    )


def get_prices_for_timestamps(
    ticker: str,
    asset_type: str,
    timestamps: list[datetime],
    *,
    pad_seconds: int = 2 * 60 * 60,
) -> dict[datetime, PricePoint]:
    """
    Fetch bars once for a window that covers all timestamps, then compute the nearest
    PricePoint for each requested timestamp.

    This is dramatically faster than calling get_nearest_price repeatedly.
    """
    if not timestamps:
        return {}

    # Ensure UTC-aware timestamps.
    ts_utc = [
        (t if t.tzinfo else t.replace(tzinfo=timezone.utc)).astimezone(timezone.utc)
        for t in timestamps
    ]
    start_t = min(ts_utc) - timedelta(seconds=pad_seconds)
    end_t = max(ts_utc) + timedelta(seconds=pad_seconds)

    if asset_type == "CRYPTO":
        symbol = _normalize_crypto(ticker)
        bars = _get_crypto_bars(symbol, start_t, end_t)
        if not bars:
            raise RuntimeError(f"No crypto bars for {symbol}")

        # Pre-parse datetimes once.
        bar_ts = [datetime.fromisoformat(b["t"].replace("Z", "+00:00")) for b in bars]

        out: dict[datetime, PricePoint] = {}
        for target in ts_utc:
            idx = min(range(len(bars)), key=lambda i: _abs_delta_s(bar_ts[i], target))
            best = bars[idx]
            rv = _realized_vol(bars[max(0, idx - 60) : idx + 1])
            ts = bar_ts[idx]
            out[target] = PricePoint(
                timestamp=ts,
                price=float(best["c"]),
                volume=best.get("v"),
                vwap=best.get("vw"),
                rsi=None,
                macd=None,
                atr=None,
                realized_volatility=rv,
                market_open_flag=True,
                session_type="24x7",
                raw_json={
                    "source": "alpaca",
                    "kind": "crypto_bars",
                    "symbol": symbol,
                    "best": best,
                    "window": {"start": _to_iso(start_t), "end": _to_iso(end_t)},
                },
            )
        return out

    # STOCK / ETF / INDEX
    symbol = ticker.upper().strip()
    bars = _get_stock_bars(symbol, start_t, end_t)
    if not bars:
        raise RuntimeError(
            f"No stock bars for {symbol}. Check Alpaca entitlements or use a market-hours timestamp."
        )

    bar_ts = [datetime.fromisoformat(b["t"].replace("Z", "+00:00")) for b in bars]

    out: dict[datetime, PricePoint] = {}
    for target in ts_utc:
        idx = min(range(len(bars)), key=lambda i: _abs_delta_s(bar_ts[i], target))
        best = bars[idx]
        ts = bar_ts[idx]
        market_open_flag, session_type = _infer_session(ts)
        rv = _realized_vol(bars[max(0, idx - 60) : idx + 1])
        out[target] = PricePoint(
            timestamp=ts,
            price=float(best["c"]),
            volume=best.get("v"),
            vwap=best.get("vw"),
            rsi=None,
            macd=None,
            atr=None,
            realized_volatility=rv,
            market_open_flag=market_open_flag,
            session_type=session_type,
            raw_json={
                "source": "alpaca",
                "kind": "stock_bars",
                "symbol": symbol,
                "best": best,
                "window": {"start": _to_iso(start_t), "end": _to_iso(end_t)},
            },
        )
    return out
