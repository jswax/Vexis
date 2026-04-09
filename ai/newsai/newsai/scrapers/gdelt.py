"""
GDELT DOC 2.0 API — free, timestamped headlines (noisy; good for prototyping).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Optional
from urllib.parse import urlencode

import requests

from newsai.config import get_settings

GDELT_DOC_URL = "https://api.gdeltproject.org/api/v2/doc/doc"


@dataclass
class NormalizedArticle:
    headline: str
    body_excerpt: str
    source: str
    published_at: datetime
    url: Optional[str]
    raw: dict[str, Any]


def _parse_time(seen_date: str) -> datetime:
    # GDELT often uses YYYYMMDDHHMMSS
    if len(seen_date) >= 14 and seen_date.isdigit():
        y, m, d = int(seen_date[0:4]), int(seen_date[4:6]), int(seen_date[6:8])
        h, mi, s = int(seen_date[8:10]), int(seen_date[10:12]), int(seen_date[12:14])
        return datetime(y, m, d, h, mi, s, tzinfo=timezone.utc)
    return datetime.now(tz=timezone.utc)


def fetch_gdelt_articles(
    query: Optional[str] = None,
    max_records: Optional[int] = None,
    session: Optional[requests.Session] = None,
) -> list[NormalizedArticle]:
    settings = get_settings()
    q = query if query is not None else settings.gdelt_query
    n = max_records if max_records is not None else settings.gdelt_max_records

    params = {
        "query": q,
        "mode": "ArtList",
        "maxrecords": str(n),
        "format": "json",
        "sort": "datedesc",
    }
    url = f"{GDELT_DOC_URL}?{urlencode(params)}"
    sess = session or requests.Session()
    resp = sess.get(url, timeout=60)
    if resp.status_code == 429:
        raise RuntimeError(
            "GDELT returned HTTP 429 (rate limit). Wait and retry, or lower NEWSAI_GDELT_MAX_RECORDS."
        )
    resp.raise_for_status()
    data = resp.json()
    arts = data.get("articles") or []
    out: list[NormalizedArticle] = []
    for row in arts:
        title = (row.get("title") or "").strip()
        if not title:
            continue
        seen = str(row.get("seendate") or row.get("date") or "")
        pub = _parse_time(seen) if seen else datetime.now(tz=timezone.utc)
        domain = (row.get("domain") or row.get("source") or "gdelt").strip()
        url_s = row.get("url") or row.get("socialimage")
        body = (row.get("snippet") or "")[:2048]
        out.append(
            NormalizedArticle(
                headline=title[:500],
                body_excerpt=body,
                source=domain[:200],
                published_at=pub,
                url=(str(url_s)[:2000] if url_s else None),
                raw=row,
            )
        )
    return out
