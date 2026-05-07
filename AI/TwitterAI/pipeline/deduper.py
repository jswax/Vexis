"""Text hashing for exact and near-duplicate detection."""

from __future__ import annotations

import hashlib
import re


def _strip_urls(text: str) -> str:
    return re.sub(r"https?://\S+", " ", text, flags=re.IGNORECASE)


def _canonicalize(text: str) -> str:
    t = _strip_urls(text).lower()
    t = re.sub(r"@\w+", "@user", t)
    t = re.sub(r"[^\w\s]", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def exact_text_hash(text: str) -> str:
    return hashlib.sha1(text.strip().encode()).hexdigest()


def near_dup_hash(text: str) -> str:
    return hashlib.sha1(_canonicalize(text).encode()).hexdigest()


def extract_links(text: str) -> list[str]:
    return re.findall(r"https?://\S+", text, flags=re.IGNORECASE)
