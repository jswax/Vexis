"""Placeholder scorer before FinBERT is trained (not for production signals)."""


def score_headline_heuristic(headline: str) -> float:
    h = headline.lower()
    neg = (
        "crash",
        "plunge",
        "recession",
        "downgrade",
        "lawsuit",
        "probe",
        "selloff",
        "bearish",
    )
    pos = (
        "surge",
        "rally",
        "beat",
        "record",
        "upgrade",
        "bullish",
        "growth",
        "expands",
    )
    score = 0.0
    for w in neg:
        if w in h:
            score -= 1.5
    for w in pos:
        if w in h:
            score += 1.5
    return max(-10.0, min(10.0, score))
