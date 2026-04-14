"""
Normalize raw twitterapi.io tweet objects into typed dicts ready for DB upsert.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any


@dataclass
class NormalizedAuthor:
    external_id: str
    username: str
    display_name: str
    verified: bool
    followers_count: int | None
    following_count: int | None
    favourites_count: int | None
    statuses_count: int | None
    raw_json: dict[str, Any]


@dataclass
class NormalizedTweet:
    external_id: str
    url: str
    text: str
    raw_json: dict[str, Any]
    language: str | None
    created_at_twitter: datetime
    scraped_at: datetime
    source_query: str | None
    source_query_type: str | None
    matched_search_term: str | None
    like_count: int | None
    retweet_count: int | None
    reply_count: int | None
    quote_count: int | None
    bookmark_count: int | None
    view_count: int | None
    is_reply: bool
    is_retweet: bool
    is_quote: bool
    has_images: bool
    has_video: bool


@dataclass
class NormalizedBundle:
    author: NormalizedAuthor
    tweet: NormalizedTweet


def _str(v: Any, fallback: str = "") -> str:
    return v if isinstance(v, str) else fallback


def _int(v: Any) -> int | None:
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return int(v)
    if isinstance(v, str) and v.strip():
        try:
            return int(float(v))
        except ValueError:
            pass
    return None


def _bool(v: Any) -> bool:
    return v is True


def _date(v: Any) -> datetime | None:
    if not isinstance(v, str) or not v.strip():
        return None
    # ISO 8601
    try:
        return datetime.fromisoformat(v.replace("Z", "+00:00"))
    except ValueError:
        pass
    # Twitter legacy format: "Tue Apr 14 17:13:21 +0000 2026"
    try:
        from email.utils import parsedate_to_datetime
        return parsedate_to_datetime(v)
    except Exception:
        return None


def _rec(v: Any) -> dict[str, Any]:
    return v if isinstance(v, dict) else {}


def normalize(
    raw: Any,
    *,
    scraped_at: datetime | None = None,
    source_query: str | None = None,
    source_query_type: str | None = None,
) -> NormalizedBundle | None:
    t = _rec(raw)

    external_id = _str(t.get("id"))
    if not external_id:
        return None

    text = _str(t.get("text")).strip()
    if not text:
        return None

    created_at_twitter = _date(t.get("createdAt"))
    if not created_at_twitter:
        return None

    a = _rec(t.get("author"))
    author_id = _str(a.get("id"))
    username = _str(a.get("userName")).lstrip("@")
    if not author_id and not username:
        return None

    display_name = _str(a.get("name")) or username or "Unknown"

    entities = _rec(t.get("entities"))
    media = entities.get("media") or []
    if not isinstance(media, list):
        media = []
    has_images = any(_rec(m).get("type") == "photo" for m in media)
    has_video = any(_rec(m).get("type") in ("video", "animated_gif") for m in media)

    tweet_type = _str(t.get("type"))
    is_reply = _bool(t.get("isReply")) or tweet_type == "reply"
    is_retweet = t.get("retweeted_tweet") is not None or tweet_type == "retweet"
    is_quote = t.get("quoted_tweet") is not None or tweet_type == "quote"

    return NormalizedBundle(
        author=NormalizedAuthor(
            external_id=author_id or f"username:{username.lower()}",
            username=username or f"unknown_{external_id}",
            display_name=display_name,
            verified=_bool(a.get("isBlueVerified")),
            followers_count=_int(a.get("followers")),
            following_count=_int(a.get("following")),
            favourites_count=_int(a.get("favouritesCount")),
            statuses_count=_int(a.get("statusesCount")),
            raw_json=a,
        ),
        tweet=NormalizedTweet(
            external_id=external_id,
            url=_str(t.get("url")) or f"https://x.com/i/web/status/{external_id}",
            text=text,
            raw_json=raw if isinstance(raw, dict) else {},
            language=_str(t.get("lang")) or None,
            created_at_twitter=created_at_twitter,
            scraped_at=scraped_at or datetime.utcnow(),
            source_query=source_query,
            source_query_type=source_query_type,
            matched_search_term=None,
            like_count=_int(t.get("likeCount")),
            retweet_count=_int(t.get("retweetCount")),
            reply_count=_int(t.get("replyCount")),
            quote_count=_int(t.get("quoteCount")),
            bookmark_count=_int(t.get("bookmarkCount")),
            view_count=_int(t.get("viewCount")),
            is_reply=is_reply,
            is_retweet=is_retweet,
            is_quote=is_quote,
            has_images=has_images,
            has_video=has_video,
        ),
    )
