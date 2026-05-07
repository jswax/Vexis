# TwitterAI — Architecture & Reference

TwitterAI is an end-to-end ML pipeline for predicting market direction (BULLISH/BEARISH/NEUTRAL) from X/Twitter posts mentioning specific assets. FastAPI backend on port 4001, Next.js frontend at `app/twitter/page.tsx`.

**Goal:** Build a labeled training dataset linking tweets to multi-horizon equity price outcomes, focused on QQQ/Nasdaq-100 universe.

---

## System Architecture

```
Apify scrape → normalize → deduplicate → upsert author/tweet/matches/features
  → Phase 2 async: run inference → upsert tweet_predictions
  → (separately) compute-outcomes: Alpaca bars → impact_score + direction_label
  → (separately) train: LightGBM per-horizon classifiers
```

**Key design principles:**
- QQQ-first: focused on Nasdaq-100
- Per-horizon models: 7 independent LightGBM classifiers (M5, M15, M30, H1, H4, H6, D1)
- Text + tabular fusion: TF-IDF (1/2-grams) + TruncatedSVD(64) + LightGBM
- Two-phase ingest: Phase 1 completes job; Phase 2 runs predictions async in background thread
- One Alpaca API batch call for all tickers + benchmark per outcome computation run

---

## Database Schema (PostgreSQL + SQLAlchemy ORM)

**Enums:** `job_status` (CREATED/RUNNING/SUCCEEDED/FAILED), `asset_type` (STOCK/ETF/CRYPTO/INDEX/FX/COMMODITY/UNKNOWN), `outcome_horizon` (M5/M15/M30/H1/H4/H6/D1), `direction_label` (BULLISH/BEARISH/NEUTRAL)

**`tweet_ingestion_jobs`** — tracks each ingest run; source, provider (apify), status, actor_id, query config, item counts, started_at/finished_at, error_message. Index: (status, created_at)

**`twitter_authors`** — X user profiles; id (UUID), external_id, username, display_name, verified, followers/following/favourites/statuses counts, raw JSON blob. Index: username

**`tweets`** — tweet records; id (UUID), external_id, text, url, created_at_twitter, language, engagement (like/retweet/reply/view/bookmark/quote counts), flags (is_reply/is_retweet/is_quote/has_images/has_video), source_query, source_query_type, matched_search_term, author_id FK. Index: (author_id, created_at_twitter), created_at_twitter

**`tweet_asset_matches`** — ticker extraction results; one row per (tweet, ticker, match_method); asset_type, ticker, confidence, match_method (cashtag/direct_ticker/alias_dictionary/keyword_rule/crypto_alias/db). Unique: (tweet_id, ticker, match_method). Index: tweet_id, ticker

**`market_snapshots`** — price data at tweet time; price, volume, VWAP, RSI, MACD, ATR, realized_volatility (from 60 bars), market_open_flag, session_type, benchmark_ticker, benchmark_price. Unique: (tweet_id, ticker)

**`tweet_outcomes`** — returns + impact per (tweet, ticker, horizon); raw_return, benchmark_return, excess_return, vol_adjusted_return, impact_score int [-10,10], direction_label. Unique: (tweet_id, ticker, horizon). Index: tweet_id, ticker, horizon, direction_label

**`tweet_features`** — signal quality per tweet (1:1); spam_score [0,1], credibility_score [0,1], duplicate_group_id (SHA1 of canonicalized text), model_direction_pred, model_direction_conf, model_version, embedding_model. Unique: tweet_id

**`tweet_predictions`** (migration-created) — per-horizon model output; direction_pred, bullish_prob, bearish_prob, neutral_prob, confidence (max of three), model_version. Unique: (tweet_id, ticker, horizon, model_version). Index: tweet_id, ticker, direction_pred, model_version

**`asset_aliases`** — static + runtime ticker aliases; alias → (asset_type, ticker, match_method, confidence). Unique: (asset_type, alias). Index: ticker, alias

