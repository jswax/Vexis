"""
Generic RSS ingestion (optional second source; no API key).
"""

from __future__ import annotations

from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any

import feedparser

from scrapers.gdelt import NormalizedArticle


def _entry_published(entry: Any) -> datetime:
    for key in ("published_parsed", "updated_parsed"):
        t = getattr(entry, key, None)
        if t:
            return datetime(*t[:6], tzinfo=timezone.utc)
    raw = getattr(entry, "published", None) or getattr(entry, "updated", None)
    if raw:
        try:
            dt = parsedate_to_datetime(raw)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(timezone.utc)
        except (TypeError, ValueError):
            pass
    return datetime.now(tz=timezone.utc)


def fetch_rss_articles(feed_url: str) -> list[NormalizedArticle]:
    parsed = feedparser.parse(feed_url)
    out: list[NormalizedArticle] = []
    for e in parsed.entries:
        title = (getattr(e, "title", None) or "").strip()
        if not title:
            continue
        link = getattr(e, "link", None)
        summary = (getattr(e, "summary", None) or "")[:2048]
        src = getattr(parsed.feed, "title", None) or feed_url
        out.append(
            NormalizedArticle(
                headline=title[:500],
                body_excerpt=summary,
                source=str(src)[:200],
                published_at=_entry_published(e),
                url=str(link)[:2000] if link else None,
                raw=dict(e),
            )
        )
    return out
