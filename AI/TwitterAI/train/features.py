"""
Feature extraction for the TwitterAI direction prediction model.

Single source of truth for feature engineering — imported by both train/train.py
and inference/model.py so training and inference always use identical features.

ALL features must be derivable from information available at tweet ingest time —
no price data, no future outcomes.

Note: horizon is NOT a feature. We train one model per horizon so each model
learns tweet→direction signal without conflating horizon physics (short horizons
are mostly NEUTRAL regardless of tweet content).
"""

from __future__ import annotations

import math
import re
from datetime import datetime
from typing import Any

# ── Shared constants ───────────────────────────────────────────────────────────

HORIZONS_ORDERED: list[str] = ["M5", "M15", "M30", "H1", "H4", "H6", "D1"]
HORIZON_TO_IDX: dict[str, int] = {h: i for i, h in enumerate(HORIZONS_ORDERED)}

QQQ_CORE_TICKERS: list[str] = [
    "AAPL", "MSFT", "NVDA", "AMZN", "META", "GOOGL", "GOOG", "TSLA", "AVGO",
    "AMD", "INTC", "ADBE", "NFLX", "COST", "PEP", "CSCO", "QCOM", "TXN",
    "AMAT", "MU", "TSM",
]
QQQ_CORE_SET: frozenset[str] = frozenset(QQQ_CORE_TICKERS)
QQQ_ETF_SET: frozenset[str] = frozenset({"QQQ", "QQQM"})
INDEX_SET: frozenset[str] = frozenset({"SPY"})

# Source weights mirrored from qqq_signal.py (kept in sync manually)
SOURCE_WEIGHT_MAP: dict[str, float] = {
    "federalreserve": 3.0,
    "sec_news": 2.8,
    "bls_gov": 2.8,
    "bea_news": 2.6,
    "uscensusbureau": 2.4,
    "nasdaq": 2.2,
    "nyse": 2.2,
    "newyorkfed": 2.2,
    "atlantafed": 2.0,
}

# Labels — order matters for LightGBM class indices
DIRECTION_LABELS: list[str] = ["NEUTRAL", "BULLISH", "BEARISH"]
LABEL_TO_IDX: dict[str, int] = {l: i for i, l in enumerate(DIRECTION_LABELS)}
IDX_TO_LABEL: dict[int, str] = {i: l for l, i in LABEL_TO_IDX.items()}

# Top individual tickers to one-hot (most frequent in QQQ discourse)
TOP_TICKERS_OHE: list[str] = [
    "NVDA", "AAPL", "MSFT", "TSLA", "META",
    "AMZN", "GOOGL", "AMD", "NFLX", "INTC", "AVGO", "QCOM",
]

# QQQ text channel names (must match keys in pipeline/qqq_signal.py)
CHANNEL_NAMES: list[str] = [
    "MONETARY_POLICY",
    "INFLATION_RATES_REAL_YIELDS",
    "LABOR_ACTIVITY",
    "CREDIT_FUNDING_STRESS",
    "USD_LIQUIDITY_FX",
    "FISCAL_POLICY",
    "EARNINGS_FUNDAMENTALS",
    "MNA_CAPITAL_RETURN",
    "LEGAL_REG_ANTITRUST",
    "GEO_TRADE_SUPPLY",
    "AI_COMPUTE_INFRA",
    "CYBER_SECURITY_OPS",
    "SELLSIDE_FLOW",
    "INDEX_VOL_MACRO_RISK",
    "COMMODITY_ENERGY_INPUT",
]

# ── Sentiment keyword patterns ─────────────────────────────────────────────────
# Each entry: (regex_pattern, weight)
# Weights are additive — a tweet can match multiple patterns.

BULLISH_PATTERNS: list[tuple[str, float]] = [
    (r"\b(?:breakout|break\s*out)\b", 2.0),
    (r"\bbuy(?:ing|s)?\b", 1.2),
    (r"\blong\b", 1.5),
    (r"\bbull(?:ish)?\b", 2.0),
    (r"\b(?:short\s*)?squeeze\b", 1.8),
    (r"\bATH\b|all[\s-]time\s+high", 1.5),
    (r"\b(?:rip(?:ping)?|rocket(?:ing)?|moon(?:ing)?)\b", 1.5),
    (r"\bcalls?\b", 1.0),
    (r"\b(?:strong\s+buy|accumulate|adding)\b", 2.0),
    (r"\b(?:dip\s*buy|buy\s+the\s+dip)\b", 1.8),
    (r"\b(?:beat|beats|crushed|smashed)\b", 1.5),
    (r"\b(?:upgrade|raised?|raising)\b", 1.5),
    (r"\b(?:outperform|overweight)\b", 1.5),
    (r"\bprice\s+target\b", 1.0),
    (r"\b(?:momentum|momo)\b", 1.0),
    (r"\bbottom(?:ed|ing)?\b", 1.2),
    (r"\b(?:bounce|bouncing)\b", 1.2),
    (r"\bgap\s+up\b", 1.5),
    (r"\b(?:guidance\s+raised?|raised?\s+guidance)\b", 2.0),
    (r"\brecord\s+(?:earnings|revenue|quarter|sales)\b", 1.8),
    (r"🚀|🟢|📈|💚|🔥", 1.0),
]