**Migration files:**
- `migrate_drop_index_tickers.sql`: Remove SPX/NDX/IXIC (no Alpaca price feed)
- `migrate_horizons.sql`: Add M30, H6 to outcome_horizon enum
- `migrate_model_preds.sql`: Add model_direction_pred/conf to tweet_features; create tweet_predictions table

---

## All Modules & Files

### Config & Connection
**`config.py`** — Pydantic BaseSettings:
- `port` default 4001
- `database_url` required PostgreSQL
- `twitterai_token` optional; if set, POST endpoints require `x-twitterai-token` header
- `ingest_predictions` default True; False skips model loading at ingest
- `ingest_date_shard_days` default 5; split date range into N-day windows to avoid "newest only" bias
- `alpaca_api_key`, `alpaca_api_secret`
- `impact_score_multiplier` default 2.5
- `impact_vol_floor` default 0.001
- `off_hours_impact_multiplier` default 0.5
- `match_max_tickers_per_tweet` default 12, `match_holdings_min_tickers` 10, `match_holdings_min_cashtags` 8, `match_holdings_keep_tickers` "QQQ,QQQM,SPY"

**`db/connection.py`** — `get_engine()` singleton (cached), `get_session_factory()` sessionmaker with pool_pre_ping=True

### API Server (`api/main.py`)

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | /health | No | {status:"ok"} |
| GET | /api/twitter/logs | No | limit=400 |
| POST | /api/twitter/logs/clear | Token | |
| GET | /api/twitter/status | No | ?job_id → counts + last_ingest_job |
| POST | /api/twitter/ingest | Token | IngestRequest; 202 background or 200 sync |
| POST | /api/twitter/compute-outcomes | Token | OutcomeRequest |
| POST | /api/twitter/recompute-labels | Token | RecomputeRequest |
| GET | /api/twitter/model-status | No | version + per-horizon F1 |
| POST | /api/twitter/train | Token | TrainRequest; global thread lock |
| POST | /api/twitter/backfill-predictions | Token | tweets without preds |
| POST | /api/twitter/predict | Token | single tweet inference |
| GET | /api/twitter/tweets | No | paginated, QQQ-scored; supports test_only |
| GET | /api/twitter/tweets/{id} | No | full detail with all related data |
| POST | /api/twitter/export | Token | ExportRequest → JSONL |

**IngestRequest params:** search_terms[], twitter_handles[], conversation_ids[], max_items, sort, tweet_language, min_retweets, min_favorites, only_verified_users, start, end, date_shard_days, source_label, background

**OutcomeRequest params:** limit (50), qqq_only (True), all_tweets (False), chunk_size (80)

**GET /tweets params:** limit, offset, ticker, qqq, test_only, sort → returns section_totals{uncomputed, no_match, impact_1_5, impact_5_8, impact_8_10, predicted, in_sample}

### Scrapers

**`scrapers/apify_twitter.py`** — Apify actor `kaitoeasyapi/twitter-x-data-tweet-scraper-pay-per-result-cheapest`; MAX_WAIT_SECS=600; IngestQuery dataclass; date sharding splits [start,end] into N-day windows

**`scrapers/normalizer.py`** — NormalizedAuthor, NormalizedTweet, NormalizedBundle dataclasses; normalize(raw_item) → NormalizedBundle

**`scrapers/ingest.py`** — IngestResult dataclass; `run_ingest()` Phase 1 (scrape→normalize→batch upsert→job SUCCEEDED) + Phase 2 async (predictions); `start_background_ingest()` spawns thread; UPSERT_CHUNK=200, PREDICTION_UPSERT_CHUNK=400; dedup via exact_text_hash + near_dup_hash

### Pipeline Modules

**`pipeline/alias_dictionary.py`** — 154 AliasSeed entries; mega-cap tech, financials, healthcare, retail, energy, media, crypto; KNOWN_TICKERS(100+), KNOWN_CRYPTO_TICKERS(20+)

