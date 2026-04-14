"""
APScheduler entrypoint — poll tweet ingestion + outcome computation on an interval.
"""

from __future__ import annotations

import logging

from apscheduler.schedulers.blocking import BlockingScheduler

from jobs.run_once import main as run_once_main

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("twitterai.scheduler")


def tick(search_terms: list[str], max_items: int = 100) -> None:
    code = run_once_main(search_terms=search_terms, max_items=max_items)
    if code != 0:
        log.warning("run_once exited with code %s", code)


def main(search_terms: list[str], interval_minutes: int = 15) -> None:
    sched = BlockingScheduler()
    sched.add_job(
        tick,
        "interval",
        minutes=interval_minutes,
        id="twitterai_ingest",
        max_instances=1,
        kwargs={"search_terms": search_terms},
    )
    log.info("Scheduler started (%dm interval). Ctrl+C to stop.", interval_minutes)
    sched.start()


if __name__ == "__main__":
    import sys
    terms = sys.argv[1:] or ["$TSLA", "$NVDA", "$AAPL"]
    main(terms)
