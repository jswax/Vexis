"""
Apify actor client — kaitoeasyapi/twitter-x-data-tweet-scraper-pay-per-result-cheapest.
Replaces twitterapi.io as the tweet ingestion backend.

Date sharding (default): Twitter/Apify “Latest” returns the *newest* hits first, so one call
with maxItems=200 and a 30-day start= filter still yields ~200 tweets from “right now”.
We split [start, end] into N-day windows (config TWITTERAI_INGEST_DATE_SHARD_DAYS) and run the
actor once per window (plus sort passes), merging and deduping, so results spread across the range.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field, replace
from datetime import date, datetime, timedelta, timezone
from typing import Any

from config import get_settings

ACTOR_ID = "kaitoeasyapi/twitter-x-data-tweet-scraper-pay-per-result-cheapest"
MAX_WAIT_SECS = 600  # 10 min hard cap per actor run


@dataclass
class IngestQuery:
    search_terms: list[str] = field(default_factory=list)
    twitter_handles: list[str] = field(default_factory=list)
    conversation_ids: list[str] = field(default_factory=list)
    max_items: int = 100
    sort: str = "Latest"  # "Latest" | "Top" | "Latest + Top"
    tweet_language: str | None = None
    minimum_retweets: int | None = None
    minimum_favorites: int | None = None
    minimum_replies: int | None = None
    only_verified_users: bool = False
    start: str | None = None  # YYYY-MM-DD (inclusive floor for search)
    end: str | None = None  # YYYY-MM-DD (inclusive)
    # None → use Settings.ingest_date_shard_days; 0 → one Apify run (no date windows)
    date_shard_days: int | None = None


@dataclass
class RunResult:
    items: list[dict[str, Any]]
    queries: list[str]


def _ts() -> str:
    return time.strftime("%H:%M:%S")


def _utc_today_str() -> str:
    return datetime.now(tz=timezone.utc).date().isoformat()


def _parse_iso_date(s: str) -> date:
    return datetime.strptime(s.strip(), "%Y-%m-%d").date()


def _inclusive_date_shards(start_s: str, end_s: str, shard_days: int) -> list[tuple[str, str]]:
    """
    Partition [start_s, end_s] into non-overlapping inclusive windows of at most shard_days days.
    """
    if shard_days < 1:
        return [(start_s, end_s)]
    a = _parse_iso_date(start_s)
    b = _parse_iso_date(end_s)
    if a > b:
        a, b = b, a
    out: list[tuple[str, str]] = []
    cur = a
    while cur <= b:
        chunk_end = min(cur + timedelta(days=shard_days - 1), b)
        out.append((cur.isoformat(), chunk_end.isoformat()))
        cur = chunk_end + timedelta(days=1)
    return out


def _build_query_string(base: str) -> str:
    # Filters (language, dates, engagement thresholds) are passed as native
    # actor params — do NOT duplicate them as Twitter operators in the search
    # string, or the actor applies them twice and returns fewer results.
    return base.strip()


def _build_all_queries(q: IngestQuery) -> list[str]:
    queries: list[str] = []
    for term in q.search_terms:
        queries.append(_build_query_string(term))
    for handle in q.twitter_handles:
        queries.append(_build_query_string(f"from:{handle.lstrip('@')}"))
    for conv_id in q.conversation_ids:
        queries.append(_build_query_string(f"conversation_id:{conv_id}"))
    return queries


def _sort_modes_for_query(q: IngestQuery) -> list[str]:
    if q.sort == "Latest + Top":
        return ["Latest", "Top"]
    if q.sort == "Top":
        return ["Top"]
    return ["Latest"]


def _run_actor(
    client: Any,
    queries: list[str],
    sort: str,
    max_items: int,
    q: IngestQuery,
) -> list[dict[str, Any]]:
    run_input: dict[str, Any] = {
        "searchTerms": queries,
        "maxItems": max_items,
        "sort": sort,
    }
    if q.tweet_language:
        run_input["tweetLanguage"] = q.tweet_language
    if q.minimum_retweets is not None:
        run_input["minimumRetweets"] = q.minimum_retweets
    if q.minimum_favorites is not None:
        run_input["minimumFavorites"] = q.minimum_favorites
    if q.minimum_replies is not None:
        run_input["minimumReplies"] = q.minimum_replies
    if q.only_verified_users:
        run_input["onlyVerifiedUsers"] = True
    if q.start:
        run_input["start"] = q.start
    if q.end:
        run_input["end"] = q.end

    print(
        f"[{_ts()}] Apify: actor run ({sort}) terms={len(queries)} maxItems={max_items} "
        f"start={q.start or '—'} end={q.end or '—'}",
        flush=True,
    )

    run = client.actor(ACTOR_ID).call(run_input=run_input, wait_secs=MAX_WAIT_SECS)
    if run is None:
        print(f"[{_ts()}] Apify: actor run returned None", flush=True)
        return []

    dataset_id = run.get("defaultDatasetId")
    if not dataset_id:
        print(f"[{_ts()}] Apify: no defaultDatasetId in run result", flush=True)
        return []

    items = list(client.dataset(dataset_id).iterate_items())
    print(f"[{_ts()}] Apify: retrieved {len(items)} items from dataset", flush=True)
    return items


def _gather_unique_items_for_query(client: Any, q: IngestQuery) -> tuple[list[dict[str, Any]], set[str]]:
    """
    Run sort mode(s) until we have up to q.max_items unique tweet ids for this query’s dates/filters.
    """
    queries = _build_all_queries(q)
    if not queries:
        return [], set()

    item_cap = q.max_items
    sort_modes = _sort_modes_for_query(q)
    seen_ids: set[str] = set()
    all_items: list[dict[str, Any]] = []

    for sort_mode in sort_modes:
        if len(all_items) >= item_cap:
            break
        remaining = item_cap - len(all_items)
        raw = _run_actor(client, queries, sort_mode, remaining, q)
        for item in raw:
            if len(all_items) >= item_cap:
                break
            item_id = str(item.get("id") or "")
            if not item_id or item_id in seen_ids:
                continue
            seen_ids.add(item_id)
            all_items.append(item)

    return all_items, seen_ids


def run_ingest(q: IngestQuery) -> RunResult:
    try:
        from apify_client import ApifyClient
    except ImportError:
        raise RuntimeError(
            "apify-client is required. Run: pip install apify-client"
        )

    token = get_settings().apify_token
    if not token:
        raise RuntimeError("APIFY_TOKEN is not set")

    base_queries = _build_all_queries(q)
    if not base_queries:
        return RunResult(items=[], queries=[])

    settings = get_settings()
    if q.date_shard_days is not None:
        shard_days = max(0, min(60, int(q.date_shard_days)))
    else:
        shard_days = int(getattr(settings, "ingest_date_shard_days", 0) or 0)

    client = ApifyClient(token)

    if shard_days <= 0:
        items, _ = _gather_unique_items_for_query(client, q)
        return RunResult(items=items, queries=base_queries)

    # Same default window as API: last 30 days through today if start omitted.
    end_s = q.end or _utc_today_str()
    if q.start:
        start_s = q.start
    else:
        start_s = (datetime.now(tz=timezone.utc) - timedelta(days=30)).date().isoformat()

    shards = _inclusive_date_shards(start_s, end_s, shard_days)
    print(
        f"[{_ts()}] Apify: date-sharded ingest ({len(shards)} windows, {shard_days}d each) "
        f"{start_s} → {end_s}, total budget max_items={q.max_items}",
        flush=True,
    )

    all_items: list[dict[str, Any]] = []
    seen_ids: set[str] = set()

    for i, (s, e) in enumerate(shards):
        if len(all_items) >= q.max_items:
            break
        shards_left = len(shards) - i
        remaining_budget = q.max_items - len(all_items)
        per = max(1, (remaining_budget + shards_left - 1) // shards_left)
        per = min(per, remaining_budget)

        q_shard = replace(q, start=s, end=e, max_items=per)
        print(
            f"[{_ts()}] Apify: shard {i + 1}/{len(shards)} {s} … {e} (cap {per})",
            flush=True,
        )
        chunk, _ = _gather_unique_items_for_query(client, q_shard)
        for item in chunk:
            if len(all_items) >= q.max_items:
                break
            item_id = str(item.get("id") or "")
            if not item_id or item_id in seen_ids:
                continue
            seen_ids.add(item_id)
            all_items.append(item)

    return RunResult(items=all_items, queries=base_queries)
