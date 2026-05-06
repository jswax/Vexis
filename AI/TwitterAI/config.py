from functools import lru_cache
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Server
    port: int = Field(default=4001, validation_alias="PORT")
    env: Literal["development", "test", "production"] = Field(
        default="development", validation_alias="NODE_ENV"
    )

    # Database
    database_url: str = Field(validation_alias="DATABASE_URL")

    # API protection (optional)
    # When set, POST endpoints that mutate state require header `x-twitterai-token`.
    twitterai_token: str = Field(default="", validation_alias="TWITTERAI_TOKEN")

    # Apify
    apify_token: str = Field(default="", validation_alias="APIFY_TOKEN")
    # When false, ingest skips loading the ML model and writing tweet_predictions (faster; run backfill later).
    ingest_predictions: bool = Field(default=True, validation_alias="TWITTERAI_INGEST_PREDICTIONS")
    # Split [start,end] into windows of N calendar days and run Apify once per window so "Latest" is not
    # dominated by the last minutes. Set 0 for one actor run (old behavior — mostly "right now").
    ingest_date_shard_days: int = Field(
        default=5,
        ge=0,
        le=60,
        validation_alias="TWITTERAI_INGEST_DATE_SHARD_DAYS",
    )

    # Alpaca
    market_data_provider: str = Field(default="none", validation_alias="MARKET_DATA_PROVIDER")
    alpaca_api_key: str = Field(default="", validation_alias="ALPACA_API_KEY")
    alpaca_api_secret: str = Field(default="", validation_alias="ALPACA_API_SECRET")
    alpaca_stock_feed: Literal["iex", "sip", "otc", "boats"] = Field(
        default="sip", validation_alias="ALPACA_STOCK_FEED"
    )
    alpaca_crypto_loc: Literal["us", "us-1", "us-2", "eu-1", "bs-1"] = Field(
        default="us", validation_alias="ALPACA_CRYPTO_LOC"
    )

    # Benchmarks
    default_benchmark_stock: str = Field(default="SPY", validation_alias="DEFAULT_BENCHMARK_STOCK")
    default_benchmark_tech: str = Field(default="QQQ", validation_alias="DEFAULT_BENCHMARK_TECH")
    default_benchmark_crypto: str = Field(
        default="BTCUSD", validation_alias="DEFAULT_BENCHMARK_CRYPTO"
    )

    # Scoring
    impact_score_multiplier: float = Field(
        default=2.5, validation_alias="IMPACT_SCORE_MULTIPLIER"
    )
    impact_vol_floor: float = Field(
        default=0.001, validation_alias="IMPACT_VOL_FLOOR"
    )
    off_hours_impact_multiplier: float = Field(
        default=0.5, validation_alias="OFF_HOURS_IMPACT_MULTIPLIER"
    )

    # Ticker extraction / ingest quality
    match_max_tickers_per_tweet: int = Field(
        default=12, validation_alias="MATCH_MAX_TICKERS_PER_TWEET"
    )
    match_holdings_min_tickers: int = Field(
        default=10, validation_alias="MATCH_HOLDINGS_MIN_TICKERS"
    )
    match_holdings_min_cashtags: int = Field(
        default=8, validation_alias="MATCH_HOLDINGS_MIN_CASHTAGS"
    )
    match_holdings_keep_tickers: str = Field(
        default="QQQ,QQQM,SPY",
        validation_alias="MATCH_HOLDINGS_KEEP_TICKERS",
    )

    @model_validator(mode="after")
    def _check_alpaca(self) -> "Settings":
        if self.market_data_provider.lower() == "alpaca":
            if not self.alpaca_api_key or not self.alpaca_api_secret:
                raise ValueError(
                    'MARKET_DATA_PROVIDER="alpaca" requires ALPACA_API_KEY and ALPACA_API_SECRET'
                )
        return self

    @model_validator(mode="after")
    def _check_railway(self) -> "Settings":
        if self.env in ("development", "test") and ".railway.internal" in self.database_url:
            raise ValueError(
                "DATABASE_URL points to a Railway internal host, which is not reachable "
                "from local development. Use the public proxy URL instead."
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
