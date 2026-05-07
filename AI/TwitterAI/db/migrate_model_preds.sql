-- Migration: add model prediction columns to tweet_features and create
-- tweet_predictions table for full per-horizon model output.
--
-- Run:  psql $DATABASE_URL -f db/migrate_model_preds.sql
-- Safe to re-run — all statements are idempotent.

-- ── tweet_features: add summary prediction columns ───────────────────────────
-- These store the D1-horizon prediction as a quick lookup so the
-- tweet list endpoint doesn't need to join tweet_predictions.

ALTER TABLE tweet_features
    ADD COLUMN IF NOT EXISTS model_direction_pred TEXT,
    ADD COLUMN IF NOT EXISTS model_direction_conf FLOAT,
    ADD COLUMN IF NOT EXISTS model_version        TEXT;

-- ── tweet_predictions: full per-horizon output ───────────────────────────────

CREATE TABLE IF NOT EXISTS tweet_predictions (
    id              TEXT PRIMARY KEY,
    tweet_id        TEXT NOT NULL REFERENCES tweets(id) ON DELETE CASCADE,
    ticker          TEXT NOT NULL,
    horizon         TEXT NOT NULL,
    model_version   TEXT NOT NULL,
    direction_pred  TEXT NOT NULL,   -- BULLISH | BEARISH | NEUTRAL
    bullish_prob    FLOAT NOT NULL,
    bearish_prob    FLOAT NOT NULL,
    neutral_prob    FLOAT NOT NULL,
    confidence      FLOAT NOT NULL,  -- max(bullish_prob, bearish_prob, neutral_prob)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tweet_id, ticker, horizon, model_version)
);

CREATE INDEX IF NOT EXISTS idx_predictions_tweet    ON tweet_predictions (tweet_id);
CREATE INDEX IF NOT EXISTS idx_predictions_ticker   ON tweet_predictions (ticker);
CREATE INDEX IF NOT EXISTS idx_predictions_direction ON tweet_predictions (direction_pred);
CREATE INDEX IF NOT EXISTS idx_predictions_version  ON tweet_predictions (model_version);
