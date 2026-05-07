"""
Spam and credibility heuristics computed at ingest time.
"""

from __future__ import annotations

import re
from typing import TypedDict

from pipeline.deduper import extract_links, near_dup_hash


class FeatureScores(TypedDict):
    spam_score: float
    credibility_score: float
    duplicate_group_id: str


def compute_spam_score(
    *,
    text: str,
    is_retweet: bool = False,
    has_images: bool = False,
    has_video: bool = False,
) -> float:
    score = 0.0

    links = extract_links(text)
    if len(links) >= 4:
        score += 0.5
    elif len(links) == 3:
        score += 0.35
    elif len(links) == 2:
        score += 0.2
    elif len(links) == 1:
        score += 0.05

    hashtag_count = len(re.findall(r"#\w+", text))
    if hashtag_count >= 6:
        score += 0.35
    elif hashtag_count >= 4:
        score += 0.2
    elif hashtag_count >= 2:
        score += 0.05

    stripped = re.sub(r"https?://\S+", "", text)
    stripped = re.sub(r"#\w+", "", stripped).strip()
    if not is_retweet and len(stripped) < 20:
        score += 0.2

    if re.search(r"([!?.])\\1{3,}", text):
        score += 0.15

    letters = re.sub(r"[^a-zA-Z]", "", text)
    if len(letters) > 30:
        caps = len(re.sub(r"[^A-Z]", "", text))
        if caps / len(letters) > 0.7:
            score += 0.1

    return min(1.0, score)


def compute_credibility_score(
    *,
    verified: bool = False,
    followers_count: int | None = None,
    following_count: int | None = None,
    statuses_count: int | None = None,
) -> float:
    score = 0.2  # baseline

    if verified:
        score += 0.35

    followers = followers_count or 0
    if followers >= 1_000_000:
        score += 0.35
    elif followers >= 100_000:
        score += 0.25
    elif followers >= 10_000:
        score += 0.15
    elif followers >= 1_000:
        score += 0.07
    elif followers >= 500:
        score += 0.03

    following = following_count or 0
    if followers > 0 and following > 0:
        ratio = followers / following
        if ratio >= 10:
            score += 0.1
        elif ratio >= 3:
            score += 0.05

    statuses = statuses_count or 0
    if statuses >= 10_000:
        score += 0.05
    elif statuses >= 1_000:
        score += 0.03

    return min(1.0, score)


def compute_feature_scores(
    *,
    text: str,
    like_count: int | None = None,
    retweet_count: int | None = None,
    reply_count: int | None = None,
    is_retweet: bool = False,
    is_reply: bool = False,
    has_images: bool = False,
    has_video: bool = False,
    verified: bool = False,
    followers_count: int | None = None,
    following_count: int | None = None,
    statuses_count: int | None = None,
) -> FeatureScores:
    return FeatureScores(
        spam_score=compute_spam_score(
            text=text,
            is_retweet=is_retweet,
            has_images=has_images,
            has_video=has_video,
        ),
        credibility_score=compute_credibility_score(
            verified=verified,
            followers_count=followers_count,
            following_count=following_count,
            statuses_count=statuses_count,
        ),
        duplicate_group_id=near_dup_hash(text),
    )
