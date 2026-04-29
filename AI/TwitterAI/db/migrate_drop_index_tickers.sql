-- Remove all data for cash indices that have no Alpaca price feed.
-- SPX, NDX, IXIC are not tradeable securities; SPY/QQQ are the proxies.

BEGIN;

DELETE FROM tweet_outcomes WHERE ticker IN ('SPX', 'NDX', 'IXIC');
DELETE FROM market_snapshots WHERE ticker IN ('SPX', 'NDX', 'IXIC');
DELETE FROM tweet_asset_matches WHERE ticker IN ('SPX', 'NDX', 'IXIC');

COMMIT;