BEARISH_PATTERNS: list[tuple[str, float]] = [
    (r"\bshort(?:ing|ed)?\b", 2.0),
    (r"\bsell(?:ing|s|off)?\b", 1.2),
    (r"\bbear(?:ish)?\b", 2.0),
    (r"\b(?:crash(?:ing)?|dump(?:ing)?|tank(?:ing)?|plunge?(?:ing)?)\b", 2.0),
    (r"\bputs?\b", 1.5),
    (r"\b(?:resistance|overbought|overvalued)\b", 1.5),
    (r"\b(?:correction|pullback|reversal|breakdown)\b", 1.5),
    (r"\b(?:miss(?:ed)?|disappoint(?:ment|ed|ing)?)\b", 1.5),
    (r"\bweak(?:er|ness)?\b", 1.2),
    (r"\b(?:downgrade|cut|lower(?:ed)?)\b", 1.5),
    (r"\b(?:underperform|underweight)\b", 1.5),
    (r"\b(?:warn(?:ing|ed)?)\b", 1.0),
    (r"\b(?:bubble|overextended)\b", 1.5),
    (r"\b(?:layoff|layoffs?|job\s+cuts?|restructur)\b", 1.5),
    (r"\b(?:guidance\s+(?:cut|lower|miss)|(?:cut|lower|miss)\s+guidance)\b", 2.0),
    (r"\bgap\s+down\b", 1.5),
    (r"\b(?:recall|investigation|probe|subpoena|fraud)\b", 1.2),
    (r"🔴|📉|⚠️|🩸", 1.0),
]


# ── Text helpers ───────────────────────────────────────────────────────────────

def _cashtag_count(text: str) -> int:
    return len(re.findall(r"\$[A-Za-z]{1,10}\b", text))


def _hashtag_count(text: str) -> int:
    return len(re.findall(r"#\w+", text))


def _mention_count(text: str) -> int:
    return len(re.findall(r"@\w+", text))


def _url_count(text: str) -> int:
    return len(re.findall(r"https?://\S+", text))


def _norm_user(username: str | None) -> str:
    return (username or "").lstrip("@").strip().lower()


def _caps_ratio(text: str) -> float:
    letters = re.sub(r"[^a-zA-Z]", "", text)
    if len(letters) < 10:
        return 0.0
    return len(re.sub(r"[^A-Z]", "", text)) / len(letters)


# ── QQQ channel scoring (inline copy to avoid circular imports) ────────────────

def _compute_channel_scores(text: str) -> dict[str, float]:
    from pipeline.qqq_signal import NOISE_PATTERNS, TEXT_CHANNELS  # lazy import

    scores: dict[str, float] = {}
    for channel_id, patterns in TEXT_CHANNELS.items():
        best_w = 0.0
        for pat, w, _ in patterns:
            if re.search(pat, text, flags=re.IGNORECASE):
                best_w = max(best_w, w)
        scores[channel_id] = best_w

    noise = 0.0
    for pat, w, _ in NOISE_PATTERNS:
        if re.search(pat, text, flags=re.IGNORECASE):
            noise += w
    scores["NOISE"] = noise

    return scores


def _compute_sentiment(text: str) -> tuple[float, float]:
    """Returns (bullish_score, bearish_score)."""
    bull = 0.0
    for pat, w in BULLISH_PATTERNS:
        if re.search(pat, text, flags=re.IGNORECASE):
            bull += w
    bear = 0.0
    for pat, w in BEARISH_PATTERNS:
        if re.search(pat, text, flags=re.IGNORECASE):
            bear += w
    return bull, bear


# ── Main feature extraction ────────────────────────────────────────────────────

