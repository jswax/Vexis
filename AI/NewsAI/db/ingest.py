from __future__ import annotations

from sqlalchemy import exists, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from config import get_settings
from db.models import Article, LabeledArticle, PriceBar
from pipeline.filters import apply_article_filters
from pipeline.labeling import (
    compute_p95_abs,
    impact_score_from_delta,
    neutral_bucket,
    raw_delta_pct,
)
from pipeline.timestamp_matcher import impact_window_end, resolve_baseline_bar_start
from prices.alpaca_bars import MinuteBar
from scrapers.gdelt import NormalizedArticle


def upsert_article(session: Session, item: NormalizedArticle) -> Article:
    if item.url:
        existing = session.scalar(select(Article).where(Article.url == item.url))
        if existing:
            return existing
    row = Article(
        headline=item.headline,
        body_excerpt=item.body_excerpt,
        source=item.source,
        published_at=item.published_at,
        url=item.url,
        raw_metadata=item.raw,
    )
    session.add(row)
    session.flush()
    return row


def upsert_price_bars(session: Session, bars: list[MinuteBar]) -> int:
    if not bars:
        return 0
    settings = get_settings()
    rows = [
        {
            "symbol": settings.symbol,
            "ts": b.ts,
            "open": b.open,
            "high": b.high,
            "low": b.low,
            "close": b.close,
            "volume": b.volume,
        }
        for b in bars
    ]
    stmt = pg_insert(PriceBar).values(rows)
    ex = stmt.excluded
    stmt = stmt.on_conflict_do_update(
        index_elements=[PriceBar.symbol, PriceBar.ts],
        set_={
            "open": ex.open,
            "high": ex.high,
            "low": ex.low,
            "close": ex.close,
            "volume": ex.volume,
        },
    )
    session.execute(stmt)
    return len(rows)


def bar_close_at(session: Session, ts) -> float | None:
    settings = get_settings()
    row = session.scalar(
        select(PriceBar).where(PriceBar.symbol == settings.symbol, PriceBar.ts == ts)
    )
    return float(row.close) if row else None


def training_p95(session: Session) -> float:
    rows = session.scalars(select(LabeledArticle.raw_delta_pct)).all()
    if not rows:
        return 0.5
    return compute_p95_abs(list(rows))


def label_pending_articles(session: Session, limit: int = 500) -> int:
    """Attach labeled_articles rows where prices exist for t0 and tN."""
    settings = get_settings()
    p95 = training_p95(session)

    has_label = exists().where(LabeledArticle.article_id == Article.id)
    q = (
        select(Article)
        .where(~has_label)
        .order_by(Article.published_at.desc())
        .limit(limit)
    )
    articles = list(session.scalars(q))
    n = 0
    for art in articles:
        baseline = resolve_baseline_bar_start(art.published_at)
        t_end = impact_window_end(baseline, settings.impact_minutes)
        c0 = bar_close_at(session, baseline)
        c1 = bar_close_at(session, t_end)
        if c0 is None or c1 is None:
            continue
        delta = raw_delta_pct(c0, c1)
        score = impact_score_from_delta(delta, p95)
        filt = apply_article_filters(art.headline, art.published_at, body=art.body_excerpt)
        bucket = "neutral" if neutral_bucket(score) else ("bullish" if score > 0 else "bearish")
        row = LabeledArticle(
            article_id=art.id,
            price_t0_ts=baseline,
            price_t0=c0,
            price_tN_ts=t_end,
            price_tN=c1,
            raw_delta_pct=delta,
            impact_score=score,
            label_bucket=bucket,
            filters_applied={"exclude": filt.exclude, "reasons": filt.reasons},
        )
        session.merge(row)
        n += 1
    return n
