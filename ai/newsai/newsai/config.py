from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = Field(
        default="postgresql+psycopg2://localhost:5432/qqq_news",
        validation_alias="DATABASE_URL",
    )
    alpaca_api_key_id: str = Field(default="", validation_alias="ALPACA_API_KEY_ID")
    alpaca_api_secret_key: str = Field(default="", validation_alias="ALPACA_API_SECRET_KEY")
    alpaca_data_base_url: str = Field(
        default="https://data.alpaca.markets",
        validation_alias="ALPACA_DATA_BASE_URL",
    )
    alpaca_bar_feed: str = Field(default="iex", validation_alias="ALPACA_BAR_FEED")
    benzinga_api_key: str = Field(default="", validation_alias="BENZINGA_API_KEY")

    symbol: str = Field(default="QQQ", validation_alias="NEWSAI_SYMBOL")
    impact_minutes: int = Field(default=20, validation_alias="NEWSAI_IMPACT_MINUTES")
    gdelt_query: str = Field(
        default='QQQ OR "Invesco QQQ"',
        validation_alias="NEWSAI_GDELT_QUERY",
    )
    gdelt_max_records: int = Field(default=50, validation_alias="NEWSAI_GDELT_MAX_RECORDS")


@lru_cache
def get_settings() -> Settings:
    return Settings()
