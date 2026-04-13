import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4001),

  DATABASE_URL: z.string().min(1),

  // twitterapi.io — primary tweet ingestion provider
  TWITTER_API_IO_KEY: z.string().min(1),

  MARKET_DATA_PROVIDER: z.string().min(1).default('none'),
  MARKET_DATA_API_KEY: z.string().optional().default(''),

  // Alpaca (used when MARKET_DATA_PROVIDER="alpaca")
  ALPACA_API_KEY: z.string().optional(),
  ALPACA_API_SECRET: z.string().optional(),
  ALPACA_STOCK_FEED: z.enum(['iex', 'sip', 'otc', 'boats']).default('iex'),
  ALPACA_CRYPTO_LOC: z.enum(['us', 'us-1', 'us-2', 'eu-1', 'bs-1']).default('us'),

  DEFAULT_BENCHMARK_STOCK: z.string().min(1).default('SPY'),
  DEFAULT_BENCHMARK_TECH: z.string().min(1).default('QQQ'),
  DEFAULT_BENCHMARK_CRYPTO: z.string().min(1).default('BTCUSD'),

  IMPACT_SCORE_MULTIPLIER: z.coerce.number().positive().default(2.5),

  // Twitter API v2 (official — optional, not used for ingestion)
  TWITTER_BEARER_TOKEN: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);

// Common Railway pitfall: "railway.internal" hosts are only reachable from inside Railway.
if (
  (env.NODE_ENV === 'development' || env.NODE_ENV === 'test') &&
  env.DATABASE_URL.includes('.railway.internal')
) {
  throw new Error(
    'DATABASE_URL points to a Railway internal host (".railway.internal"), which is not reachable from local development. Use Railway\'s public connection URL (often a proxy host) and include sslmode=require if needed.'
  );
}

if (env.MARKET_DATA_PROVIDER.toLowerCase() === 'alpaca') {
  if (!env.ALPACA_API_KEY || !env.ALPACA_API_SECRET) {
    throw new Error('MARKET_DATA_PROVIDER="alpaca" requires ALPACA_API_KEY and ALPACA_API_SECRET to be set.');
  }
}
