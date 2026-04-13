from datetime import datetime
from typing import Any, Optional

from sqlalchemy import BigInteger, DateTime, Double, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Article(Base):
    __tablename__ = "articles"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    headline: Mapped[str] = mapped_column(Text, nullable=False)
    body_excerpt: Mapped[Optional[str]] = mapped_column(Text)
    source: Mapped[str] = mapped_column(Text, nullable=False)
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    url: Mapped[Optional[str]] = mapped_column(Text, unique=True)
    scraped_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    raw_metadata: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB)

    label: Mapped[Optional["LabeledArticle"]] = relationship(
        back_populates="article",
        uselist=False,
    )


class PriceBar(Base):
    __tablename__ = "prices"

    symbol: Mapped[str] = mapped_column(String(16), primary_key=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    open: Mapped[float] = mapped_column(Double, nullable=False)
    high: Mapped[float] = mapped_column(Double, nullable=False)
    low: Mapped[float] = mapped_column(Double, nullable=False)
    close: Mapped[float] = mapped_column(Double, nullable=False)
    volume: Mapped[float] = mapped_column(Double, nullable=False, default=0.0)


class Prediction(Base):
    __tablename__ = "predictions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    article_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("articles.id", ondelete="SET NULL")
    )
    headline: Mapped[str] = mapped_column(Text, nullable=False)
    predicted_score: Mapped[float] = mapped_column(Double, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class LabeledArticle(Base):
    __tablename__ = "labeled_articles"

    article_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("articles.id", ondelete="CASCADE"), primary_key=True
    )
    price_t0_ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    price_t0: Mapped[float] = mapped_column(Double, nullable=False)
    price_tN_ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    price_tN: Mapped[float] = mapped_column(Double, nullable=False)
    raw_delta_pct: Mapped[float] = mapped_column(Double, nullable=False)
    impact_score: Mapped[Optional[float]] = mapped_column(Double)
    label_bucket: Mapped[Optional[str]] = mapped_column(Text)
    filters_applied: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB)
    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    article: Mapped["Article"] = relationship(back_populates="label")
