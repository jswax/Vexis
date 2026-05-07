from __future__ import annotations

import json
import re
import sys
from collections import Counter
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path


def _iso_dt(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def _norm_text(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip().lower())


@dataclass
class Summary:
    path: str
    n: int
    min_posted_at: str | None
    max_posted_at: str | None
    dup_text: int
    non_ascii: int
    cashtag_any: int
    qqq_mentions: int
    ndx_mentions: int
    qqq_only_text: int
    top_authors: list[tuple[str, int]]
    promo_kw: list[tuple[str, int]]


def summarize(path: str) -> Summary:
    n = 0
    mn: datetime | None = None
    mx: datetime | None = None
    seen: set[str] = set()

    dup_text = 0
    non_ascii = 0
    cashtag_any = 0
    qqq_mentions = 0
    ndx_mentions = 0
    qqq_only_text = 0

    authors: Counter[str] = Counter()
    promo: Counter[str] = Counter()
    promo_words = [
        "trial",
        "0.99",
        "recommend",
        "earned",
        "follow",
        "telegram",
        "whatsapp",
        "promo",
        "coupon",
        "discount",
    ]

    with Path(path).open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                o = json.loads(line)
            except Exception:
                continue

            n += 1
            dt = _iso_dt(str(o.get("posted_at") or "1970-01-01T00:00:00Z"))
            mn = dt if mn is None or dt < mn else mn
            mx = dt if mx is None or dt > mx else mx

            au = str(o.get("author_username") or "").lower()
            if au:
                authors[au] += 1

            txt = str(o.get("text") or "")
            low = txt.lower()
            tnorm = _norm_text(txt)
            if tnorm in seen:
                dup_text += 1
            else:
                seen.add(tnorm)

            if any(ord(c) > 127 for c in txt):
                non_ascii += 1
            if "$" in txt:
                cashtag_any += 1

            if ("qqq" in low) or ("invesco qqq" in low) or ("nasdaq 100" in low) or ("nasdaq100" in low):
                qqq_mentions += 1
            if ("ndx" in low) or ("nasdaq 100" in low) or ("nasdaq100" in low):
                ndx_mentions += 1

            if tnorm in ("qqq", "$qqq"):
                qqq_only_text += 1

            for w in promo_words:
                if w in low:
                    promo[w] += 1

    return Summary(
        path=path,
        n=n,
        min_posted_at=mn.isoformat() if mn else None,
        max_posted_at=mx.isoformat() if mx else None,
        dup_text=dup_text,
        non_ascii=non_ascii,
        cashtag_any=cashtag_any,
        qqq_mentions=qqq_mentions,
        ndx_mentions=ndx_mentions,
        qqq_only_text=qqq_only_text,
        top_authors=authors.most_common(8),
        promo_kw=[x for x in promo.most_common(10) if x[1] > 0],
    )


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("Usage: python -m scripts.summarize_scrape <scrape1.jsonl> [scrape2.jsonl ...]")
        return 2

    for p in argv[1:]:
        s = summarize(p)
        print(f"\n== {s.path}")
        print(f"n: {s.n}")
        print(f"posted_at: {s.min_posted_at} .. {s.max_posted_at}")
        print(f"dup_text: {s.dup_text}")
        print(f"non_ascii: {s.non_ascii}")
        print(f"cashtag_any: {s.cashtag_any}")
        print(f"qqq_mentions: {s.qqq_mentions}")
        print(f"ndx_mentions: {s.ndx_mentions}")
        print(f"qqq_only_text: {s.qqq_only_text}")
        print(f"top_authors: {s.top_authors}")
        print(f"promo_kw: {s.promo_kw}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))

