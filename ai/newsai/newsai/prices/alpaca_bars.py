"""
Alpaca Market Data — 1-minute OHLCV for QQQ (REST v2).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterator, Optional
from urllib.parse import urlencode

import requests

from newsai.config import get_settings


@dataclass
class MinuteBar:
    ts: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float


def _parse_bar(b: dict) -> MinuteBar:
    # Alpaca returns RFC3339 nanoseconds
    raw_t = b["t"]
    if raw_t.endswith("Z"):
        raw_t = raw_t[:-1] + "+00:00"
    ts = datetime.fromisoformat(raw_t)
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return MinuteBar(
        ts=ts.astimezone(timezone.utc),
        open=float(b["o"]),
        high=float(b["h"]),
        low=float(b["l"]),
        close=float(b["c"]),
        volume=float(b.get("v") or 0),
    )


def fetch_qqq_1min_bars(
    start: datetime,
    end: datetime,
    *,
    session: Optional[requests.Session] = None,
) -> list[MinuteBar]:
    settings = get_settings()
    if not settings.alpaca_api_key_id or not settings.alpaca_api_secret_key:
        raise RuntimeError("Set ALPACA_API_KEY_ID and ALPACA_API_SECRET_KEY")

    if start.tzinfo is None or end.tzinfo is None:
        raise ValueError("start and end must be timezone-aware")

    start_utc = start.astimezone(timezone.utc)
    end_utc = end.astimezone(timezone.utc)

    base = settings.alpaca_data_base_url.rstrip("/")
    path = f"/v2/stocks/{settings.symbol}/bars"
    headers = {
        "APCA-API-KEY-ID": settings.alpaca_api_key_id,
        "APCA-API-SECRET-KEY": settings.alpaca_api_secret_key,
    }

    sess = session or requests.Session()
    bars: list[MinuteBar] = []
    page_token: Optional[str] = None

    while True:
        q = {
            "timeframe": "1Min",
            "start": start_utc.isoformat().replace("+00:00", "Z"),
            "end": end_utc.isoformat().replace("+00:00", "Z"),
            "limit": "10000",
            "adjustment": "raw",
            "feed": settings.alpaca_bar_feed,
        }
        if page_token:
            q["page_token"] = page_token
        url = f"{base}{path}?{urlencode(q)}"
        r = sess.get(url, headers=headers, timeout=120)
        if r.status_code >= 400:
            raise RuntimeError(f"Alpaca bars error {r.status_code}: {r.text[:500]}")
        payload = r.json()
        for b in payload.get("bars") or []:
            bars.append(_parse_bar(b))
        page_token = payload.get("next_page_token")
        if not page_token:
            break

    bars.sort(key=lambda x: x.ts)
    return bars


def iter_bar_dicts(bars: list[MinuteBar]) -> Iterator[dict]:
    s = get_settings()
    for b in bars:
        yield {
            "symbol": s.symbol,
            "ts": b.ts,
            "open": b.open,
            "high": b.high,
            "low": b.low,
            "close": b.close,
            "volume": b.volume,
        }
