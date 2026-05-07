"""
Filter extracted ticker matches so ETF / index "holdings breakdown" posts
do not create dozens of spurious single-name signals.
"""

from __future__ import annotations

import re

from config import get_settings
from pipeline.asset_matching import TickerMatch


def _cashtag_count(text: str) -> int:
    return len(re.findall(r"\$[A-Za-z]{1,10}\b", text))


# Daily heat maps, “at close” tables, app-download CTAs — high ticker count, low catalyst signal.
RECAP_DASHBOARD_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"heat\s*map", re.I),
    re.compile(r"nasdaq\s*100\b.*heat", re.I),
    re.compile(r"\bat\s+close\b", re.I),
    re.compile(r"download\s+the\s+.+\s+app", re.I),
    re.compile(r"follow\s+for\s+more", re.I),
    re.compile(r"on\s+your\s+iphone", re.I),
    re.compile(r"on\s+your\s+ipad", re.I),
    re.compile(r"stock\s*\+", re.I),
)


def is_recap_dashboard_post(text: str) -> bool:
    if not any(p.search(text) for p in RECAP_DASHBOARD_PATTERNS):
        return False
    if _cashtag_count(text) >= 5:
        return True
    if text.count("%") >= 4:
        return True
    return False


def recap_dashboard_ticker_penalty(text: str, ticker_count: int) -> float:
    if not is_recap_dashboard_post(text):
        return 0.0
    # After ingest/API filtering, breadth is often already collapsed — do not double-penalize.
    if ticker_count <= 4:
        return 0.0
    if ticker_count >= 11:
        return -22.0
    if ticker_count >= 8:
        return -17.0
    if ticker_count >= 6:
        return -12.0
    return -6.0


HOLDINGS_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"\bhow much of every stock\b", re.I),
    re.compile(r"\bevery stock you(?:'re| are) buying\b", re.I),
    re.compile(r"\bweight(s)? in\b.*\b(etf|qqq|spy)\b", re.I),
    re.compile(r"\bholdings breakdown\b", re.I),
    re.compile(r"\bportfolio allocation\b", re.I),
    re.compile(r"\bwhen you buy\b.*\$\s*10,?000\b", re.I),
    re.compile(r"\bhere's how much\b", re.I),
    re.compile(r"\bhow much of\b.*\bstock\b", re.I),
)


def is_holdings_laundry_list(text: str, matches: list[TickerMatch]) -> bool:
    if len(matches) < get_settings().match_holdings_min_tickers:
        return False
    if not any(p.search(text) for p in HOLDINGS_PATTERNS):
        return False
    if _cashtag_count(text) < get_settings().match_holdings_min_cashtags:
        return False
    return True


def holdings_style_penalty(text: str, ticker_count: int) -> float:
    """
    Lightweight text-only penalty for QQQ scoring (no DB / session).
    """
    if ticker_count < get_settings().match_holdings_min_tickers:
        return 0.0
    if _cashtag_count(text) < get_settings().match_holdings_min_cashtags:
        return 0.0
    if not any(p.search(text) for p in HOLDINGS_PATTERNS):
        return 0.0
    return -4.0


def filter_matches_for_ingest(text: str, matches: list[TickerMatch]) -> list[TickerMatch]:
    """
    Returns a (possibly shortened) match list. Never expands matches.
    """
    if not matches:
        return matches

    s = get_settings()
    # Hard cap — still allow manual review via raw tweet text.
    if len(matches) > s.match_max_tickers_per_tweet:
        matches = matches[: s.match_max_tickers_per_tweet]

    if is_holdings_laundry_list(text, matches):
        tickers = {m["ticker"].upper() for m in matches}
        keep: set[str] = set()
        keep_list = [
            p.strip().upper()
            for p in (s.match_holdings_keep_tickers or "").split(",")
            if p.strip()
        ]
        for t in keep_list:
            if t in tickers:
                keep.add(t)
        if not keep:
            keep = {next(iter(sorted(tickers)))}
        return [m for m in matches if m["ticker"].upper() in keep]

    if is_recap_dashboard_post(text) and len(matches) >= 6:
        bench = {"QQQ", "QQQM", "SPY", "IWM"}
        kept = [m for m in matches if m["ticker"].upper() in bench]
        if kept:
            return kept
        return matches[:3]

    return matches
