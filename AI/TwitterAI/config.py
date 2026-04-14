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

    # twitterapi.io
    twitter_api_io_key: str = Field(default="", validation_alias="TWITTER_API_IO_KEY")

    # Alpaca
    market_data_provider: str = Field(default="none", validation_alias="MARKET_DATA_PROVIDER")
    alpaca_api_key: str = Field(default="", validation_alias="ALPACA_API_KEY")
    alpaca_api_secret: str = Field(default="", validation_alias="ALPACA_API_SECRET")
    alpaca_stock_feed: Literal["iex", "sip", "otc", "boats"] = Field(
        default="iex", validation_alias="ALPACA_STOCK_FEED"
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