def extract_features(
    *,
    text: str,
    username: str | None = None,
    author_verified: bool = False,
    followers_count: int | None = None,
    following_count: int | None = None,
    statuses_count: int | None = None,
    spam_score: float | None = None,
    credibility_score: float | None = None,
    ticker: str = "",
    asset_type: str = "STOCK",
    match_method: str = "",
    match_confidence: float = 0.7,
    is_retweet: bool = False,
    is_reply: bool = False,
    is_quote: bool = False,
    has_images: bool = False,
    has_video: bool = False,
    like_count: int | None = None,
    retweet_count: int | None = None,
    reply_count: int | None = None,
    view_count: int | None = None,
    created_at: datetime | None = None,
) -> dict[str, float]:
    """
    Extract a flat dict[str, float] of features for one (tweet × ticker) sample.
    Horizon is NOT a feature — train one model per horizon instead.
    """
    feats: dict[str, float] = {}
    t = text or ""

    # ── Text structure ─────────────────────────────────────────────────────────
    feats["text_len"] = float(min(len(t), 1000))
    feats["text_word_count"] = float(len(t.split()))
    feats["text_cashtag_count"] = float(_cashtag_count(t))
    feats["text_hashtag_count"] = float(_hashtag_count(t))
    feats["text_mention_count"] = float(_mention_count(t))
    feats["text_url_count"] = float(_url_count(t))
    feats["text_exclamation"] = float(t.count("!"))
    feats["text_question"] = float(t.count("?"))
    feats["text_pct_signs"] = float(t.count("%"))
    feats["text_caps_ratio"] = _caps_ratio(t)

    sentences = [s.strip() for s in re.split(r"[.!?]", t) if s.strip()]
    feats["text_sentence_count"] = float(len(sentences))
    feats["text_avg_sentence_len"] = (
        float(sum(len(s) for s in sentences)) / max(1, len(sentences))
    )

    # ── Sentiment ──────────────────────────────────────────────────────────────
    bull_score, bear_score = _compute_sentiment(t)
    feats["sentiment_bullish"] = bull_score
    feats["sentiment_bearish"] = bear_score
    feats["sentiment_net"] = bull_score - bear_score
    feats["sentiment_conviction"] = bull_score + bear_score
    feats["sentiment_is_bullish"] = float(bull_score > bear_score and bull_score > 0)
    feats["sentiment_is_bearish"] = float(bear_score > bull_score and bear_score > 0)
    total_sent = bull_score + bear_score
    feats["sentiment_bull_ratio"] = bull_score / max(total_sent, 1e-9)

    # ── QQQ channel scores ─────────────────────────────────────────────────────
    ch = _compute_channel_scores(t)

    channel_sum = 0.0
    channel_active = 0
    for name in CHANNEL_NAMES:
        val = ch.get(name, 0.0)
        feats[f"ch_{name.lower()}"] = val
        channel_sum += val
        if val > 0:
            channel_active += 1

    feats["ch_total"] = channel_sum
    feats["ch_active_count"] = float(channel_active)
    feats["ch_noise"] = ch.get("NOISE", 0.0)

    sorted_ch_vals = sorted(
        (ch.get(n, 0.0) for n in CHANNEL_NAMES), reverse=True
    )
    feats["ch_top1"] = sorted_ch_vals[0] if sorted_ch_vals else 0.0
    feats["ch_top2"] = sorted_ch_vals[1] if len(sorted_ch_vals) > 1 else 0.0
    feats["ch_top3"] = sorted_ch_vals[2] if len(sorted_ch_vals) > 2 else 0.0

    # ── Author ─────────────────────────────────────────────────────────────────
    user = _norm_user(username)
    feats["author_verified"] = float(author_verified)
    feats["author_source_weight"] = SOURCE_WEIGHT_MAP.get(user, 0.8)
    feats["author_is_allowlisted"] = float(user in SOURCE_WEIGHT_MAP)

    followers = int(followers_count or 0)
    following = int(following_count or 0)
    statuses = int(statuses_count or 0)

    feats["author_followers_log"] = math.log1p(followers)
    feats["author_following_log"] = math.log1p(following)
    feats["author_statuses_log"] = math.log1p(statuses)
    ff_ratio = followers / max(1, following)
    feats["author_ff_ratio_log"] = math.log1p(ff_ratio)
    feats["author_high_reach"] = float(followers >= 100_000)
    feats["author_mid_reach"] = float(10_000 <= followers < 100_000)

    spam = float(spam_score) if spam_score is not None else 0.0
    cred = float(credibility_score) if credibility_score is not None else 0.2
    feats["spam_score"] = spam
    feats["credibility_score"] = cred
    quality = max(0.05, (1.0 - min(1.0, spam)) * (0.58 + 0.82 * min(1.0, cred)))
    feats["quality_mult"] = quality

    # ── Ticker ─────────────────────────────────────────────────────────────────
    ticker_up = (ticker or "").upper().strip()
    feats["ticker_is_core"] = float(ticker_up in QQQ_CORE_SET)
    feats["ticker_is_qqq_etf"] = float(ticker_up in QQQ_ETF_SET)
    feats["ticker_is_index"] = float(ticker_up in INDEX_SET)
    feats["ticker_is_crypto"] = float((asset_type or "STOCK") == "CRYPTO")

    feats["match_confidence"] = float(match_confidence)
    feats["match_is_cashtag"] = float(match_method == "cashtag")
    feats["match_is_direct"] = float(match_method == "direct_ticker")
    feats["match_is_alias"] = float(match_method not in ("cashtag", "direct_ticker") and bool(match_method))

    for t_name in TOP_TICKERS_OHE:
        feats[f"ticker_{t_name}"] = float(ticker_up == t_name)

    feats["ticker_in_text"] = float(ticker_up in t.upper() if ticker_up else False)
    feats["cashtag_of_ticker_in_text"] = float(
        bool(ticker_up) and f"${ticker_up}" in t.upper()
    )

    # ── Interaction: source × ticker ───────────────────────────────────────────
    feats["src_weight_x_core"] = feats["author_source_weight"] * feats["ticker_is_core"]
    feats["quality_x_ch_total"] = quality * channel_sum
    feats["quality_x_ch_ai"] = quality * ch.get("AI_COMPUTE_INFRA", 0.0)
    feats["quality_x_ch_earnings"] = quality * ch.get("EARNINGS_FUNDAMENTALS", 0.0)
    feats["quality_x_ch_monetary"] = quality * ch.get("MONETARY_POLICY", 0.0)
    feats["verified_x_ch_total"] = float(author_verified) * channel_sum
    feats["cashtag_x_confidence"] = feats["match_is_cashtag"] * feats["match_confidence"]
    # Sentiment × quality interactions
    feats["sentiment_bull_x_quality"] = bull_score * quality
    feats["sentiment_bear_x_quality"] = bear_score * quality
    feats["sentiment_bull_x_verified"] = bull_score * float(author_verified)
    feats["sentiment_bear_x_verified"] = bear_score * float(author_verified)
    feats["sentiment_bull_x_reach"] = bull_score * feats["author_high_reach"]
    feats["sentiment_bear_x_reach"] = bear_score * feats["author_high_reach"]

    # ── Time ───────────────────────────────────────────────────────────────────
    if created_at is not None:
        try:
            hour = created_at.hour
            dow = created_at.weekday()
            feats["hour_of_day"] = float(hour)
            feats["hour_sin"] = math.sin(2 * math.pi * hour / 24)
            feats["hour_cos"] = math.cos(2 * math.pi * hour / 24)
            feats["is_us_market_hours"] = float(14 <= hour < 21)
            feats["is_us_premarket"] = float(9 <= hour < 14)
            feats["is_us_afterhours"] = float(21 <= hour <= 23)
            feats["is_overnight"] = float(hour < 9)
            feats["day_of_week"] = float(dow)
            feats["day_sin"] = math.sin(2 * math.pi * dow / 7)
            feats["day_cos"] = math.cos(2 * math.pi * dow / 7)
            feats["is_weekend"] = float(dow >= 5)
        except Exception:
            _time_defaults(feats)
    else:
        _time_defaults(feats)

    # ── Tweet engagement ───────────────────────────────────────────────────────
    likes = int(like_count or 0)
    rts = int(retweet_count or 0)
    reps = int(reply_count or 0)
    views = int(view_count or 0)
    feats["likes_log"] = math.log1p(likes)
    feats["rts_log"] = math.log1p(rts)
    feats["replies_log"] = math.log1p(reps)
    feats["views_log"] = math.log1p(views)
    feats["engagement_log"] = math.log1p(likes + rts * 2 + reps * 3)
    feats["has_engagement"] = float(likes + rts + reps > 0)

    # ── Tweet type ─────────────────────────────────────────────────────────────
    feats["is_retweet"] = float(is_retweet)
    feats["is_reply"] = float(is_reply)
    feats["is_quote"] = float(is_quote)
    feats["has_images"] = float(has_images)
    feats["has_video"] = float(has_video)
    feats["is_original"] = float(
        not is_retweet and not is_reply and not is_quote
    )

    return feats


def _time_defaults(feats: dict[str, float]) -> None:
    feats["hour_of_day"] = 15.0
    feats["hour_sin"] = math.sin(2 * math.pi * 15 / 24)
    feats["hour_cos"] = math.cos(2 * math.pi * 15 / 24)
    feats["is_us_market_hours"] = 1.0
    feats["is_us_premarket"] = 0.0
    feats["is_us_afterhours"] = 0.0
    feats["is_overnight"] = 0.0
    feats["day_of_week"] = 2.0
    feats["day_sin"] = math.sin(2 * math.pi * 2 / 7)
    feats["day_cos"] = math.cos(2 * math.pi * 2 / 7)
    feats["is_weekend"] = 0.0


# ── Utility ────────────────────────────────────────────────────────────────────

def features_to_vector(
    feats: dict[str, float], feature_names: list[str]
) -> list[float]:
    """Convert a feature dict to a list aligned with feature_names. Missing keys → 0.0."""
    return [feats.get(name, 0.0) for name in feature_names]
