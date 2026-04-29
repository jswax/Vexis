from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


AssetType = Literal["STOCK", "ETF", "CRYPTO", "INDEX", "FX", "COMMODITY", "UNKNOWN"]
OutcomeHorizon = Literal["M5", "M15", "M30", "H1", "H4", "H6", "D1"]
DirectionLabel = Literal["BULLISH", "BEARISH", "NEUTRAL"]
JobStatus = Literal["CREATED", "RUNNING", "SUCCEEDED", "FAILED"]


class TweetIngestionJob(Base):
    __tablename__ = "tweet_ingestion_jobs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    source: Mapped[str] = mapped_column(Text, nullable=False)
    provider: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(
        Enum("CREATED", "RUNNING", "SUCCEEDED", "FAILED", name="job_status"), nullable=False
    )
    actor_id: Mapped[str] = mapped_column(Text, nullable=False)
    query_config_json: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB)
    items_requested: Mapped[Optional[int]] = mapped_column(Integer)
    items_received: Mapped[Optional[int]] = mapped_column(Integer)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    error_message: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class TwitterAuthor(Base):
    __tablename__ = "twitter_authors"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    external_id: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    username: Mapped[str] = mapped_column(Text, nullable=False)
    display_name: Mapped[str] = mapped_column(Text, nullable=False)
    verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    followers_count: Mapped[Optional[int]] = mapped_column(Integer)
    following_count: Mapped[Optional[int]] = mapped_column(Integer)
    favourites_count: Mapped[Optional[int]] = mapped_column(Integer)
    statuses_count: Mapped[Optional[int]] = mapped_column(Integer)
    raw_json: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    tweets: Mapped[list["Tweet"]] = relationship(back_populates="author")