**`pipeline/asset_matching.py`** — `extract_tickers(text, session)` → list[TickerMatch]; 4 methods: cashtags ($TSLA, 0.95), direct known tickers (0.7), alias dictionary seeds (0.5–0.95), DB aliases; deduplicates by (asset_type, ticker) keeping highest confidence

**`pipeline/feature_scoring.py`** — `compute_spam_score()`, `compute_credibility_score()`

**`pipeline/deduper.py`** — `exact_text_hash()`, `near_dup_hash()` (canonicalized), `extract_links()`

**`pipeline/match_filter.py`** — detects ETF holdings laundry lists; hard cap MATCH_MAX_TICKERS_PER_TWEET=12

**`pipeline/qqq_ingest_profile.py`** — DEFAULT_QQQ_SEARCH_TERMS; `should_keep_qqq_tweet()`: require verified OR followers>=5k AND spam_score<0.35; hard blocks: discord/subscribe/meme lexicon

**`pipeline/qqq_signal.py`** — QQQ relevance scoring; 15 text channels; source weights; noise patterns; `score = source_weight * (ticker_linear + text_channel_sum + impact_prior + noise) * quality_mult`

**`pipeline/labeling.py`** — horizon thresholds: M5/M15=0.10%, M30=0.15%, H1/H4/H6=0.20%, D1=0.30%; direction = BULLISH if excess_return>=threshold, BEARISH if <=-threshold, else NEUTRAL; benchmark = SPY

### Market Data

**`prices/alpaca_bars.py`** — Alpaca Data v2; `get_bars_batch()` one API call for all tickers+benchmark; t0=FLOOR (last bar at/before tweet time), horizons=CEILING (first bar at/after); HTTP retry 3×; timeout 25s

### Outcome Jobs

**`jobs/outcomes.py`** — `compute_for_unprocessed()` outer loop (run_all chunks up to 10,000); `_compute_outcomes_one_chunk()` core logic

**Critical — top-10 holdings mapped to QQQ outcome ticker:**
- `_TOP10_HOLDINGS = frozenset(QQQ_CORE_TICKERS)` — AAPL, NVDA, MSFT, AMZN, GOOGL, GOOG, AVGO, TSLA, META, WMT
- Outcomes for top-10 matches stored as `ticker="QQQ"` using QQQ price bars — every training row predicts QQQ direction
- `_QQQ_ALLOWED = _TOP10_HOLDINGS | {"QQQ","QQQM","SPY"}` — only these processed when qqq_only=True
- BENCH_TICKER = "SPY" — labels based on excess return vs SPY, not raw return

**Completion check** — uses SQLAlchemy `case()` to map top-10 holdings → "QQQ" before joining outcome_count subquery. Without this mapping the same tweets loop forever (top-10 match rows never find their QQQ outcome rows).

**`jobs/recompute.py`** — `recompute_all()`: recalculate impact_score + direction_label on existing outcomes

**`jobs/scheduler.py`** — APScheduler periodic ingest

### ML Pipeline

**`train/features.py`** — single source of truth for feature engineering:
1. Sentiment patterns (16 bullish / 14 bearish keywords + emoji)
2. 15 text channels (same as qqq_signal.py)
3. Tabular: engagement (log), author stats, asset OHE (top 12), spam/credibility, time features, source_weight
4. TF-IDF (max_features=4000, min_df=3) + TruncatedSVD(64)

**`train/train.py`** — per-horizon LightGBM; loads outcomes where ticker="QQQ"; StratifiedKFold CV; 80/20 temporal split

LGBM params: n_estimators=600, lr=0.05, num_leaves=31, max_depth=6, min_child_samples=5, class_weight="balanced"

Bundle saved to `models/twitterai_direction_v1.joblib`; `models/latest.txt` points to active file; triggers `reload_predictor()` after training

**`inference/model.py`** — thread-safe singleton Predictor; `predict_all_horizons()` → list[HorizonPrediction]; `reload_predictor()` hot-reload after training

