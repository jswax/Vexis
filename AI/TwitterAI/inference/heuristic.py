"""
Placeholder tweet scorer before a fine-tuned model is available.
Combines spam/credibility signals with keyword sentiment.
"""

from __future__ import annotations

_BEARISH = ("crash", "plunge", "sell", "dump", "short", "recession", "bearish", "downgrade", "fraud", "lawsuit")
_BULLISH = ("moon", "surge", "rally", "buy", "long", "beat", "record", "upgrade", "bullish", "growth")


def score_tweet_heuristic(text: str, spam_score: float = 0.0, credibility_score: float = 0.5) -> float:
    """
    Returns a rough [-10, 10] signal.
    High spam score or low credibility dampens the signal.
    Not for production signals — replace with a fine-tuned model.
    """
    h = text.lower()
    score = 0.0
    for w in _BEARISH:
        if w in h:
            score -= 1.5
    for w in _BULLISH:
        if w in h:
            score += 1.5

    # Dampen by quality
    quality = max(0.1, credibility_score * (1 - spam_score))
    score *= quality

    return max(-10.0, min(10.0, score))
