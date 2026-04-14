from __future__ import annotations

import re
from dataclasses import dataclass


# ---- QQQ configuration --------------------------------------------------------

# Core: Nasdaq 100 mega-caps + high-sensitivity names.
QQQ_CORE_TICKERS: set[str] = {
    "AAPL",
    "MSFT",
    "NVDA",
    "AMZN",
    "META",
    "GOOGL",
    "GOOG",
    "TSLA",
    "AVGO",
    "AMD",
    "INTC",
    "ADBE",
    "NFLX",
    "COST",
    "PEP",
    "CSCO",
    "QCOM",
    "TXN",
    "AMAT",
    "MU",
    "TSM",
}

# These keywords are intentionally “boring” and policy/earnings oriented.
QQQ_KEYWORDS: list[tuple[str, float]] = [
    (r"\bfomc\b|\bfed\b|\bpowell\b|\bdot\s*plot\b", 2.0),
    (r"\bcpi\b|\bpce\b|\bnfp\b|\bjobs\b|\binflation\b|\btreasury\b|\byield(s)?\b|\breal\s*yield(s)?\b", 1.6),
    (r"\bguidance\b|\bearnings\b|\brevenue\b|\bprofit\b|\bmargins?\b|\bcapex\b|\boutlook\b", 1.4),
    (r"\bantitrust\b|\bdoj\b|\bftc\b|\beu\b|\bregulator(y)?\b|\blawsuit\b", 1.2),
    (r"\bexport\s*controls?\b|\bchina\b|\btaiwan\b|\bsanctions?\b", 1.1),
    (r"\bai\b|\baccelerator(s)?\b|\bgpu(s)?\b|\bhbm\b|\bsemis?\b|\btsmc\b|\basml\b", 1.0),
    (r"\boutage\b|\bincident\b|\bbreach\b|\bvulnerability\b", 1.0),
    (r"\bupgrade\b|\bdowngrade\b|\braise(s|d)?\b|\bcuts?\b|\bprice\s*target\b", 0.8),
]

# High-signal sources: keep this tight. Expand over time using outcomes feedback.
SOURCE_WEIGHTS: dict[str, float] = {
    # Official / primary
    "federalreserve": 3.0,
    "sec_news": 2.8,
    "nasdaq": 2.2,
    "nyse": 2.2,
    "bls_gov": 2.8,
    "bea_news": 2.6,
    "uscensusbureau": 2.4,
    # Market structure / research (examples; adjust to your preferences)
    "newyorkfed": 2.2,
    "atlantafed": 2.0,
}

# Simple “noise” penalties (don’t overfit; just avoid obvious spam/finfluencer bait).
NOISE_PATTERNS: list[tuple[str, float]] = [
    (r"\b(discord|telegram|patreon|subscribe|link in bio)\b", -2.0),
    (r"\bnot financial advice\b|\bnfa\b", -1.2),
    (r"\b100x\b|\b10x\b|\bmoon\b|\bape\b|\bgem\b|\bbuy now\b|\bsend it\b", -1.0),
]


@dataclass
class QQQScore:
    score: float
    reasons: list[str]


def _norm_user(username: str | None) -> str:
    return (username or "").lstrip("@").strip().lower()


def _keyword_hits(text: str) -> tuple[float, list[str]]:
    s = 0.0
    reasons: list[str] = []
    for pat, w in QQQ_KEYWORDS:
        if re.search(pat, text, flags=re.IGNORECASE):
            s += w
            reasons.append(f"kw:{pat}")
    return s, reasons


def score_tweet_for_qqq(
    *,
    text: str,
    username: str | None,
    matched_tickers: list[str],
    spam_score: float | None,
    credibility_score: float | None,
    # Optional: use already-computed outcomes as “historical realized impact”.
    impact_scores: list[int] | None = None,
) -> QQQScore:
    reasons: list[str] = []

    user = _norm_user(username)
    src_w = SOURCE_WEIGHTS.get(user, 0.8)  # default: neutral-ish
    if user in SOURCE_WEIGHTS:
        reasons.append(f"src:{user}")

    # Ticker relevance
    tickers_up = [t.upper().strip() for t in matched_tickers if t]
    core_hits = sorted({t for t in tickers_up if t in QQQ_CORE_TICKERS})
    if core_hits:
        reasons.append("core:" + ",".join(core_hits[:6]))
    ticker_score = 2.4 * len(core_hits) + 0.4 * max(0, len(tickers_up) - len(core_hits))

    # Text keyword relevance
    kw_score, kw_reasons = _keyword_hits(text)
    if kw_reasons:
        reasons.extend(kw_reasons[:6])

    # Noise penalty
    noise = 0.0
    for pat, w in NOISE_PATTERNS:
        if re.search(pat, text, flags=re.IGNORECASE):
            noise += w
            reasons.append(f"noise:{pat}")

    # Outcomes “impact boost” (if present, use max abs score as a light bonus).
    impact_boost = 0.0
    if impact_scores:
        mx = max((abs(int(v)) for v in impact_scores if v is not None), default=0)
        if mx:
            impact_boost = min(2.0, mx / 5.0)  # 0..2
            reasons.append(f"impact:{mx}")

    # Quality adjustments
    spam = float(spam_score) if spam_score is not None else 0.0
    cred = float(credibility_score) if credibility_score is not None else 0.2
    quality_mult = max(0.05, (1.0 - min(1.0, spam)) * (0.6 + 0.8 * min(1.0, cred)))
    if spam_score is not None:
        reasons.append(f"spam:{spam:.2f}")
    if credibility_score is not None:
        reasons.append(f"cred:{cred:.2f}")

    raw = (ticker_score + kw_score + impact_boost + noise)
    score = src_w * raw * quality_mult
    return QQQScore(score=score, reasons=reasons[:20])

