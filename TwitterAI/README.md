# TwitterAI (standalone)

TwitterAI is a **backend/data-pipeline project** that ingests Twitter/X posts and produces **training labels based on realized market reaction**, not manual “importance” scoring.

For each tweet we:
1. scrape + store the tweet (raw JSON preserved)
2. match it to one or more assets/tickers
3. align a market snapshot to the tweet timestamp
4. compute forward returns at multiple horizons
5. benchmark-adjust and volatility-adjust those returns
6. map into an **impactScore** from **-10..10**

This project is intentionally **separate from the Vexis website/app**.

## Structure

```
TwitterAI/
  src/
    config/        env validation
    db/            Prisma client
    modules/
      twitter-ingestion/
      asset-matching/
      market-data/
      labeling/
      jobs/
      training/
    routes/
    scripts/
    utils/
  prisma/
  examples/
```

## Requirements

- Node.js (modern LTS)
- PostgreSQL
- Apify account token (for `apidojo/tweet-scraper`)

## Setup

1) Create env file:

- Copy `.env.example` to `.env` and fill values.

2) Install dependencies:

```bash
cd TwitterAI
npm install
```

3) Create DB + run migrations:

```bash
npm run prisma:migrate
```

4) Generate Prisma client:

```bash
npm run prisma:generate
```

5) Seed alias dictionary:

```bash
npm run seed
```

## Ingest tweets

### API

Start server:

```bash
npm run dev
```

POST `POST /api/twitter/ingest` with body like `examples/ingest-request.example.json`.

### CLI

```bash
npm run ingest
```

Or with config:

```bash
npm run ingest -- --config examples/ingest-request.example.json
```

## Compute outcomes (market alignment + returns + labels)

**Important:** Market data providers are behind an interface (`src/modules/market-data`). Right now the default provider is `none`, which will error until you implement/configure a real adapter (Polygon/Alpaca/Binance/Yahoo/etc).

Once you have a provider implemented and `MARKET_DATA_PROVIDER` set:

```bash
npm run outcomes -- --limit 50
```

## Recompute labels

Labels are reproducible because we store intermediate values in `TweetOutcome`. If you change `IMPACT_SCORE_MULTIPLIER` or direction thresholds, you can recompute:

```bash
npm run recompute -- --limit 500
```

## How scoring works (market-reaction label)

For each tweet + horizon:

- **rawReturn**: \( (P_{t+h} / P_t) - 1 \)
- **benchmarkReturn**: same formula for the benchmark (e.g. SPY)
- **excessReturn**: \( rawReturn - benchmarkReturn \)
- **expectedVolatility**: provider `realizedVolatility` if available, otherwise ATR/price proxy
- **volAdjustedReturn**: \( excessReturn / expectedVolatility \) (falls back to `excessReturn` if volatility not available)

Then:

```
impactScore = clamp(round(volAdjustedReturn * IMPACT_SCORE_MULTIPLIER), -10, 10)
```

Direction:
- bullish if excessReturn >= threshold
- bearish if excessReturn <= -threshold
- neutral otherwise

## API endpoints

- `POST /api/twitter/ingest`
- `POST /api/twitter/compute-outcomes`
- `POST /api/twitter/recompute-labels`
- `GET /api/twitter/tweets/:id`
- `GET /api/jobs/:id`

## Known limitations / next steps

- Market provider adapter is a placeholder (`MARKET_DATA_PROVIDER=none`).
- Asset matching is rule-based (cashtags + known tickers + alias dictionary); expand continuously.
- Dedup/spam/credibility are rule-based first-pass heuristics.
- Add a production-grade queue/worker model for jobs once the pipeline shape is stable.

