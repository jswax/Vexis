"""
Streamlit: recent headlines, labels, simple score histogram.

Run from AI/NewsAI/:
  streamlit run dashboard/app.py
"""

from __future__ import annotations

import os

import streamlit as st
from sqlalchemy import select

from db.connection import get_session_factory
from db.models import Article, LabeledArticle

st.set_page_config(page_title="NewsAI — QQQ Impact", layout="wide")
st.title("QQQ News Impact (MVP)")

if not os.environ.get("DATABASE_URL"):
    st.warning("Set `DATABASE_URL` in the environment (or `.env` next to your working directory).")

Session = get_session_factory()

with Session() as session:
    q = (
        select(
            Article.published_at,
            Article.headline,
            Article.source,
            LabeledArticle.impact_score,
            LabeledArticle.raw_delta_pct,
        )
        .join(LabeledArticle, LabeledArticle.article_id == Article.id, isouter=True)
        .order_by(Article.published_at.desc())
        .limit(200)
    )
    rows = session.execute(q).all()

if not rows:
    st.info("No rows yet. Run `python -m jobs.run_once` from AI/NewsAI/ after DB setup.")
else:
    import pandas as pd

    df = pd.DataFrame(
        rows,
        columns=["published_at", "headline", "source", "impact_score", "raw_delta_pct"],
    )
    st.subheader("Latest articles")
    st.dataframe(df, use_container_width=True, hide_index=True)

    labeled = df.dropna(subset=["impact_score"])
    if not labeled.empty:
        st.subheader("Impact score distribution (labeled)")
        hist = labeled["impact_score"].clip(-10, 10)
        buckets = pd.cut(hist, bins=16)
        st.bar_chart(buckets.value_counts().sort_index())
