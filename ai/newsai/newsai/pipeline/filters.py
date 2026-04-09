"""
Noise reduction hooks from MVP Phase 2.2 (stubs + simple heuristics).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Iterable, Optional

# Scheduled macro events (expand / load from DB in production)
MACRO_KEYWORDS = (
    "FOMC",
    "Federal Reserve",
    "CPI",
    "nonfarm payroll",
    "jobs report",
    "NFP",
)

TOP_HOLDINGS_EARNINGS_TICKERS = ("AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META")


@dataclass
class FilterResult:
    exclude: bool
    reasons: list[str] = field(default_factory=list)


def headline_hits_macro_calendar(headline: str, body: Optional[str] = None) -> bool:
    text = f"{headline} {body or ''}".upper()
    return any(k.upper() in text for k in MACRO_KEYWORDS)


def headline_mentions_earnings_ticker(headline: str) -> bool:
    u = headline.upper()
    return any(t in u for t in TOP_HOLDINGS_EARNINGS_TICKERS)


def competing_article_nearby(
    published_at: datetime,
    other_times: Iterable[datetime],
    window_minutes: int = 5,
) -> bool:
    """True if another article (higher-impact handling left to caller) falls within ±window."""
    w = timedelta(minutes=window_minutes)
    for t in other_times:
        if abs((t - published_at).total_seconds()) <= w.total_seconds():
            return True
    return False


def apply_article_filters(
    headline: str,
    published_at: datetime,
    *,
    body: Optional[str] = None,
    neighbor_publish_times: Optional[list[datetime]] = None,
) -> FilterResult:
    reasons: list[str] = []
    if headline_hits_macro_calendar(headline, body):
        reasons.append("macro_keyword")
    if headline_mentions_earnings_ticker(headline):
        reasons.append("mega_cap_ticker_mention")
    if neighbor_publish_times and competing_article_nearby(published_at, neighbor_publish_times):
        reasons.append("competing_article_window")
    return FilterResult(exclude=bool(reasons), reasons=reasons)
