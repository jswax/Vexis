"""
Export labeled headlines for FinBERT regression fine-tuning (MVP Phase 3).

Recommended next step (with GPU):
  pip install torch transformers accelerate datasets
  Use the JSONL from `--export` with HuggingFace `Trainer` + `ProsusAI/finbert`,
  `num_labels=1`, `problem_type="regression"`, MSE loss, lr=2e-5, 3–5 epochs.

This module keeps the repo lightweight; training is intentionally out-of-band.
"""

from __future__ import annotations

import argparse
import json
import sys


def load_labeled_pairs():
    from sqlalchemy import select

    from db.connection import get_session_factory
    from db.models import Article, LabeledArticle

    Session = get_session_factory()
    with Session() as session:
        q = (
            select(Article.headline, LabeledArticle.impact_score, Article.published_at)
            .join(LabeledArticle, LabeledArticle.article_id == Article.id)
            .where(LabeledArticle.impact_score.is_not(None))
            .order_by(Article.published_at.asc())
        )
        return list(session.execute(q))


def main() -> int:
    parser = argparse.ArgumentParser(description="Export labeled QQQ news for FinBERT training")
    parser.add_argument("--export", metavar="PATH", help="Write JSONL (one object per line)")
    parser.add_argument("--split-date", help="ISO date (YYYY-MM-DD) for chronological train/test split")
    args = parser.parse_args()

    rows = load_labeled_pairs()
    if not rows:
        print("No labeled articles in the database.", file=sys.stderr)
        return 1

    if not args.export:
        print(f"Found {len(rows)} labeled rows. Pass --export PATH to write JSONL.", file=sys.stderr)
        return 0

    split_ts = None
    if args.split_date:
        from datetime import date, datetime, timezone

        d = date.fromisoformat(args.split_date)
        split_ts = datetime(d.year, d.month, d.day, tzinfo=timezone.utc)

    with open(args.export, "w", encoding="utf-8") as f:
        for headline, score, pub in rows:
            rec = {
                "text": headline,
                "label": float(score),
                "published_at": pub.isoformat() if pub else None,
            }
            if split_ts is not None and pub is not None:
                rec["split"] = "train" if pub < split_ts else "test"
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")

    print(f"Wrote {len(rows)} examples to {args.export}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
