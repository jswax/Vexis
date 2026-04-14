"""
Benzinga Pro / news API (paid key). Wire your websocket or REST endpoints here.

This stub exists so the scraper layer matches the MVP doc; implementation is account-specific.
"""

from __future__ import annotations

from scrapers.gdelt import NormalizedArticle


def fetch_benzinga_headlines() -> list[NormalizedArticle]:
    raise NotImplementedError(
        "Add Benzinga REST or websocket ingestion using BENZINGA_API_KEY from settings."
    )
