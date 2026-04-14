-- TwitterAI PostgreSQL schema
-- Run from AI/TwitterAI/: psql $DATABASE_URL -f db/schema.sql

CREATE TYPE job_status AS ENUM ('CREATED', 'RUNNING', 'SUCCEEDED', 'FAILED');
CREATE TYPE asset_type AS ENUM ('STOCK', 'ETF', 'CRYPTO', 'INDEX', 'FX', 'COMMODITY', 'UNKNOWN');
CREATE TYPE outcome_horizon AS ENUM ('M5', 'M15', 'H1', 'H4', 'D1');
CREATE TYPE direction_label AS ENUM ('BULLISH', 'BEARISH', 'NEUTRAL');

CREATE TABLE tweet_ingestion_jobs (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    provider TEXT NOT NULL,
    status job_status NOT NULL,
    actor_id TEXT NOT NULL,
    query_config_json JSONB,
    items_requested INTEGER,
    items_received INTEGER,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_jobs_status_created ON tweet_ingestion_jobs (status, created_at);

CREATE TABLE twitter_authors (
    id TEXT PRIMARY KEY,
    external_id TEXT UNIQUE NOT NULL,
    username TEXT NOT NULL,
    display_name TEXT NOT NULL,
    verified BOOLEAN NOT NULL DEFAULT FALSE,
    followers_count INTEGER,
    following_count INTEGER,
    favourites_count INTEGER,
    statuses_count INTEGER,
    raw_json JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_authors_username ON twitter_authors (username);

CREATE TABLE tweets (
    id TEXT PRIMARY KEY,
    external_id TEXT UNIQUE NOT NULL,
    url TEXT NOT NULL,
    text TEXT NOT NULL,
    raw_json JSONB,
    language VARCHAR(16),
    created_at_twitter TIMESTAMPTZ NOT NULL,
    scraped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    source_query TEXT,
    source_query_type TEXT,
    matched_search_term TEXT,
    like_count INTEGER,
    retweet_count INTEGER,
    reply_count INTEGER,
    quote_count INTEGER,
    bookmark_count INTEGER,
    view_count INTEGER,
    is_reply BOOLEAN NOT NULL DEFAULT FALSE,
    is_retweet BOOLEAN NOT NULL DEFAULT FALSE,
    is_quote BOOLEAN NOT NULL DEFAULT FALSE,
    has_images BOOLEAN NOT NULL DEFAULT FALSE,
    has_video BOOLEAN NOT NULL DEFAULT FALSE,
    author_id TEXT NOT NULL REFERENCES twitter_authors(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tweets_created_at_twitter ON tweets (created_at_twitter);
CREATE INDEX idx_tweets_author ON tweets (author_id, created_at_twitter);

CREATE TABLE tweet_asset_matches (
    id TEXT PRIMARY KEY,
    tweet_id TEXT NOT NULL REFERENCES tweets(id) ON DELETE CASCADE,
    asset_type asset_type NOT NULL,
    ticker TEXT NOT NULL,
    confidence FLOAT NOT NULL,
    match_method TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tweet_id, ticker, match_method)
);

CREATE INDEX idx_asset_matches_tweet ON tweet_asset_matches (tweet_id);
CREATE INDEX idx_asset_matches_ticker ON tweet_asset_matches (ticker);

CREATE TABLE market_snapshots (
    id TEXT PRIMARY KEY,
    tweet_id TEXT NOT NULL REFERENCES tweets(id) ON DELETE CASCADE,
    ticker TEXT NOT NULL,
    asset_type asset_type NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    price FLOAT NOT NULL,
    volume FLOAT,
    vwap FLOAT,
    rsi FLOAT,
    macd FLOAT,
    atr FLOAT,
    realized_volatility FLOAT,
    benchmark_ticker TEXT,
    benchmark_price FLOAT,
    market_open_flag BOOLEAN NOT NULL,
    session_type TEXT,
    raw_json JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tweet_id, ticker)
);

CREATE TABLE tweet_outcomes (
    id TEXT PRIMARY KEY,
    tweet_id TEXT NOT NULL REFERENCES tweets(id) ON DELETE CASCADE,
    ticker TEXT NOT NULL,
    horizon outcome_horizon NOT NULL,
    price_at_tweet FLOAT NOT NULL,
    price_at_horizon FLOAT NOT NULL,
    raw_return FLOAT NOT NULL,
    benchmark_return FLOAT,
    excess_return FLOAT,
    expected_volatility FLOAT,
    vol_adjusted_return FLOAT,
    impact_score INTEGER NOT NULL,
    direction_label direction_label NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tweet_id, ticker, horizon)
);

CREATE INDEX idx_outcomes_tweet ON tweet_outcomes (tweet_id);
CREATE INDEX idx_outcomes_ticker ON tweet_outcomes (ticker);
CREATE INDEX idx_outcomes_horizon ON tweet_outcomes (horizon);
CREATE INDEX idx_outcomes_direction ON tweet_outcomes (direction_label);

CREATE TABLE tweet_features (
    id TEXT PRIMARY KEY,
    tweet_id TEXT UNIQUE NOT NULL REFERENCES tweets(id) ON DELETE CASCADE,
    sentiment_score FLOAT,
    credibility_score FLOAT,
    spam_score FLOAT,
    duplicate_group_id TEXT,
    embedding_model TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_features_dup_group ON tweet_features (duplicate_group_id);

CREATE TABLE asset_aliases (
    id TEXT PRIMARY KEY,
    asset_type asset_type NOT NULL,
    ticker TEXT NOT NULL,
    alias TEXT NOT NULL,
    match_method TEXT NOT NULL,
    confidence FLOAT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (asset_type, alias)
);

CREATE INDEX idx_aliases_ticker ON asset_aliases (ticker);
CREATE INDEX idx_aliases_alias ON asset_aliases (alias);
