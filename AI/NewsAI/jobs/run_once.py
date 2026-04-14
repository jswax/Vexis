"""
Single run: pull GDELT headlines, fetch overlapping QQQ 1-min bars, upsert DB, label pending rows.
"""

from __future__ import annotations

import os
import sys
from datetime import timedelta

from config import get_settings
from db.connection import get_session_factory
from db.ingest import label_pending_articles, upsert_article, upsert_price_bars
from prices.alpaca_bars import fetch_qqq_1min_bars
from scrapers.gdelt import fetch_gdelt_articles


def main() -> int:
    if os.environ.get("NEWSAI_DRY_RUN", "").lower() in ("1", "true", "yes"):
        try:
            arts = fetch_gdelt_articles()
        except RuntimeError as e:
            print(str(e), file=sys.stderr)
            return 1
        print(f"Dry run: fetched {len(arts)} GDELT articles (no DB).")
        for a in arts[:5]:
            print(f"  - {a.published_at.isoformat()} | {a.headline[:80]}")
        return 0

    settings = get_settings()
    Session = get_session_factory()
    try:
        arts = fetch_gdelt_articles()
    except RuntimeError as e:
        print(str(e), file=sys.stderr)
        return 1
    if not arts:
        print("No articles from GDELT.")
        return 0

    with Session() as session:
        for item in arts:
            upsert_article(session, item)
        session.commit()

        min_pub = min(a.published_at for a in arts)
        max_pub = max(a.published_at for a in arts)
        start = min_pub - timedelta(days=1)
        end = max_pub + timedelta(days=1) + timedelta(minutes=settings.impact_minutes + 5)

        try:
            bars = fetch_qqq_1min_bars(start, end)
        except RuntimeError as e:
            print(str(e), file=sys.stderr)
            print("Committed articles only; add Alpaca keys to fetch prices.", file=sys.stderr)
            return 1

        n = upsert_price_bars(session, bars)
        session.commit()
        labeled = label_pending_articles(session)
        session.commit()
        print(
            f"Ingested {len(arts)} articles, upserted {n} price bars, labeled {labeled} articles."
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
