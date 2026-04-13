-- TimescaleDB: CREATE EXTENSION IF NOT EXISTS timescaledb;
-- Run as superuser on empty database, then apply this file.

CREATE TABLE IF NOT EXISTS articles (
    id              BIGSERIAL PRIMARY KEY,
    headline        TEXT NOT NULL,
    body_excerpt    TEXT,
    source          TEXT NOT NULL,
    published_at    TIMESTAMPTZ NOT NULL,
    url             TEXT UNIQUE,
    scraped_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    raw_metadata    JSONB
);

CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_source ON articles (source);

CREATE TABLE IF NOT EXISTS prices (
    symbol      TEXT NOT NULL,
    ts          TIMESTAMPTZ NOT NULL,
    open        DOUBLE PRECISION NOT NULL,
    high        DOUBLE PRECISION NOT NULL,
    low         DOUBLE PRECISION NOT NULL,
    close       DOUBLE PRECISION NOT NULL,
    volume      DOUBLE PRECISION NOT NULL DEFAULT 0,
    PRIMARY KEY (symbol, ts)
);

-- Hypertable (TimescaleDB). On plain PostgreSQL, skip the next two lines.
SELECT create_hypertable('prices', 'ts', if_not_exists => TRUE);

CREATE TABLE IF NOT EXISTS labeled_articles (
    article_id      BIGINT PRIMARY KEY REFERENCES articles (id) ON DELETE CASCADE,
    price_t0_ts     TIMESTAMPTZ NOT NULL,
    price_t0        DOUBLE PRECISION NOT NULL,
    price_tN_ts     TIMESTAMPTZ NOT NULL,
    price_tN        DOUBLE PRECISION NOT NULL,
    raw_delta_pct   DOUBLE PRECISION NOT NULL,
    impact_score    DOUBLE PRECISION,
    label_bucket    TEXT,
    filters_applied JSONB,
    computed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_labeled_impact ON labeled_articles (impact_score);

CREATE TABLE IF NOT EXISTS predictions (
    id              BIGSERIAL PRIMARY KEY,
    article_id      BIGINT REFERENCES articles (id) ON DELETE SET NULL,
    headline        TEXT NOT NULL,
    predicted_score DOUBLE PRECISION NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
