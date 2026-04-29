"""
twitterapi.io client — advanced search with pagination and free-tier rate limiting.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

import requests
from requests import Response

from config import get_settings

BASE_URL = "https://api.twitterapi.io"
MAX_RETRIES = 3


def _request_delay_s() -> float:
    d = float(get_settings().twitter_api_io_request_delay_s)
    return max(0.0, d)


@dataclass
class IngestQuery:
    search_terms: list[str] = field(default_factory=list)
    twitter_handles: list[str] = field(default_factory=list)
    conversation_ids: list[str] = field(default_factory=list)
    max_items: int = 100
    sort: str = "Latest"          # "Latest" | "Top" | "Latest + Top"
    tweet_language: str | None = None
    minimum_retweets: int | None = None
    minimum_favorites: int | None = None
    minimum_replies: int | None = None
    only_verified_users: bool = False
    start: str | None = None      # since:YYYY-MM-DD
    end: str | None = None        # until:YYYY-MM-DD


@dataclass
class RunResult:
    items: list[dict[str, Any]]
    queries: list[str]


def _ts() -> str:
    return time.strftime("%H:%M:%S")


def _build_query(base_term: str, q: IngestQuery) -> str:
    parts = [base_term.strip()]
    if q.tweet_language:
        parts.append(f"lang:{q.tweet_language}")
    if q.minimum_retweets:
        parts.append(f"min_retweets:{q.minimum_retweets}")
    if q.minimum_favorites:
        parts.append(f"min_faves:{q.minimum_favorites}")
    if q.minimum_replies:
        parts.append(f"min_replies:{q.minimum_replies}")
    if q.only_verified_users:
        parts.append("filter:verified")
    if q.start:
        parts.append(f"since:{q.start}")
    if q.end:
        parts.append(f"until:{q.end}")
    return " ".join(parts)


def _search_page(
    query: str,
    query_type: str,
    cursor: str,
    api_key: str,
    session: requests.Session,
) -> tuple[list[dict[str, Any]], bool, str]:
    params: dict[str, str] = {"query": query, "queryType": query_type}
    if cursor:
        params["cursor"] = cursor
    url = f"{BASE_URL}/twitter/tweet/advanced_search"

    def _do() -> Response:
        return session.get(
            url,
            params=params,
            headers={"X-API-Key": api_key},
            timeout=30,
        )

    last_exc: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = _do()
            # Retry on 429/5xx (transient); raise on other 4xx.
            if resp.status_code == 429 or resp.status_code >= 500:
                raise requests.HTTPError(
                    f"twitterapi.io transient HTTP {resp.status_code}",
                    response=resp,
                )
            resp.raise_for_status()
            break
        except Exception as exc:
            last_exc = exc
            if attempt >= MAX_RETRIES:
                raise
            backoff = min(8.0, 0.75 * (2 ** (attempt - 1)))
            print(
                f"[{_ts()}] twitterapi.io: retry {attempt}/{MAX_RETRIES} in {backoff:.1f}s ({type(exc).__name__})",
                flush=True,
            )
            time.sleep(backoff)
    else:  # pragma: no cover
        raise last_exc  # type: ignore[misc]

    data = resp.json()
    tweets = data.get("tweets") or []
    has_next = bool(data.get("has_next_page"))
    next_cursor = data.get("next_cursor") or ""
    return tweets, has_next, next_cursor


def _collect_search(
    query: str,
    query_type: str,
    limit: int,
    api_key: str,
    session: requests.Session,
) -> list[dict[str, Any]]:
    collected: list[dict[str, Any]] = []
    cursor = ""
    first = True
    delay = _request_delay_s()
    while len(collected) < limit:
        if not first and delay > 0:
            time.sleep(delay)
        first = False
        tweets, has_next, cursor = _search_page(query, query_type, cursor, api_key, session)
        collected.extend(tweets)
        if len(collected) and (len(collected) % 25 == 0 or not has_next or not cursor):
            print(
                f"[{_ts()}] twitterapi.io: {query_type} collected {len(collected)}/{limit}",
                flush=True,
            )
        if not has_next or not cursor:
            break
    return collected[:limit]


def run_ingest(q: IngestQuery, session: requests.Session | None = None) -> RunResult:
    settings = get_settings()
    api_key = settings.twitter_api_io_key
    sess = session or requests.Session()
    all_queries: list[str] = []
    seen_ids: set[str] = set()
    collected: list[dict[str, Any]] = []

    total_sources = len(q.search_terms) + len(q.twitter_handles) + len(q.conversation_ids)
    per_query_limit = max(1, q.max_items // total_sources) if total_sources else q.max_items

    query_types: list[str]
    if q.sort == "Latest + Top":
        query_types = ["Latest", "Top"]
    elif q.sort == "Top":
        query_types = ["Top"]
    else:
        query_types = ["Latest"]

    query_count = 0

    delay = _request_delay_s()

    def run_query(built_q: str, qt: str) -> None:
        nonlocal query_count
        if query_count > 0 and delay > 0:
            time.sleep(delay)
        query_count += 1
        all_queries.append(built_q)
        print(f"[{_ts()}] twitterapi.io: searching ({qt}) {built_q}", flush=True)
        items = _collect_search(built_q, qt, per_query_limit, api_key, sess)
        for item in items:
            if len(collected) >= q.max_items:
                return
            item_id = str(item.get("id") or "")
            if not item_id or item_id in seen_ids:
                continue
            seen_ids.add(item_id)
            collected.append(item)

    for term in q.search_terms:
        if len(collected) >= q.max_items:
            break
        for qt in query_types:
            if len(collected) >= q.max_items:
                break
            run_query(_build_query(term, q), qt)

    for handle in q.twitter_handles:
        if len(collected) >= q.max_items:
            break
        clean = handle.lstrip("@")
        for qt in query_types:
            if len(collected) >= q.max_items:
                break
            run_query(_build_query(f"from:{clean}", q), qt)

    for conv_id in q.conversation_ids:
        if len(collected) >= q.max_items:
            break
        for qt in query_types:
            if len(collected) >= q.max_items:
                break
            run_query(_build_query(f"conversation_id:{conv_id}", q), qt)

    return RunResult(items=collected, queries=all_queries)
