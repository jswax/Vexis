"""
Normalize raw tweet objects (Apify kaitoeasyapi actor output) into typed dicts
ready for DB upsert. Field names follow the kaitoeasyapi / twitterapi.io convention;
fallbacks handle minor naming variations between actor versions.
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


def parse_apify_item_created_at(item: Any) -> datetime | None:
    """Tweet created time from a raw Apify timeline item (same keys as normalize())."""
    t = _rec(item)
    return _date(t.get("createdAt") or t.get("created_at") or t.get("twitterCreatedAt"))


def normalize(
    raw: Any,
    *,
    scraped_at: datetime | None = None,
    source_query: str | None = None,
    source_query_type: str | None = None,
) -> NormalizedBundle | None:
    t = _rec(raw)

    external_id = _str(t.get("id") or t.get("tweetId"))
    if not external_id:
        return None

    text = _str(t.get("text") or t.get("fullText") or t.get("full_text")).strip()
    if not text:
        return None

    created_at_twitter = parse_apify_item_created_at(t)
    if not created_at_twitter:
        return None

    a = _rec(t.get("author") or t.get("user"))
    author_id = _str(a.get("id") or a.get("userId") or a.get("user_id"))
    username = _str(a.get("userName") or a.get("username") or a.get("screen_name")).lstrip("@")
    if not author_id and not username:
        return None

    display_name = _str(a.get("name") or a.get("displayName")) or username or "Unknown"

    entities = _rec(t.get("entities"))
    media = entities.get("media") or []
    if not isinstance(media, list):
        media = []
    has_images = any(_rec(m).get("type") == "photo" for m in media)
    has_video = any(_rec(m).get("type") in ("video", "animated_gif") for m in media)

    tweet_type = _str(t.get("type"))
    is_reply = _bool(t.get("isReply") or t.get("is_reply")) or tweet_type == "reply"
    is_retweet = (
        t.get("retweeted_tweet") is not None
        or t.get("retweetedTweet") is not None
        or tweet_type == "retweet"
    )
    is_quote = (
        t.get("quoted_tweet") is not None
        or t.get("quotedTweet") is not None
        or tweet_type == "quote"
    )

    def _counts(*keys: str) -> int | None:
        for k in keys:
            v = _int(t.get(k))
            if v is not None:
                return v
        return None

    return NormalizedBundle(
        author=NormalizedAuthor(
            external_id=author_id or f"username:{username.lower()}",
            username=username or f"unknown_{external_id}",
            display_name=display_name,
            verified=_bool(
                a.get("isBlueVerified") or a.get("verified") or a.get("is_blue_verified")
            ),
            followers_count=_int(
                a.get("followers") or a.get("followersCount") or a.get("followers_count")
            ),
            following_count=_int(
                a.get("following") or a.get("followingCount") or a.get("friends_count")
            ),
            favourites_count=_int(
                a.get("favouritesCount") or a.get("favourites_count") or a.get("favorites_count")
            ),
            statuses_count=_int(
                a.get("statusesCount") or a.get("statuses_count")
            ),
            raw_json=a,
        ),
        tweet=NormalizedTweet(
            external_id=external_id,
            url=_str(t.get("url") or t.get("tweetUrl")) or f"https://x.com/i/web/status/{external_id}",
            text=text,
            raw_json=raw if isinstance(raw, dict) else {},
            language=_str(t.get("lang") or t.get("language")) or None,
            created_at_twitter=created_at_twitter,
            scraped_at=scraped_at or datetime.utcnow(),
            source_query=source_query,
            source_query_type=source_query_type,
            matched_search_term=None,
            like_count=_counts("likeCount", "like_count", "favoriteCount", "favorite_count"),
            retweet_count=_counts("retweetCount", "retweet_count"),
            reply_count=_counts("replyCount", "reply_count"),
            quote_count=_counts("quoteCount", "quote_count"),
            bookmark_count=_counts("bookmarkCount", "bookmark_count"),
            view_count=_counts("viewCount", "view_count"),
            is_reply=is_reply,
            is_retweet=is_retweet,
            is_quote=is_quote,
            has_images=has_images,
            has_video=has_video,
        ),
    )