class Tweet(Base):
    __tablename__ = "tweets"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    external_id: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    raw_json: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB)
    language: Mapped[Optional[str]] = mapped_column(String(16))
    created_at_twitter: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    scraped_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    source_query: Mapped[Optional[str]] = mapped_column(Text)
    source_query_type: Mapped[Optional[str]] = mapped_column(Text)
    matched_search_term: Mapped[Optional[str]] = mapped_column(Text)
    like_count: Mapped[Optional[int]] = mapped_column(Integer)
    retweet_count: Mapped[Optional[int]] = mapped_column(Integer)
    reply_count: Mapped[Optional[int]] = mapped_column(Integer)
    quote_count: Mapped[Optional[int]] = mapped_column(Integer)
    bookmark_count: Mapped[Optional[int]] = mapped_column(Integer)
    view_count: Mapped[Optional[int]] = mapped_column(Integer)
    is_reply: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_retweet: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_quote: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    has_images: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    has_video: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    author_id: Mapped[str] = mapped_column(
        String, ForeignKey("twitter_authors.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    author: Mapped["TwitterAuthor"] = relationship(back_populates="tweets")
    asset_matches: Mapped[list["TweetAssetMatch"]] = relationship(back_populates="tweet")
    market_snapshots: Mapped[list["MarketSnapshot"]] = relationship(back_populates="tweet")
    outcomes: Mapped[list["TweetOutcome"]] = relationship(back_populates="tweet")
    features: Mapped[Optional["TweetFeatures"]] = relationship(
        back_populates="tweet", uselist=False
    )


class TweetAssetMatch(Base):
    __tablename__ = "tweet_asset_matches"
    __table_args__ = (
        UniqueConstraint("tweet_id", "ticker", "match_method", name="uq_tweet_asset_match"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    tweet_id: Mapped[str] = mapped_column(
        String, ForeignKey("tweets.id", ondelete="CASCADE"), nullable=False
    )
    asset_type: Mapped[str] = mapped_column(
        Enum("STOCK", "ETF", "CRYPTO", "INDEX", "FX", "COMMODITY", "UNKNOWN", name="asset_type"),
        nullable=False,
    )
    ticker: Mapped[str] = mapped_column(Text, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    match_method: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    tweet: Mapped["Tweet"] = relationship(back_populates="asset_matches")


class MarketSnapshot(Base):
    __tablename__ = "market_snapshots"
    __table_args__ = (
        UniqueConstraint("tweet_id", "ticker", name="uq_market_snapshot"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    tweet_id: Mapped[str] = mapped_column(
        String, ForeignKey("tweets.id", ondelete="CASCADE"), nullable=False
    )
    ticker: Mapped[str] = mapped_column(Text, nullable=False)
    asset_type: Mapped[str] = mapped_column(
        Enum("STOCK", "ETF", "CRYPTO", "INDEX", "FX", "COMMODITY", "UNKNOWN", name="asset_type"),
        nullable=False,
    )
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    price: Mapped[float] = mapped_column(Float, nullable=False)
    volume: Mapped[Optional[float]] = mapped_column(Float)
    vwap: Mapped[Optional[float]] = mapped_column(Float)
    rsi: Mapped[Optional[float]] = mapped_column(Float)
    macd: Mapped[Optional[float]] = mapped_column(Float)
    atr: Mapped[Optional[float]] = mapped_column(Float)
    realized_volatility: Mapped[Optional[float]] = mapped_column(Float)
    benchmark_ticker: Mapped[Optional[str]] = mapped_column(Text)
    benchmark_price: Mapped[Optional[float]] = mapped_column(Float)
    market_open_flag: Mapped[bool] = mapped_column(Boolean, nullable=False)
    session_type: Mapped[Optional[str]] = mapped_column(Text)
    raw_json: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    tweet: Mapped["Tweet"] = relationship(back_populates="market_snapshots")


class TweetOutcome(Base):
    __tablename__ = "tweet_outcomes"
    __table_args__ = (
        UniqueConstraint("tweet_id", "ticker", "horizon", name="uq_tweet_outcome"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    tweet_id: Mapped[str] = mapped_column(
        String, ForeignKey("tweets.id", ondelete="CASCADE"), nullable=False
    )
    ticker: Mapped[str] = mapped_column(Text, nullable=False)
    horizon: Mapped[str] = mapped_column(
        Enum("M5", "M15", "M30", "H1", "H4", "H6", "D1", name="outcome_horizon"), nullable=False
    )
    price_at_tweet: Mapped[float] = mapped_column(Float, nullable=False)
    price_at_horizon: Mapped[float] = mapped_column(Float, nullable=False)
    raw_return: Mapped[float] = mapped_column(Float, nullable=False)
    benchmark_return: Mapped[Optional[float]] = mapped_column(Float)
    excess_return: Mapped[Optional[float]] = mapped_column(Float)
    expected_volatility: Mapped[Optional[float]] = mapped_column(Float)
    vol_adjusted_return: Mapped[Optional[float]] = mapped_column(Float)
    impact_score: Mapped[int] = mapped_column(Integer, nullable=False)
    direction_label: Mapped[str] = mapped_column(
        Enum("BULLISH", "BEARISH", "NEUTRAL", name="direction_label"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    tweet: Mapped["Tweet"] = relationship(back_populates="outcomes")


class TweetFeatures(Base):
    __tablename__ = "tweet_features"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    tweet_id: Mapped[str] = mapped_column(
        String, ForeignKey("tweets.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    sentiment_score: Mapped[Optional[float]] = mapped_column(Float)
    credibility_score: Mapped[Optional[float]] = mapped_column(Float)
    spam_score: Mapped[Optional[float]] = mapped_column(Float)
    duplicate_group_id: Mapped[Optional[str]] = mapped_column(Text)
    embedding_model: Mapped[Optional[str]] = mapped_column(Text)
    # Model prediction summary (D1 horizon — quick lookup without joining tweet_predictions)
    model_direction_pred: Mapped[Optional[str]] = mapped_column(Text)
    model_direction_conf: Mapped[Optional[float]] = mapped_column(Float)
    model_version: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    tweet: Mapped["Tweet"] = relationship(back_populates="features")


class AssetAlias(Base):
    __tablename__ = "asset_aliases"
    __table_args__ = (
        UniqueConstraint("asset_type", "alias", name="uq_asset_alias"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    asset_type: Mapped[str] = mapped_column(
        Enum("STOCK", "ETF", "CRYPTO", "INDEX", "FX", "COMMODITY", "UNKNOWN", name="asset_type"),
        nullable=False,
    )
    ticker: Mapped[str] = mapped_column(Text, nullable=False)
    alias: Mapped[str] = mapped_column(Text, nullable=False)
    match_method: Mapped[str] = mapped_column(Text, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class TweetPrediction(Base):
    """Per-horizon model predictions stored at ingest time."""

    __tablename__ = "tweet_predictions"
    __table_args__ = (
        UniqueConstraint(
            "tweet_id", "ticker", "horizon", "model_version",
            name="uq_tweet_prediction",
        ),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    tweet_id: Mapped[str] = mapped_column(
        String, ForeignKey("tweets.id", ondelete="CASCADE"), nullable=False
    )
    ticker: Mapped[str] = mapped_column(Text, nullable=False)
    horizon: Mapped[str] = mapped_column(Text, nullable=False)
    model_version: Mapped[str] = mapped_column(Text, nullable=False)
    direction_pred: Mapped[str] = mapped_column(Text, nullable=False)
    bullish_prob: Mapped[float] = mapped_column(Float, nullable=False)
    bearish_prob: Mapped[float] = mapped_column(Float, nullable=False)
    neutral_prob: Mapped[float] = mapped_column(Float, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    tweet: Mapped["Tweet"] = relationship("Tweet", foreign_keys=[tweet_id])
