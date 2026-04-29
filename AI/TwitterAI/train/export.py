"""
Build labeled training rows and export to JSONL or CSV.
"""

from __future__ import annotations

import csv
import json
import sys
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from db.models import Tweet, TweetFeatures, TweetOutcome, TwitterAuthor


@dataclass
class TrainingRow:
    tweet_id: str
    tweet_external_id: str
    created_at_twitter: str
    url: str
    text: str
    author_username: str
    author_verified: bool
    ticker: str
    horizon: str
    impact_score: int
    direction_label: str
    raw_return: float
    benchmark_return: float | None
    excess_return: float | None
    expected_volatility: float | None
    vol_adjusted_return: float | None
    spam_score: float | None
    credibility_score: float | None
    duplicate_group_id: str | None


def build_rows(session: Session, limit: int | None = 5000) -> list[TrainingRow]:
    stmt = select(TweetOutcome).order_by(TweetOutcome.created_at.desc())
    if limit is not None:
        stmt = stmt.limit(limit)
    outcomes = session.execute(stmt).scalars().all()
    if not outcomes:
        return []

    tweet_ids = list({o.tweet_id for o in outcomes})
    tweets = {
        t.id: t
        for t in session.execute(select(Tweet).where(Tweet.id.in_(tweet_ids))).scalars().all()
    }
    author_ids = list({t.author_id for t in tweets.values()})
    authors: dict[str, TwitterAuthor] = {}
    if author_ids:
        authors = {
            a.id: a
            for a in session.execute(
                select(TwitterAuthor).where(TwitterAuthor.id.in_(author_ids))
            ).scalars().all()
        }
    features_by_tweet: dict[str, TweetFeatures] = {}
    for f in session.execute(
        select(TweetFeatures).where(TweetFeatures.tweet_id.in_(tweet_ids))
    ).scalars().all():
        features_by_tweet[f.tweet_id] = f

    rows: list[TrainingRow] = []
    for o in outcomes:
        tweet = tweets.get(o.tweet_id)
        if not tweet:
            continue
        author = authors.get(tweet.author_id)
        features = features_by_tweet.get(tweet.id)
        rows.append(
            TrainingRow(
                tweet_id=tweet.id,
                tweet_external_id=tweet.external_id,
                created_at_twitter=tweet.created_at_twitter.isoformat(),
                url=tweet.url,
                text=tweet.text,
                author_username=author.username if author else "",
                author_verified=author.verified if author else False,
                ticker=o.ticker,
                horizon=o.horizon,
                impact_score=o.impact_score,
                direction_label=o.direction_label,
                raw_return=o.raw_return,
                benchmark_return=o.benchmark_return,
                excess_return=o.excess_return,
                expected_volatility=o.expected_volatility,
                vol_adjusted_return=o.vol_adjusted_return,
                spam_score=features.spam_score if features else None,
                credibility_score=features.credibility_score if features else None,
                duplicate_group_id=features.duplicate_group_id if features else None,
            )
        )
    return rows


def _apply_filters(rows: list[TrainingRow], filters: dict[str, Any]) -> list[TrainingRow]:
    out: list[TrainingRow] = []
    for r in rows:
        if filters.get("max_spam_score") is not None and r.spam_score is not None:
            if r.spam_score >= filters["max_spam_score"]:
                continue
        if filters.get("min_credibility_score") is not None and r.credibility_score is not None:
            if r.credibility_score < filters["min_credibility_score"]:
                continue
        if filters.get("tickers") and r.ticker not in filters["tickers"]:
            continue
        if filters.get("horizons") and r.horizon not in filters["horizons"]:
            continue
        if filters.get("min_abs_impact_score") is not None:
            if abs(r.impact_score) < filters["min_abs_impact_score"]:
                continue
        out.append(r)
    return out


def export_snapshot_json(
    rows: list[TrainingRow],
    out_file: str,
    *,
    meta: dict[str, Any] | None = None,
    compact: bool = False,
) -> int:
    """
    Single JSON file: { "meta": {...}, "rows": [ {TrainingRow as dict}, ... ] }.
    Same row schema as JSONL export; no filters applied (callers filter first if needed).
    Use compact=True for large datasets (faster write, smaller file; still valid JSON).
    """
    Path(out_file).parent.mkdir(parents=True, exist_ok=True)
    payload: dict[str, Any] = {
        "meta": {
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "row_count": len(rows),
            **(meta or {}),
        },
        "rows": [asdict(r) for r in rows],
    }
    with open(out_file, "w", encoding="utf-8") as f:
        if compact:
            json.dump(payload, f, ensure_ascii=False, separators=(",", ":"), default=str)
        else:
            json.dump(payload, f, ensure_ascii=False, indent=2, default=str)
    return len(rows)


def export_jsonl(
    rows: list[TrainingRow],
    out_file: str,
    filters: dict[str, Any] | None = None,
) -> int:
    if filters:
        rows = _apply_filters(rows, filters)
    with open(out_file, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(asdict(r), ensure_ascii=False, default=str) + "\n")
    return len(rows)


def export_csv(
    rows: list[TrainingRow],
    out_file: str,
    filters: dict[str, Any] | None = None,
) -> int:
    if filters:
        rows = _apply_filters(rows, filters)
    fields = list(TrainingRow.__dataclass_fields__.keys())
    with open(out_file, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        for r in rows:
            writer.writerow(asdict(r))
    return len(rows)


def main() -> int:
    import argparse

    parser = argparse.ArgumentParser(description="Export TwitterAI training dataset")
    parser.add_argument("--out", required=True, help="Output file path (.jsonl or .csv)")
    parser.add_argument("--limit", type=int, default=5000)
    parser.add_argument("--min-impact", type=int, default=None)
    args = parser.parse_args()

    from db.connection import get_session_factory
    Session = get_session_factory()
    with Session() as session:
        rows = build_rows(session, limit=args.limit)

    filters = {}
    if args.min_impact is not None:
        filters["min_abs_impact_score"] = args.min_impact

    if args.out.endswith(".csv"):
        n = export_csv(rows, args.out, filters=filters or None)
    else:
        n = export_jsonl(rows, args.out, filters=filters or None)

    print(f"Wrote {n} rows to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
