from __future__ import annotations

import re
from dataclasses import dataclass

from pipeline.qqq_signal import NOISE_PATTERNS, SOURCE_WEIGHTS


# ---- Default "QQQ mode" ingest profile ---------------------------------------

# Search is intentionally narrow. If you want broader, add "NDX" or "Nasdaq 100".
DEFAULT_QQQ_SEARCH_TERMS: list[str] = [
    "QQQ OR $QQQ OR \"Invesco QQQ\" OR \"Nasdaq 100\" OR NDX",
]

# Keep this list *tight*. You can expand it once you see good results.
# These are usernames without '@'.
# Default to *no handles* — keep ingest simple and rely on filters + QQQ relevance ranking.
# If you want a strict allowlist-only scrape, you can pass twitter_handles explicitly.
DEFAULT_QQQ_HANDLES: list[str] = []


@dataclass
class FilterDecision:
    keep: bool
    reasons: list[str]


def _norm_user(username: str | None) -> str:
    return (username or "").lstrip("@").strip().lower()


def should_keep_qqq_tweet(
    *,
    text: str,
    username: str | None,
    verified: bool,
    followers_count: int | None,
    spam_score: float | None,
    credibility_score: float | None,
) -> FilterDecision:
    """
    Aggressive quality filter for QQQ mode.

    Rules (in order):
    - Allowlist always passes (but still blocks obvious spam text patterns).
    - Otherwise require verified OR followers >= 5k (credibility gate).
    - Block high spam_score.
    - Block obvious finfluencer bait patterns.
    """
    reasons: list[str] = []
    user = _norm_user(username)
    allowlisted = user in SOURCE_WEIGHTS

    # Hard text noise blocks first
    for pat, w, _noise_explain in NOISE_PATTERNS:
        if w < 0 and re.search(pat, text, flags=re.IGNORECASE):
            reasons.append(f"noise:{pat}")
            return FilterDecision(keep=False, reasons=reasons)

    spam = float(spam_score) if spam_score is not None else 0.0
    cred = float(credibility_score) if credibility_score is not None else 0.2

    if spam >= 0.35:
        reasons.append(f"spam:{spam:.2f}")
        return FilterDecision(keep=False, reasons=reasons)

    if allowlisted:
        reasons.append("allowlisted")
        return FilterDecision(keep=True, reasons=reasons)

    followers = int(followers_count or 0)
    if not verified and followers < 5000 and cred < 0.55:
        reasons.append(f"low_cred:verified={verified} followers={followers} cred={cred:.2f}")
        return FilterDecision(keep=False, reasons=reasons)

    return FilterDecision(keep=True, reasons=reasons)

