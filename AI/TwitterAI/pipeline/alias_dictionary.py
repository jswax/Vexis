"""
Static alias seed dictionary — company names, ETF keywords, crypto aliases.
Extended at runtime from the asset_aliases DB table.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

MatchMethod = Literal["alias_dictionary", "keyword_rule", "crypto_alias", "cashtag", "direct_ticker", "db"]
AssetTypeLit = Literal["STOCK", "ETF", "CRYPTO", "INDEX", "FX", "COMMODITY", "UNKNOWN"]


@dataclass
class AliasSeed:
    asset_type: AssetTypeLit
    ticker: str
    alias: str
    match_method: MatchMethod
    confidence: float


_SEEDS: list[AliasSeed] = [
    # ── Mega-cap tech ──────────────────────────────────────────────
    AliasSeed("STOCK", "TSLA", "tesla", "alias_dictionary", 0.8),
    AliasSeed("STOCK", "NVDA", "nvidia", "alias_dictionary", 0.8),
    AliasSeed("STOCK", "AAPL", "apple", "alias_dictionary", 0.75),
    AliasSeed("STOCK", "MSFT", "microsoft", "alias_dictionary", 0.75),
    AliasSeed("STOCK", "AMZN", "amazon", "alias_dictionary", 0.75),
    AliasSeed("STOCK", "META", "meta", "alias_dictionary", 0.65),
    AliasSeed("STOCK", "META", "facebook", "alias_dictionary", 0.65),
    AliasSeed("STOCK", "GOOGL", "google", "alias_dictionary", 0.65),
    AliasSeed("STOCK", "GOOGL", "alphabet", "alias_dictionary", 0.65),
    AliasSeed("STOCK", "AMD", "amd", "alias_dictionary", 0.75),
    AliasSeed("STOCK", "AMD", "advanced micro devices", "alias_dictionary", 0.8),
    AliasSeed("STOCK", "NFLX", "netflix", "alias_dictionary", 0.8),
    AliasSeed("STOCK", "ORCL", "oracle", "alias_dictionary", 0.75),
    AliasSeed("STOCK", "CRM", "salesforce", "alias_dictionary", 0.75),
    AliasSeed("STOCK", "ADBE", "adobe", "alias_dictionary", 0.75),
    AliasSeed("STOCK", "INTC", "intel", "alias_dictionary", 0.75),
    AliasSeed("STOCK", "QCOM", "qualcomm", "alias_dictionary", 0.75),
    AliasSeed("STOCK", "AVGO", "broadcom", "alias_dictionary", 0.75),
    # ── Financials ────────────────────────────────────────────────
    AliasSeed("STOCK", "JPM", "jpmorgan", "alias_dictionary", 0.8),
    AliasSeed("STOCK", "JPM", "jp morgan", "alias_dictionary", 0.8),
    AliasSeed("STOCK", "BAC", "bank of america", "alias_dictionary", 0.8),
    AliasSeed("STOCK", "GS", "goldman sachs", "alias_dictionary", 0.8),
    AliasSeed("STOCK", "GS", "goldman", "alias_dictionary", 0.7),
    AliasSeed("STOCK", "MS", "morgan stanley", "alias_dictionary", 0.8),
    AliasSeed("STOCK", "WFC", "wells fargo", "alias_dictionary", 0.8),
    AliasSeed("STOCK", "C", "citigroup", "alias_dictionary", 0.75),
    AliasSeed("STOCK", "C", "citi", "alias_dictionary", 0.7),
    AliasSeed("STOCK", "V", "visa", "alias_dictionary", 0.8),
    AliasSeed("STOCK", "MA", "mastercard", "alias_dictionary", 0.8),
    AliasSeed("STOCK", "BRK.B", "berkshire", "alias_dictionary", 0.7),
    AliasSeed("STOCK", "BRK.B", "berkshire hathaway", "alias_dictionary", 0.8),
    AliasSeed("STOCK", "BLK", "blackrock", "alias_dictionary", 0.8),
    # ── Healthcare & pharma ────────────────────────────────────────
    AliasSeed("STOCK", "UNH", "unitedhealth", "alias_dictionary", 0.75),
    AliasSeed("STOCK", "JNJ", "johnson & johnson", "alias_dictionary", 0.8),
    AliasSeed("STOCK", "JNJ", "johnson and johnson", "alias_dictionary", 0.8),
    AliasSeed("STOCK", "PFE", "pfizer", "alias_dictionary", 0.8),
    AliasSeed("STOCK", "MRK", "merck", "alias_dictionary", 0.75),
    AliasSeed("STOCK", "ABBV", "abbvie", "alias_dictionary", 0.75),
    AliasSeed("STOCK", "LLY", "eli lilly", "alias_dictionary", 0.8),
    AliasSeed("STOCK", "LLY", "lilly", "alias_dictionary", 0.65),
    # ── Consumer & retail ──────────────────────────────────────────
    AliasSeed("STOCK", "WMT", "walmart", "alias_dictionary", 0.8),
    AliasSeed("STOCK", "TGT", "target", "alias_dictionary", 0.7),
    AliasSeed("STOCK", "COST", "costco", "alias_dictionary", 0.8),
    AliasSeed("STOCK", "HD", "home depot", "alias_dictionary", 0.8),
    AliasSeed("STOCK", "MCD", "mcdonald's", "alias_dictionary", 0.8),
    AliasSeed("STOCK", "SBUX", "starbucks", "alias_dictionary", 0.8),
    AliasSeed("STOCK", "NKE", "nike", "alias_dictionary", 0.75),
    AliasSeed("STOCK", "KO", "coca-cola", "alias_dictionary", 0.75),
    AliasSeed("STOCK", "KO", "coca cola", "alias_dictionary", 0.75),
    AliasSeed("STOCK", "PEP", "pepsi", "alias_dictionary", 0.75),
    AliasSeed("STOCK", "PEP", "pepsico", "alias_dictionary", 0.75),
    # ── Energy ────────────────────────────────────────────────────
    AliasSeed("STOCK", "XOM", "exxon", "alias_dictionary", 0.8),
    AliasSeed("STOCK", "XOM", "exxonmobil", "alias_dictionary", 0.8),
    AliasSeed("STOCK", "CVX", "chevron", "alias_dictionary", 0.8),
    # ── Industrials / defence / aerospace ─────────────────────────
    AliasSeed("STOCK", "BA", "boeing", "alias_dictionary", 0.8),
    AliasSeed("STOCK", "CAT", "caterpillar", "alias_dictionary", 0.75),
    AliasSeed("STOCK", "LMT", "lockheed martin", "alias_dictionary", 0.8),
    AliasSeed("STOCK", "RTX", "raytheon", "alias_dictionary", 0.75),
    # ── Media / entertainment ─────────────────────────────────────
    AliasSeed("STOCK", "DIS", "disney", "alias_dictionary", 0.8),
    AliasSeed("STOCK", "PARA", "paramount", "alias_dictionary", 0.7),
    AliasSeed("STOCK", "WBD", "warner bros", "alias_dictionary", 0.7),
    # ── Other notable names ───────────────────────────────────────
    AliasSeed("STOCK", "COIN", "coinbase", "alias_dictionary", 0.85),
    AliasSeed("STOCK", "MSTR", "microstrategy", "alias_dictionary", 0.85),
    AliasSeed("STOCK", "PLTR", "palantir", "alias_dictionary", 0.8),
    AliasSeed("STOCK", "RBLX", "roblox", "alias_dictionary", 0.75),
    AliasSeed("STOCK", "SNAP", "snapchat", "alias_dictionary", 0.75),
    AliasSeed("STOCK", "UBER", "uber", "alias_dictionary", 0.75),
    AliasSeed("STOCK", "LYFT", "lyft", "alias_dictionary", 0.75),
    AliasSeed("STOCK", "ABNB", "airbnb", "alias_dictionary", 0.8),
    AliasSeed("STOCK", "HOOD", "robinhood", "alias_dictionary", 0.8),
    AliasSeed("STOCK", "RIVN", "rivian", "alias_dictionary", 0.8),
    AliasSeed("STOCK", "GME", "gamestop", "alias_dictionary", 0.85),
    AliasSeed("STOCK", "AMC", "amc", "alias_dictionary", 0.7),
    # ── ETFs / benchmarks ─────────────────────────────────────────
    AliasSeed("ETF", "SPY", "s&p 500", "keyword_rule", 0.7),
    AliasSeed("ETF", "SPY", "sp 500", "keyword_rule", 0.7),
    AliasSeed("ETF", "SPY", "s&p500", "keyword_rule", 0.7),
    AliasSeed("ETF", "SPY", "sp500", "keyword_rule", 0.7),
    AliasSeed("ETF", "QQQ", "nasdaq", "keyword_rule", 0.7),
    AliasSeed("ETF", "QQQ", "nasdaq 100", "keyword_rule", 0.75),
    AliasSeed("ETF", "QQQ", "nasdaq100", "keyword_rule", 0.75),
    AliasSeed("ETF", "IWM", "russell 2000", "keyword_rule", 0.75),
    AliasSeed("ETF", "GLD", "gold etf", "keyword_rule", 0.7),
    AliasSeed("ETF", "GLD", "gold price", "keyword_rule", 0.6),
    AliasSeed("ETF", "SLV", "silver etf", "keyword_rule", 0.7),
    AliasSeed("ETF", "TLT", "20 year treasury", "keyword_rule", 0.7),
    AliasSeed("ETF", "TLT", "long bond", "keyword_rule", 0.5),
    AliasSeed("ETF", "XLF", "financial sector", "keyword_rule", 0.55),
    AliasSeed("ETF", "XLE", "energy sector", "keyword_rule", 0.55),
    AliasSeed("ETF", "XLK", "tech sector", "keyword_rule", 0.5),
    AliasSeed("ETF", "ARKK", "ark invest", "keyword_rule", 0.75),
    AliasSeed("ETF", "SPY", "stocks", "keyword_rule", 0.4),
    AliasSeed("ETF", "QQQ", "tech stocks", "keyword_rule", 0.45),
    AliasSeed("ETF", "SPY", "stock market", "keyword_rule", 0.45),
    AliasSeed("ETF", "SPY", "equities", "keyword_rule", 0.4),
    AliasSeed("ETF", "GLD", "gold", "keyword_rule", 0.5),
    # ── Crypto ────────────────────────────────────────────────────
    AliasSeed("CRYPTO", "BTC", "bitcoin", "crypto_alias", 0.85),
    AliasSeed("CRYPTO", "BTC", "btc", "crypto_alias", 0.8),
    AliasSeed("CRYPTO", "ETH", "ethereum", "crypto_alias", 0.85),
    AliasSeed("CRYPTO", "ETH", "eth", "crypto_alias", 0.8),
    AliasSeed("CRYPTO", "SOL", "solana", "crypto_alias", 0.85),
    AliasSeed("CRYPTO", "SOL", "sol", "crypto_alias", 0.75),
    AliasSeed("CRYPTO", "XRP", "ripple", "crypto_alias", 0.8),
    AliasSeed("CRYPTO", "XRP", "xrp", "crypto_alias", 0.8),
    AliasSeed("CRYPTO", "ADA", "cardano", "crypto_alias", 0.8),
    AliasSeed("CRYPTO", "DOGE", "dogecoin", "crypto_alias", 0.85),
    AliasSeed("CRYPTO", "DOGE", "doge", "crypto_alias", 0.8),
    AliasSeed("CRYPTO", "AVAX", "avalanche", "crypto_alias", 0.8),
    AliasSeed("CRYPTO", "LINK", "chainlink", "crypto_alias", 0.8),
    AliasSeed("CRYPTO", "DOT", "polkadot", "crypto_alias", 0.8),
    AliasSeed("CRYPTO", "MATIC", "polygon", "crypto_alias", 0.8),
    AliasSeed("CRYPTO", "LTC", "litecoin", "crypto_alias", 0.8),
    AliasSeed("CRYPTO", "UNI", "uniswap", "crypto_alias", 0.8),
    AliasSeed("CRYPTO", "SHIB", "shiba inu", "crypto_alias", 0.8),
    AliasSeed("CRYPTO", "SHIB", "shib", "crypto_alias", 0.75),
    AliasSeed("CRYPTO", "BNB", "binance coin", "crypto_alias", 0.8),
    AliasSeed("CRYPTO", "BNB", "bnb", "crypto_alias", 0.75),
    AliasSeed("CRYPTO", "SUI", "sui", "crypto_alias", 0.75),
    AliasSeed("CRYPTO", "APT", "aptos", "crypto_alias", 0.75),
    AliasSeed("CRYPTO", "PEPE", "pepe", "crypto_alias", 0.7),
]

KNOWN_TICKERS: set[str] = set()
KNOWN_CRYPTO_TICKERS: set[str] = set()

for _s in _SEEDS:
    if _s.asset_type in ("STOCK", "ETF"):
        KNOWN_TICKERS.add(_s.ticker.upper())
    elif _s.asset_type == "CRYPTO":
        KNOWN_CRYPTO_TICKERS.add(_s.ticker.upper())

# Extra well-known tickers not already covered
KNOWN_TICKERS.update([
    "SPY", "QQQ", "IWM", "GLD", "SLV", "TLT", "XLF", "XLE", "XLK", "ARKK",
    "TSLA", "NVDA", "AAPL", "MSFT", "AMZN", "META", "GOOGL", "GOOG", "AMD",
    "NFLX", "ORCL", "CRM", "ADBE", "INTC", "QCOM", "AVGO",
    "JPM", "BAC", "GS", "MS", "WFC", "C", "V", "MA", "BLK",
    "UNH", "JNJ", "PFE", "MRK", "ABBV", "LLY",
    "WMT", "TGT", "COST", "HD", "MCD", "SBUX", "NKE", "KO", "PEP",
    "XOM", "CVX", "BA", "CAT", "DE", "LMT", "RTX",
    "DIS", "PARA", "WBD",
    "COIN", "MSTR", "PLTR", "RBLX", "SNAP", "UBER", "LYFT", "ABNB",
    "HOOD", "RIVN", "LCID", "GME", "AMC",
])
KNOWN_CRYPTO_TICKERS.update([
    "BTC", "ETH", "SOL", "XRP", "ADA", "DOGE", "AVAX", "LINK",
    "DOT", "MATIC", "LTC", "UNI", "SHIB", "BNB", "SUI", "APT", "PEPE",
])


def get_seeds() -> list[AliasSeed]:
    return list(_SEEDS)