**`inference/heuristic.py`** — text-based fallback scorer before trained model exists

### Logging

**`log_buffer.py`** — in-memory deque maxlen=2000; thread-safe; streamed to frontend via GET /logs

---

## Frontend (`app/twitter/page.tsx`)

6 tabs: **Feed** (tweet cards, QQQ score, direction badges, D1 prediction, expandable outcomes+predictions) · **Status** · **Ingest** · **Compute** · **Export** · **Model** (per-horizon F1 grid, train, backfill)

Next.js API proxies at `app/api/twitterai/*` → TWITTER_AI_URL env var (default localhost:4001)
- ingest/recompute-labels/train: maxDuration=900s · compute-outcomes: 300s

---

## Environment Variables

| Var | Default | Notes |
|-----|---------|-------|
| DATABASE_URL | required | PostgreSQL |
| ALPACA_API_KEY / SECRET | required | Market data |
| TWITTERAI_TOKEN | — | If set, POST endpoints require header |
| APIFY_TOKEN | — | Tweet scraping |
| TWITTERAI_INGEST_PREDICTIONS | True | False = skip model load at ingest |
| TWITTERAI_INGEST_DATE_SHARD_DAYS | 5 | 0 = single run |
| IMPACT_SCORE_MULTIPLIER | 2.5 | Scale vol_adj_return → impact_score |
| IMPACT_VOL_FLOOR | 0.001 | Min vol denominator |
| OFF_HOURS_IMPACT_MULTIPLIER | 0.5 | Dampen off-market scores |
| MATCH_MAX_TICKERS_PER_TWEET | 12 | Hard cap on extracted tickers |

---

## Critical Thresholds & Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| HORIZON_THRESHOLD M5/M15 | 0.10% | Excess return for BULLISH/BEARISH |
| HORIZON_THRESHOLD M30 | 0.15% | |
| HORIZON_THRESHOLD H1/H4/H6 | 0.20% | |
| HORIZON_THRESHOLD D1 | 0.30% | |
| TFIDF_MAX_FEATURES | 4000 | TF-IDF vocab size |
| SVD_N_COMPONENTS | 64 | LSA dimensionality |
| LGBM_N_ESTIMATORS | 600 | Boosting rounds per horizon |
| LGBM_MAX_DEPTH | 6 | Tree depth |
| LGBM_MIN_CHILD_SAMPLES | 5 | Min samples/leaf (handles thin BEARISH) |
| SNAPSHOT_BATCH | 500 | MarketSnapshot upsert batch size |
| OUTCOME_BATCH | 2500 | TweetOutcome upsert batch size |

---

## Model v1 State (trained 2026-04-17)

- 4,360 train / 1,090 test samples; 174 features; use_ticker_ohe=True
- Mean CV macro-F1: 0.596; Mean test macro-F1: 0.573
- Strong: M5 (F1=0.93), D1 (F1=0.94) · Weak: M15 (0.44), H1 (0.31), H6 (0.35) — BEARISH collapse from bull-market collection period
- Needs retrain after top-10→QQQ mapping change (2026-05-06)

---

## Known Issues & Next Steps

1. **Model needs retrain** — top-10→QQQ outcome mapping changed 2026-05-06; run compute-outcomes → retrain → backfill-predictions
2. **BEARISH underrepresentation** — 5.3% of training data; collected during April 2026 bull run; updated thresholds should produce more BEARISH labels
3. **Ticker OHE dominance** — may be learning April bull-run base rates by ticker; try use_ticker_ohe=False
4. **Infinite loop gotcha** — if top-10→QQQ mapping is changed, the completion check CASE expression in `_ordered_tweet_ids_for_compute` must be kept in sync or compute-outcomes loops forever
5. **Alpaca free tier** — 15-min delay; upgrade for real-time data
6. **Single-process scaling** — thread locks mean one training/ingest at a time
