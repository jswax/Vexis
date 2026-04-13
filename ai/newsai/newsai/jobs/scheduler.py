"""
APScheduler entrypoint: poll news + prices on an interval.
"""

from __future__ import annotations

import logging

from apscheduler.schedulers.blocking import BlockingScheduler

from newsai.jobs.run_once import main as run_once_main

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("newsai.scheduler")


def tick() -> None:
    code = run_once_main()
    if code != 0:
        log.warning("run_once exited with code %s", code)


def main() -> None:
    sched = BlockingScheduler()
    sched.add_job(tick, "interval", minutes=15, id="newsai_ingest", max_instances=1)
    log.info("Scheduler started (15m interval). Ctrl+C to stop.")
    sched.start()


if __name__ == "__main__":
    main()
