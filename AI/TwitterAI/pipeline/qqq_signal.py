"""
QQQ / Nasdaq-100 relevance scoring and attribution for tweet text.

Design goals for a strong downstream model:
- **Channel-based text features**: each thematic family (monetary policy, earnings, etc.)
  contributes at most one weight per tweet (max within channel), reducing redundant
  regex stacking when a single sentence triggers overlapping patterns.
- **Explicit attribution**: human-readable rationales plus a machine-friendly  `attribution` dict (component breakdown, multipliers, activated channels).
- **Transparent composition**: final score = source_weight * (ticker + keywords +
  impact_prior + noise) * quality_mult — all pieces exposed for calibration / training.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from pipeline.match_filter import (
    holdings_style_penalty,
    is_recap_dashboard_post,
    recap_dashboard_ticker_penalty,
)


# ---- Equity universe (NDX / QQQ-heavy) ----------------------------------------

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

# ---- Official / primary handles (normalized, no @) -----------------------------

SOURCE_WEIGHTS: dict[str, float] = {
    "federalreserve": 3.0,
    "sec_news": 2.8,
    "nasdaq": 2.2,
    "nyse": 2.2,
    "bls_gov": 2.8,
    "bea_news": 2.6,
    "uscensusbureau": 2.4,
    "newyorkfed": 2.2,
    "atlantafed": 2.0,
}

SOURCE_EXPLAIN: dict[str, str] = {
    "federalreserve": (
        "Source tier: U.S. central bank primary communications. For NDX/QQQ, monetary "
        "policy expectations feed directly into discount-rate and duration arguments "
        "on long-dated cash flows concentrated in mega-cap growth. Treat as high "
        "fidelity for *policy fact*; still separate official releases from market commentary."
    ),
    "sec_news": (
        "Source tier: SEC disclosure ecosystem. Material corporate events (8-K, "
        "enforcement, rulemaking) can reprice single-name risk and, when names are "
        "large index weights, move the basket. Weight reflects structural relevance to "
        "U.S. equities, not endorsement of any single filing."
    ),
    "nasdaq": (
        "Source tier: listing exchange operator. Signal is often market-structure, "
        "halts, or index methodology — relevant for execution and index composition "
        "narratives rather than fundamental cash-flow shocks."
    ),
    "nyse": (
        "Source tier: listing exchange operator. Same interpretation as Nasdaq: "
        "microstructure, corporate actions, and venue-level events."
    ),
    "bls_gov": (
        "Source tier: BLS macro statistical releases (employment, inflation inputs). "
        "High-beta growth is sensitive to real-rate repricing off CPI/PCE surprises "
        "and labor tightness; these prints frequently dominate the rates leg of NDX."
    ),
    "bea_news": (
        "Source tier: BEA national accounts. GDP, income, and PCE detail inform growth "
        "and consumption trajectory — second-order for single tweets but first-order "
        "for macro regime classification."
    ),
    "uscensusbureau": (
        "Source tier: Census economic indicators. Slower-moving hard data; useful for "
        "regime context rather than intraday catalyst attribution."
    ),
    "newyorkfed": (
        "Source tier: NY Fed (markets, RRP, balance-sheet, financial conditions research). "
        "Liquidity and funding narratives matter for risk appetite and multiples."
    ),
    "atlantafed": (
        "Source tier: Atlanta Fed (nowcasts, GDP tracking). Growth nowcast revisions "
        "inform earnings revision risk at the index level."
    ),
}

# ---- Text channels: (regex, weight, rationale) --------------------------------
# Within each channel we take the **maximum** matching weight only.

TEXT_CHANNELS: dict[str, list[tuple[str, float, str]]] = {
    "MONETARY_POLICY": [
        (
            r"\bfomc\b|\bfederal\s+open\s+market\b|\bdot\s*plot\b|\bqe\b|\bqt\b|"
            r"\bbalance\s+sheet\b|\bpowell\b|\bfed\s+chair\b|\brate\s*cut\b|\brate\s*hike\b",
            2.35,
            (
                "Monetary policy and Fed communication channel. NDX is duration-heavy: "
                "changes in expected path of short rates and term premia propagate into "
                "growth equity multiples through discounting and risk-premia channels. "
                "FOMC surprises typically dominate the macro leg of the trade; "
                "disentangle **announced policy** vs **market-implied** when labeling outcomes."
            ),
        ),
        (
            r"\bfed\b(?!\s+up)",
            1.85,
            (
                "Fed reference (generic). Lower specificity than FOMC/dot plot but still "
                "flags the dominant macro discount-rate driver for large-cap tech beta."
            ),
        ),
    ],
    "INFLATION_RATES_REAL_YIELDS": [
        (
            r"\bcpi\b|\bpce\b|\bcore\s+pce\b|\binflation\b|\bdeflator\b|"
            r"\btips\b|\bbreakeven\b|\breal\s*yield\b|\b10y\b|\b2y\b|\btreasury\b|"
            r"\bu?st\s*\d+y\b|\byield\s*curve\b|\binverted\s+curve\b",
            2.05,
            (
                "Inflation and nominal/real rates channel. Surprise persistence in "
                "inflation forces repricing of terminal policy and long-run real rates; "
                "NDX sensitivity rises when moves are driven by real yields rather than "
                "pure growth optimism. Use alongside curve shape (2s10s) for regime tags."
            ),
        ),
    ],
    "LABOR_ACTIVITY": [
        (
            r"\bnfp\b|\bnon-?farm\b|\bjolts\b|\bunemployment\b|\bjobless\b|\bclaims\b|"
            r"\bwages?\b|\bemployment\s+cost\b|\beci\b",
            1.75,
            (
                "Labor market channel. Tight labor → services inflation stickiness and "
                "Fed hawkishness; slack surprises → easing bias. For tech, wage pressure "
                "also hits margin narratives in labor-intensive SaaS segments."
            ),
        ),
    ],
    "CREDIT_FUNDING_STRESS": [
        (
            r"\bhyg\b|\blqd\b|\bcds\b|\binvestment\s+grade\b|\bhigh\s+yield\b|"
            r"\bcredit\s+spread\b|\bfinancing\b|\brefinanc(e|ing)\b|\bbank\s+loan\b|"
            r"\bcommercial\s+real\s+estate\b|\bcmb[sx]?\b|\bcre\b",
            1.65,
            (
                "Credit and funding conditions. Stress in bank lending, CRE, or HY "
                "often coincides with equity risk premium expansion; NDX is not immune "
                "when the shock is systemic vs idiosyncratic."
            ),
        ),
    ],
    "USD_LIQUIDITY_FX": [
        (
            r"\bdxy\b|\busd\b|\bdollar\s+index\b|\bfx\b|\byen\b|\bjpy\b|\byuan\b|\bcny\b|"
            r"\bliquidity\b|\brrp\b|\btga\b|\bqt\b|\breserve\s+balance\b",
            1.45,
            (
                "USD and global liquidity proxies. Dollar strength can tighten financial "
                "conditions for offshore earnings and EM demand; liquidity drainage "
                "(RRP, TGA, QT) affects multiple expansion for long-duration equities."
            ),
        ),
    ],
    "FISCAL_POLICY": [
        (
            r"\bcongress\b|\bsenate\b|\bhouse\b|\bappropriations\b|\bdebt\s+ceiling\b|"
            r"\bshutdown\b|\bstimulus\b|\bfiscal\b|\bdeficit\b",
            1.35,
            (
                "Fiscal policy channel. Deficit trajectory and issuance affect term premia; "
                "sector-specific subsidies or antitrust legislation can reweight NDX components."
            ),
        ),
    ],
    "EARNINGS_FUNDAMENTALS": [
        (
            r"\bearnings\b|\beps\b|\bguidance\b|\brevenue\b|\btop\s*line\b|\bmargin\b|"
            r"\bgross\s+margin\b|\boperating\s+margin\b|\bebitda\b|\bfree\s+cash\s+flow\b|"
            r"\bfcf\b|\bcapex\b|\bopex\b|\bbacklog\b|\bbookings\b|\barr\b|\brpo\b|"
            r"\boutlook\b|\bpre-?announce",
            1.85,
            (
                "Corporate fundamentals and forward guidance. Direct channel for "
                "single-name and factor exposure within NDX: revisions drive relative "
                "performance inside the basket; aggregate beats/misses set the earnings "
                "revision beta for the index."
            ),
        ),
    ],
    "MNA_CAPITAL_RETURN": [
        (
            r"\bacquisition\b|\bmerger\b|\bm&a\b|\btakeover\b|\bspin-?off\b|\bbuyback\b|"
            r"\bshare\s+repurchase\b|\bspecial\s+dividend\b|\bstake\s*sale\b",
            1.25,
            (
                "Capital allocation and corporate structure. Buybacks and M&A alter "
                "share count, leverage, and conglomerate risk; spin-offs change index "
                "weight dynamics and investor base."
            ),
        ),
    ],
    "LEGAL_REG_ANTITRUST": [
        (
            r"\bantitrust\b|\bmonopol(y|istic)\b|\bdoj\b|\bftc\b|\bsec\b(?!\s+news)|"
            r"\benforcement\b|\binjunction\b|\bconsent\s+decree\b|\blawsuit\b|\bclass\s+action\b|"
            r"\beu\s+commission\b|\bdma\b|\bdigital\s+markets\b",
            1.55,
            (
                "Legal, regulatory, and antitrust risk. Mega-cap platforms carry "
                "non-linear tail risk from structural remedies; NDX concentration "
                "means these events are index-level narratives even when one defendant "
                "is named."
            ),
        ),
    ],
    "GEO_TRADE_SUPPLY": [
        (
            r"\bchina\b|\btaiwan\b|\btsmc\b|\bexport\s+control\b|\bsanction\b|"
            r"\bgeopolit(ic|ics)\b|\bstrait\b|\bwar\b|\bconflict\b|\btariff\b",
            1.5,
            (
                "Geopolitics and trade policy. Semiconductor supply and cloud capex "
                "depend on Taiwan/strait risk and export controls; shocks propagate "
                "through equipment, foundry, and hyperscaler capex chains."
            ),
        ),
    ],
    "AI_COMPUTE_INFRA": [
        (
            r"\bai\b|\bgenerative\b|\bllm\b|\blarge\s+language\s+model\b|\binference\b|"
            r"\btraining\b|\bgpu\b|\bhbm\b|\baccelerator\b|\bdata\s+center\b|\bhyperscaler\b|"
            r"\bcloud\s+capex\b|\bsemis?\b|\bfoundry\b|\basml\b|\btsmc\b",
            1.55,
            (
                "AI compute and infrastructure narrative. NDX currently embeds a large "
                "portion of AI capex and monetization optionality; tweets here often map "
                "to earnings revision risk and discount-rate moves jointly; control for "
                "same-window macro confounds when you label causal impact."
            ),
        ),
    ],
    "CYBER_SECURITY_OPS": [
        (
            r"\bbreach\b|\bhack\b|\bransomware\b|\bcyber\b|\bvulnerability\b|\bcve\b|"
            r"\bzero-?day\b|\boutage\b|\bincident\b|\bsec\s+investigation\b",
            1.35,
            (
                "Cyber and operational resilience. Incidents can impair revenue, invite "
                "regulatory scrutiny, or raise insurance and capex costs — material for "
                "large platforms and security vendors in the index."
            ),
        ),
    ],
    "SELLSIDE_FLOW": [
        (
            r"\bupgrade\b|\bdowngrade\b|\binitiat(e|ion)\b|\bprice\s+target\b|\bpt\b|"
            r"\boverweight\b|\bunderweight\b|\bmarket-?perform\b|\bneutral\b|\bbuy\b|\bsell\b",
            0.95,
            (
                "Sell-side revision and rating flow. Short-horizon price pressure from "
                "commissioned research; treat as a noisy flow signal unless backed by "
                "fundamental delta — useful for microstructure, weak in isolation for alpha."
            ),
        ),
    ],
    "INDEX_VOL_MACRO_RISK": [
        (
            r"\bqqq\b|\bndx\b|\bnasdaq\s*100\b|\bspy\b|\bspx\b|\bvix\b|\bvolatility\b|"
            r"\bgamma\b|\b0dte\b|\boptions?\b|\bhedge\b",
            1.15,
            (
                "Index, volatility, and options positioning vocabulary. Often describes "
                "market regime (risk-on/off) or mechanical flows; connect to your "
                "benchmark excess return when scoring tweet impact."
            ),
        ),
    ],
    "COMMODITY_ENERGY_INPUT": [
        (
            r"\boil\b|\bwtic\b|\bbrent\b|\bnatural\s+gas\b|\bngl\b|\bpower\s+price\b|"
            r"\butility\b|\belectricity\b|\bdata\s+center\s+power\b",
            1.05,
            (
                "Energy and power input costs. Relevant for data-center intensity and "
                "industrial semis; second-order for pure software but first-order when "
                "grid or PPA costs dominate capex debate."
            ),
        ),
    ],
}

# Noise / distribution-quality penalties (negative weights; ingest may hard-block)
NOISE_PATTERNS: list[tuple[str, float, str]] = [
    (
        r"\b(discord|telegram|patreon|subscribe|link in bio)\b",
        -2.15,
        (
            "Distribution pattern typical of paid communities or subscriber conversion. "
            "High correlation with promotional intent; downweight for information content "
            "unless the same account has verified primary-source history."
        ),
    ),
    (
        r"\bnot financial advice\b|\bnfa\b",
        -1.25,
        (
            "Generic disclaimer language. Slightly negative prior on epistemic quality "
            "(often accompanies unsourced assertions); not a hard veto."
        ),
    ),
    (
        r"\b100x\b|\b10x\b|\bmoon\b|\bape\b|\bgem\b|\bbuy\s+now\b|\bsend\s+it\b|\blambo\b",
        -1.15,
        (
            "Speculative meme lexicon. Incompatible with institutional calibration; "
            "useful as a spam or manipulation prior for supervised filters."
        ),
    ),
]


@dataclass
class QQQScore:
    score: float
    reasons: list[str]
    explain: list[str]
    attribution: dict[str, Any] = field(default_factory=dict)


def _norm_user(username: str | None) -> str:
    return (username or "").lstrip("@").strip().lower()


def _channel_hits(
    text: str,
    *,
    omit_channels: frozenset[str] | None = None,
) -> tuple[float, list[str], list[str], list[dict[str, Any]]]:
    """Per channel: take max matching weight; record rationale for the winning pattern."""
    total = 0.0
    reasons: list[str] = []
    explain: list[str] = []
    channels_out: list[dict[str, Any]] = []

    for channel_id, patterns in TEXT_CHANNELS.items():
        if omit_channels is not None and channel_id in omit_channels:
            continue
        best_w = 0.0
        best_pat: str | None = None
        best_expl: str | None = None
        for pat, w, rationale in patterns:
            if re.search(pat, text, flags=re.IGNORECASE):
                if w > best_w:
                    best_w = w
                    best_pat = pat
                    best_expl = rationale
        if best_w > 0 and best_pat and best_expl:
            total += best_w
            reasons.append(f"ch:{channel_id}")
            explain.append(f"{channel_id}: {best_expl}")
            channels_out.append(
                {
                    "channel": channel_id,
                    "weight": best_w,
                    "pattern": best_pat[:180],
                    "rationale": best_expl,
                }
            )

    return total, reasons, explain, channels_out


def score_tweet_for_qqq(
    *,
    text: str,
    username: str | None,
    matched_tickers: list[str],
    spam_score: float | None,
    credibility_score: float | None,
    impact_scores: list[int] | None = None,
) -> QQQScore:
    reasons: list[str] = []
    attribution: dict[str, Any] = {
        "schema_version": 2,
        "methodology": (
            "score = source_weight * (ticker_linear + text_channels + impact_prior + noise) * quality_mult"
        ),
    }

    recap = is_recap_dashboard_post(text)
    user = _norm_user(username)
    src_w = SOURCE_WEIGHTS.get(user, 0.8)
    attribution["multipliers"] = {"source_weight": src_w, "quality": None}
    if user in SOURCE_WEIGHTS:
        reasons.append(f"src:{user}")

    tickers_up = [t.upper().strip() for t in matched_tickers if t]
    core_hits = sorted({t for t in tickers_up if t in QQQ_CORE_TICKERS})
    non_core = sorted({t for t in tickers_up if t not in QQQ_CORE_TICKERS})

    ticker_linear = 0.0
    ticker_analysis: dict[str, Any] = {
        "core_in_universe": core_hits,
        "non_core_count": len(non_core),
        "total_distinct": len(set(tickers_up)),
    }
    if core_hits:
        n_core = len(core_hits)
        reasons.append("core:" + ",".join(core_hits[:8]))
        # Diminishing returns: listing many mega-caps (heat maps, recaps) is not additive signal.
        ticker_linear += 2.1 * min(n_core, 4) + 0.35 * max(0, min(n_core - 4, 5))
        ticker_linear += 0.32 * min(len(non_core), 6)
    elif tickers_up:
        ticker_linear += 0.45 * min(len(set(tickers_up)), 8)

    laundry_pen = holdings_style_penalty(text, len(tickers_up))
    if laundry_pen:
        ticker_linear += laundry_pen
        reasons.append("penalty:holdings_laundry_list")

    r_pen = recap_dashboard_ticker_penalty(text, len(tickers_up))
    if r_pen:
        ticker_linear += r_pen
        reasons.append("penalty:recap_dashboard")

    omit_ch = frozenset({"INDEX_VOL_MACRO_RISK"}) if recap else frozenset()
    kw_score, kw_reasons, _, channel_records = _channel_hits(
        text,
        omit_channels=omit_ch if recap else None,
    )
    reasons.extend(kw_reasons)
    attribution["text_channels"] = channel_records

    noise = 0.0
    noise_hits: list[dict[str, Any]] = []
    for pat, w, human in NOISE_PATTERNS:
        if re.search(pat, text, flags=re.IGNORECASE):
            noise += w
            reasons.append(f"noise:{pat[:120]}")
            noise_hits.append({"pattern": pat[:120], "weight": w, "rationale": human})
    attribution["noise_hits"] = noise_hits

    impact_boost = 0.0
    if impact_scores:
        mx = max((abs(int(v)) for v in impact_scores if v is not None), default=0)
        if mx:
            impact_boost = min(2.15, mx / 4.5)
            reasons.append(f"impact:{mx}")
    if recap and impact_boost:
        impact_boost *= 0.22
        reasons.append("dampen:impact_recap_dashboard")
    max_imp_obs = (
        max((abs(int(v)) for v in impact_scores if v is not None), default=0)
        if impact_scores
        else 0
    )
    attribution["impact_prior"] = {
        "max_abs_impact_observed": max_imp_obs,
        "boost_applied_to_raw": impact_boost,
    }

    spam = float(spam_score) if spam_score is not None else 0.0
    cred = float(credibility_score) if credibility_score is not None else 0.2
    quality_mult = max(0.05, (1.0 - min(1.0, spam)) * (0.58 + 0.82 * min(1.0, cred)))
    attribution["multipliers"]["quality"] = quality_mult

    if spam_score is not None:
        reasons.append(f"spam:{spam:.2f}")
    if credibility_score is not None:
        reasons.append(f"cred:{cred:.2f}")

    raw_linear = ticker_linear + kw_score + impact_boost + noise
    score = src_w * raw_linear * quality_mult

    attribution["components"] = {
        "ticker_linear": ticker_linear,
        "text_channel_sum": kw_score,
        "impact_prior_linear": impact_boost,
        "noise_linear": noise,
        "raw_pre_multipliers": raw_linear,
        "final_score": score,
    }
    attribution["ticker_analysis"] = ticker_analysis

    return QQQScore(
        score=score,
        reasons=reasons[:32],
        explain=[],
        attribution=attribution,
    )
