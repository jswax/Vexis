-- Migration: add M30 and H6 horizon values to the outcome_horizon enum.
-- Run against Railway: psql $DATABASE_URL -f db/migrate_horizons.sql
--
-- PostgreSQL requires each ADD VALUE in its own statement.
-- Safe to re-run (DO blocks ignore already-existing values).

DO $$ BEGIN
  ALTER TYPE outcome_horizon ADD VALUE IF NOT EXISTS 'M30';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE outcome_horizon ADD VALUE IF NOT EXISTS 'H6';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
