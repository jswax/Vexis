"""
Ticker extraction from tweet text.
Methods: cashtag ($TSLA), direct ticker (TSLA in known list), alias dictionary, DB aliases.
"""

from __future__ import annotations

import re
from typing import Any, TypedDict

from pipeline.alias_dictionary import (
    KNOWN_CRYPTO_TICKERS,
    KNOWN_TICKERS,
    AliasSeed,
    get_seeds,
)


class TickerMatch(TypedDict):
    asset_type: str
    ticker: str
    confidence: float
    match_method: str
    matched_text: str


def _pick_asset_type(ticker: str) -> str:
    t = ticker.upper()
    return "CRYPTO" if t in KNOWN_CRYPTO_TICKERS else "STOCK"


def _clean_for_word_match(text: str) -> str:
    t = re.sub(r"https?://\S+", " ", text, flags=re.IGNORECASE)
    t = re.sub(r"[^\w\s$]", " ", t)
    return t.lower()


def _alias_regex(alias: str) -> re.Pattern:
    escaped = re.escape(alias)
    return re.compile(r"(^|\s)" + escaped + r"(\s|$)", re.IGNORECASE)


def _infer_direct_tickers(text: str) -> list[str]:
    words = re.sub(r"https?://\S+", " ", text, flags=re.IGNORECASE)
    words = re.sub(r"[^\w\s$]", " ", words)
    out: list[str] = []
    for w in words.split():
        w = w.strip()
        if not w:
            continue
        # Skip if it starts with $ (handled by cashtag)
        if w.startswith("$"):
            continue
        if re.match(r"^[A-Z]{1,6}$", w) and w in KNOWN_TICKERS:
            out.append(w)
        elif re.match(r"^[A-Za-z]{2,6}$", w) and w.upper() in KNOWN_CRYPTO_TICKERS:
            out.append(w.upper())
    return list(dict.fromkeys(out))


def _load_db_seeds(session: Any) -> list[AliasSeed]:
    try:
        from sqlalchemy import select
        from db.models import AssetAlias

        rows = session.execute(select(AssetAlias)).scalars().all()
        return [
            AliasSeed(
                asset_type=r.asset_type,
                ticker=r.ticker,
                alias=r.alias,
                match_method="db",
                confidence=r.confidence,
            )
            for r in rows
        ]
    except Exception:
        return []


def extract_tickers(
    text: str,
    session: Any = None,
    db_seeds: list[Any] | None = None,
) -> list[TickerMatch]:
    candidates: list[TickerMatch] = []

    # 1. Cashtags: $TSLA
    for m in re.finditer(r"\$([A-Za-z]{1,10})", text):
        ticker = m.group(1).upper()
        candidates.append(
            TickerMatch(
                asset_type=_pick_asset_type(ticker),
                ticker=ticker,
                confidence=0.95,
                match_method="cashtag",
                matched_text=m.group(0),
            )
        )

    # 2. Direct known tickers
    for ticker in _infer_direct_tickers(text):
        candidates.append(
            TickerMatch(
                asset_type=_pick_asset_type(ticker),
                ticker=ticker,
                confidence=0.7,
                match_method="direct_ticker",
                matched_text=ticker,
            )
        )

    # 3. Alias seeds — use pre-loaded seeds if provided, else query DB once
    seeds = get_seeds()
    if db_seeds is not None:
        seeds = seeds + db_seeds
    elif session is not None:
        seeds = seeds + _load_db_seeds(session)

    cleaned = _clean_for_word_match(text)
    for seed in seeds:
        rx = _alias_regex(seed.alias.lower())
        if rx.search(cleaned):
            candidates.append(
                TickerMatch(
                    asset_type=seed.asset_type,
                    ticker=seed.ticker.upper(),
                    confidence=seed.confidence,
                    match_method=seed.match_method,
                    matched_text=seed.alias,
                )
            )

    # Deduplicate: keep highest confidence per (asset_type, ticker)
    best: dict[str, TickerMatch] = {}
    for c in candidates:
        key = f"{c['asset_type']}:{c['ticker']}"
        if key not in best or c["confidence"] > best[key]["confidence"]:
            best[key] = c

    return sorted(best.values(), key=lambda x: x["confidence"], reverse=True)


def fingerprint_matches(matches: list[TickerMatch]) -> str:
    import hashlib
    payload = "|".join(f"{m['asset_type']}:{m['ticker']}" for m in matches[:5])
    return hashlib.sha1(payload.encode()).hexdigest()
