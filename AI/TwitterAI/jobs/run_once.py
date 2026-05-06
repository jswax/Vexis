"""
Single run: ingest tweets, compute outcomes, recompute labels.
"""

from __future__ import annotations

import time
import sys

from db.connection import get_session_factory
from jobs.outcomes import compute_for_unprocessed
from jobs.recompute import recompute_all
from scrapers.ingest import run as run_ingest
from scrapers.apify_twitter import IngestQuery


def _ts() -> str:
    # Simple local timestamp for console progress.
    return time.strftime("%H:%M:%S")


def main(
    search_terms: list[str] | None = None,
    max_items: int = 100,
    limit: int = 50,
) -> int:
    terms = search_terms or []
    t0 = time.perf_counter()

    if not terms:
        print(f"[{_ts()}] ingest: no search terms provided — skipping", file=sys.stderr, flush=True)
    else:
        print(f"[{_ts()}] ingest: starting (max_items={max_items}, terms={terms})", flush=True)
        q = IngestQuery(search_terms=terms, max_items=max_items)
        result = run_ingest(q, source="run_once")
        print(
            f"[{_ts()}] ingest: done — {result.tweets_upserted} tweets, "
            f"{result.asset_matches_created} asset matches, "
            f"{result.features_upserted} features",
            flush=True,
        )
        if getattr(result, "scrape_export_path", None):
            print(
                f"[{_ts()}] ingest: scrape manifest (text + posted_at) → {result.scrape_export_path}",
                flush=True,
            )

    Session = get_session_factory()
    with Session() as session:
        print(f"[{_ts()}] outcomes: starting (limit={limit})", flush=True)
        outcome_result = compute_for_unprocessed(session, limit=limit)
        session.commit()
        print(
            f"[{_ts()}] outcomes: done — {outcome_result.created_outcomes} created, "
            f"{outcome_result.errors} errors",
            flush=True,
        )

        print(f"[{_ts()}] recompute: starting", flush=True)
        recompute_result = recompute_all(session)
        session.commit()
        print(f"[{_ts()}] recompute: done — {recompute_result.updated} labels", flush=True)

    elapsed = time.perf_counter() - t0
    print(f"[{_ts()}] run_once: complete in {elapsed:.1f}s", flush=True)
    return 0


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Single ingest + label run")
    parser.add_argument("terms", nargs="*", help="Search terms e.g. TSLA NVDA AAPL")
    parser.add_argument("--max-items", type=int, default=100)
    parser.add_argument("--limit", type=int, default=50)
    args = parser.parse_args()

    raise SystemExit(main(search_terms=args.terms or None, max_items=args.max_items, limit=args.limit))
