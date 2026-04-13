import type { AssetType } from '@prisma/client';
import type { AliasSeed } from './assetMatching.types.js';

const SEEDS: AliasSeed[] = [
  // ── Mega-cap tech ──────────────────────────────────────────────
  { assetType: 'STOCK', ticker: 'TSLA', alias: 'tesla', matchMethod: 'alias_dictionary', confidence: 0.8 },
  { assetType: 'STOCK', ticker: 'NVDA', alias: 'nvidia', matchMethod: 'alias_dictionary', confidence: 0.8 },
  { assetType: 'STOCK', ticker: 'AAPL', alias: 'apple', matchMethod: 'alias_dictionary', confidence: 0.75 },
  { assetType: 'STOCK', ticker: 'MSFT', alias: 'microsoft', matchMethod: 'alias_dictionary', confidence: 0.75 },
  { assetType: 'STOCK', ticker: 'AMZN', alias: 'amazon', matchMethod: 'alias_dictionary', confidence: 0.75 },
  { assetType: 'STOCK', ticker: 'META', alias: 'meta', matchMethod: 'alias_dictionary', confidence: 0.65 },
  { assetType: 'STOCK', ticker: 'META', alias: 'facebook', matchMethod: 'alias_dictionary', confidence: 0.65 },
  { assetType: 'STOCK', ticker: 'GOOGL', alias: 'google', matchMethod: 'alias_dictionary', confidence: 0.65 },
  { assetType: 'STOCK', ticker: 'GOOGL', alias: 'alphabet', matchMethod: 'alias_dictionary', confidence: 0.65 },
  { assetType: 'STOCK', ticker: 'AMD', alias: 'amd', matchMethod: 'alias_dictionary', confidence: 0.75 },
  { assetType: 'STOCK', ticker: 'AMD', alias: 'advanced micro devices', matchMethod: 'alias_dictionary', confidence: 0.8 },
  { assetType: 'STOCK', ticker: 'NFLX', alias: 'netflix', matchMethod: 'alias_dictionary', confidence: 0.8 },
  { assetType: 'STOCK', ticker: 'ORCL', alias: 'oracle', matchMethod: 'alias_dictionary', confidence: 0.75 },
  { assetType: 'STOCK', ticker: 'CRM', alias: 'salesforce', matchMethod: 'alias_dictionary', confidence: 0.75 },
  { assetType: 'STOCK', ticker: 'ADBE', alias: 'adobe', matchMethod: 'alias_dictionary', confidence: 0.75 },
  { assetType: 'STOCK', ticker: 'INTC', alias: 'intel', matchMethod: 'alias_dictionary', confidence: 0.75 },
  { assetType: 'STOCK', ticker: 'QCOM', alias: 'qualcomm', matchMethod: 'alias_dictionary', confidence: 0.75 },
  { assetType: 'STOCK', ticker: 'AVGO', alias: 'broadcom', matchMethod: 'alias_dictionary', confidence: 0.75 },

  // ── Financials ────────────────────────────────────────────────
  { assetType: 'STOCK', ticker: 'JPM', alias: 'jpmorgan', matchMethod: 'alias_dictionary', confidence: 0.8 },
  { assetType: 'STOCK', ticker: 'JPM', alias: 'jp morgan', matchMethod: 'alias_dictionary', confidence: 0.8 },
  { assetType: 'STOCK', ticker: 'BAC', alias: 'bank of america', matchMethod: 'alias_dictionary', confidence: 0.8 },
  { assetType: 'STOCK', ticker: 'GS', alias: 'goldman sachs', matchMethod: 'alias_dictionary', confidence: 0.8 },
  { assetType: 'STOCK', ticker: 'GS', alias: 'goldman', matchMethod: 'alias_dictionary', confidence: 0.7 },
  { assetType: 'STOCK', ticker: 'MS', alias: 'morgan stanley', matchMethod: 'alias_dictionary', confidence: 0.8 },
  { assetType: 'STOCK', ticker: 'WFC', alias: 'wells fargo', matchMethod: 'alias_dictionary', confidence: 0.8 },
  { assetType: 'STOCK', ticker: 'C', alias: 'citigroup', matchMethod: 'alias_dictionary', confidence: 0.75 },
  { assetType: 'STOCK', ticker: 'C', alias: 'citi', matchMethod: 'alias_dictionary', confidence: 0.7 },
  { assetType: 'STOCK', ticker: 'V', alias: 'visa', matchMethod: 'alias_dictionary', confidence: 0.8 },
  { assetType: 'STOCK', ticker: 'MA', alias: 'mastercard', matchMethod: 'alias_dictionary', confidence: 0.8 },
  { assetType: 'STOCK', ticker: 'BRK.B', alias: 'berkshire', matchMethod: 'alias_dictionary', confidence: 0.7 },
  { assetType: 'STOCK', ticker: 'BRK.B', alias: 'berkshire hathaway', matchMethod: 'alias_dictionary', confidence: 0.8 },
  { assetType: 'STOCK', ticker: 'BLK', alias: 'blackrock', matchMethod: 'alias_dictionary', confidence: 0.8 },

  // ── Healthcare & pharma ────────────────────────────────────────
  { assetType: 'STOCK', ticker: 'UNH', alias: 'unitedhealth', matchMethod: 'alias_dictionary', confidence: 0.75 },
  { assetType: 'STOCK', ticker: 'JNJ', alias: 'johnson & johnson', matchMethod: 'alias_dictionary', confidence: 0.8 },
  { assetType: 'STOCK', ticker: 'JNJ', alias: 'johnson and johnson', matchMethod: 'alias_dictionary', confidence: 0.8 },
  { assetType: 'STOCK', ticker: 'PFE', alias: 'pfizer', matchMethod: 'alias_dictionary', confidence: 0.8 },
  { assetType: 'STOCK', ticker: 'MRK', alias: 'merck', matchMethod: 'alias_dictionary', confidence: 0.75 },
  { assetType: 'STOCK', ticker: 'ABBV', alias: 'abbvie', matchMethod: 'alias_dictionary', confidence: 0.75 },
  { assetType: 'STOCK', ticker: 'LLY', alias: 'eli lilly', matchMethod: 'alias_dictionary', confidence: 0.8 },
  { assetType: 'STOCK', ticker: 'LLY', alias: 'lilly', matchMethod: 'alias_dictionary', confidence: 0.65 },

  // ── Consumer & retail ──────────────────────────────────────────
  { assetType: 'STOCK', ticker: 'WMT', alias: 'walmart', matchMethod: 'alias_dictionary', confidence: 0.8 },
  { assetType: 'STOCK', ticker: 'TGT', alias: 'target', matchMethod: 'alias_dictionary', confidence: 0.7 },
  { assetType: 'STOCK', ticker: 'COST', alias: 'costco', matchMethod: 'alias_dictionary', confidence: 0.8 },
  { assetType: 'STOCK', ticker: 'HD', alias: 'home depot', matchMethod: 'alias_dictionary', confidence: 0.8 },
  { assetType: 'STOCK', ticker: 'MCD', alias: "mcdonald's", matchMethod: 'alias_dictionary', confidence: 0.8 },
  { assetType: 'STOCK', ticker: 'SBUX', alias: 'starbucks', matchMethod: 'alias_dictionary', confidence: 0.8 },
  { assetType: 'STOCK', ticker: 'NKE', alias: 'nike', matchMethod: 'alias_dictionary', confidence: 0.75 },
  { assetType: 'STOCK', ticker: 'KO', alias: 'coca-cola', matchMethod: 'alias_dictionary', confidence: 0.75 },
  { assetType: 'STOCK', ticker: 'KO', alias: 'coca cola', matchMethod: 'alias_dictionary', confidence: 0.75 },
  { assetType: 'STOCK', ticker: 'PEP', alias: 'pepsi', matchMethod: 'alias_dictionary', confidence: 0.75 },
  { assetType: 'STOCK', ticker: 'PEP', alias: 'pepsico', matchMethod: 'alias_dictionary', confidence: 0.75 },

  // ── Energy ────────────────────────────────────────────────────
  { assetType: 'STOCK', ticker: 'XOM', alias: 'exxon', matchMethod: 'alias_dictionary', confidence: 0.8 },
  { assetType: 'STOCK', ticker: 'XOM', alias: 'exxonmobil', matchMethod: 'alias_dictionary', confidence: 0.8 },
  { assetType: 'STOCK', ticker: 'CVX', alias: 'chevron', matchMethod: 'alias_dictionary', confidence: 0.8 },

  // ── Industrials / defence / aerospace ─────────────────────────
  { assetType: 'STOCK', ticker: 'BA', alias: 'boeing', matchMethod: 'alias_dictionary', confidence: 0.8 },
  { assetType: 'STOCK', ticker: 'CAT', alias: 'caterpillar', matchMethod: 'alias_dictionary', confidence: 0.75 },
  { assetType: 'STOCK', ticker: 'DE', alias: 'deere', matchMethod: 'alias_dictionary', confidence: 0.65 },
  { assetType: 'STOCK', ticker: 'LMT', alias: 'lockheed martin', matchMethod: 'alias_dictionary', confidence: 0.8 },
  { assetType: 'STOCK', ticker: 'RTX', alias: 'raytheon', matchMethod: 'alias_dictionary', confidence: 0.75 },

  // ── Media / entertainment ─────────────────────────────────────
  { assetType: 'STOCK', ticker: 'DIS', alias: 'disney', matchMethod: 'alias_dictionary', confidence: 0.8 },
  { assetType: 'STOCK', ticker: 'PARA', alias: 'paramount', matchMethod: 'alias_dictionary', confidence: 0.7 },
  { assetType: 'STOCK', ticker: 'WBD', alias: 'warner bros', matchMethod: 'alias_dictionary', confidence: 0.7 },

  // ── Other notable names ───────────────────────────────────────
  { assetType: 'STOCK', ticker: 'COIN', alias: 'coinbase', matchMethod: 'alias_dictionary', confidence: 0.85 },
  { assetType: 'STOCK', ticker: 'MSTR', alias: 'microstrategy', matchMethod: 'alias_dictionary', confidence: 0.85 },
  { assetType: 'STOCK', ticker: 'PLTR', alias: 'palantir', matchMethod: 'alias_dictionary', confidence: 0.8 },
  { assetType: 'STOCK', ticker: 'RBLX', alias: 'roblox', matchMethod: 'alias_dictionary', confidence: 0.75 },
  { assetType: 'STOCK', ticker: 'SNAP', alias: 'snapchat', matchMethod: 'alias_dictionary', confidence: 0.75 },
  { assetType: 'STOCK', ticker: 'UBER', alias: 'uber', matchMethod: 'alias_dictionary', confidence: 0.75 },
  { assetType: 'STOCK', ticker: 'LYFT', alias: 'lyft', matchMethod: 'alias_dictionary', confidence: 0.75 },
  { assetType: 'STOCK', ticker: 'ABNB', alias: 'airbnb', matchMethod: 'alias_dictionary', confidence: 0.8 },
  { assetType: 'STOCK', ticker: 'HOOD', alias: 'robinhood', matchMethod: 'alias_dictionary', confidence: 0.8 },
  { assetType: 'STOCK', ticker: 'RIVN', alias: 'rivian', matchMethod: 'alias_dictionary', confidence: 0.8 },
  { assetType: 'STOCK', ticker: 'LCID', alias: 'lucid', matchMethod: 'alias_dictionary', confidence: 0.75 },
  { assetType: 'STOCK', ticker: 'GME', alias: 'gamestop', matchMethod: 'alias_dictionary', confidence: 0.85 },
  { assetType: 'STOCK', ticker: 'AMC', alias: 'amc', matchMethod: 'alias_dictionary', confidence: 0.7 },

  // ── ETFs / benchmarks ─────────────────────────────────────────
  { assetType: 'ETF', ticker: 'SPY', alias: 's&p 500', matchMethod: 'keyword_rule', confidence: 0.7 },
  { assetType: 'ETF', ticker: 'SPY', alias: 'sp 500', matchMethod: 'keyword_rule', confidence: 0.7 },
  { assetType: 'ETF', ticker: 'SPY', alias: 's&p500', matchMethod: 'keyword_rule', confidence: 0.7 },
  { assetType: 'ETF', ticker: 'SPY', alias: 'sp500', matchMethod: 'keyword_rule', confidence: 0.7 },
  { assetType: 'ETF', ticker: 'QQQ', alias: 'nasdaq', matchMethod: 'keyword_rule', confidence: 0.7 },
  { assetType: 'ETF', ticker: 'QQQ', alias: 'nasdaq 100', matchMethod: 'keyword_rule', confidence: 0.75 },
  { assetType: 'ETF', ticker: 'QQQ', alias: 'nasdaq100', matchMethod: 'keyword_rule', confidence: 0.75 },
  { assetType: 'ETF', ticker: 'IWM', alias: 'russell 2000', matchMethod: 'keyword_rule', confidence: 0.75 },
  { assetType: 'ETF', ticker: 'GLD', alias: 'gold etf', matchMethod: 'keyword_rule', confidence: 0.7 },
  { assetType: 'ETF', ticker: 'GLD', alias: 'gold price', matchMethod: 'keyword_rule', confidence: 0.6 },
  { assetType: 'ETF', ticker: 'SLV', alias: 'silver etf', matchMethod: 'keyword_rule', confidence: 0.7 },
  { assetType: 'ETF', ticker: 'TLT', alias: '20 year treasury', matchMethod: 'keyword_rule', confidence: 0.7 },
  { assetType: 'ETF', ticker: 'TLT', alias: 'long bond', matchMethod: 'keyword_rule', confidence: 0.5 },
  { assetType: 'ETF', ticker: 'XLF', alias: 'financial sector', matchMethod: 'keyword_rule', confidence: 0.55 },
  { assetType: 'ETF', ticker: 'XLE', alias: 'energy sector', matchMethod: 'keyword_rule', confidence: 0.55 },
  { assetType: 'ETF', ticker: 'XLK', alias: 'tech sector', matchMethod: 'keyword_rule', confidence: 0.5 },
  { assetType: 'ETF', ticker: 'ARKK', alias: 'ark invest', matchMethod: 'keyword_rule', confidence: 0.75 },

  // Macro-ish terms (treated as benchmarks / proxies)
  { assetType: 'ETF', ticker: 'SPY', alias: 'stocks', matchMethod: 'keyword_rule', confidence: 0.4 },
  { assetType: 'ETF', ticker: 'QQQ', alias: 'tech stocks', matchMethod: 'keyword_rule', confidence: 0.45 },
  { assetType: 'ETF', ticker: 'SPY', alias: 'stock market', matchMethod: 'keyword_rule', confidence: 0.45 },
  { assetType: 'ETF', ticker: 'SPY', alias: 'equities', matchMethod: 'keyword_rule', confidence: 0.4 },
  { assetType: 'ETF', ticker: 'GLD', alias: 'gold', matchMethod: 'keyword_rule', confidence: 0.5 },

  // ── Crypto ────────────────────────────────────────────────────
  { assetType: 'CRYPTO', ticker: 'BTC', alias: 'bitcoin', matchMethod: 'crypto_alias', confidence: 0.85 },
  { assetType: 'CRYPTO', ticker: 'BTC', alias: 'btc', matchMethod: 'crypto_alias', confidence: 0.8 },
  { assetType: 'CRYPTO', ticker: 'ETH', alias: 'ethereum', matchMethod: 'crypto_alias', confidence: 0.85 },
  { assetType: 'CRYPTO', ticker: 'ETH', alias: 'eth', matchMethod: 'crypto_alias', confidence: 0.8 },
  { assetType: 'CRYPTO', ticker: 'SOL', alias: 'solana', matchMethod: 'crypto_alias', confidence: 0.85 },
  { assetType: 'CRYPTO', ticker: 'SOL', alias: 'sol', matchMethod: 'crypto_alias', confidence: 0.75 },
  { assetType: 'CRYPTO', ticker: 'XRP', alias: 'ripple', matchMethod: 'crypto_alias', confidence: 0.8 },
  { assetType: 'CRYPTO', ticker: 'XRP', alias: 'xrp', matchMethod: 'crypto_alias', confidence: 0.8 },
  { assetType: 'CRYPTO', ticker: 'ADA', alias: 'cardano', matchMethod: 'crypto_alias', confidence: 0.8 },
  { assetType: 'CRYPTO', ticker: 'DOGE', alias: 'dogecoin', matchMethod: 'crypto_alias', confidence: 0.85 },
  { assetType: 'CRYPTO', ticker: 'DOGE', alias: 'doge', matchMethod: 'crypto_alias', confidence: 0.8 },
  { assetType: 'CRYPTO', ticker: 'AVAX', alias: 'avalanche', matchMethod: 'crypto_alias', confidence: 0.8 },
  { assetType: 'CRYPTO', ticker: 'LINK', alias: 'chainlink', matchMethod: 'crypto_alias', confidence: 0.8 },
  { assetType: 'CRYPTO', ticker: 'DOT', alias: 'polkadot', matchMethod: 'crypto_alias', confidence: 0.8 },
  { assetType: 'CRYPTO', ticker: 'MATIC', alias: 'polygon', matchMethod: 'crypto_alias', confidence: 0.8 },
  { assetType: 'CRYPTO', ticker: 'LTC', alias: 'litecoin', matchMethod: 'crypto_alias', confidence: 0.8 },
  { assetType: 'CRYPTO', ticker: 'UNI', alias: 'uniswap', matchMethod: 'crypto_alias', confidence: 0.8 },
  { assetType: 'CRYPTO', ticker: 'SHIB', alias: 'shiba inu', matchMethod: 'crypto_alias', confidence: 0.8 },
  { assetType: 'CRYPTO', ticker: 'SHIB', alias: 'shib', matchMethod: 'crypto_alias', confidence: 0.75 },
  { assetType: 'CRYPTO', ticker: 'BNB', alias: 'binance coin', matchMethod: 'crypto_alias', confidence: 0.8 },
  { assetType: 'CRYPTO', ticker: 'BNB', alias: 'bnb', matchMethod: 'crypto_alias', confidence: 0.75 },
  { assetType: 'CRYPTO', ticker: 'SUI', alias: 'sui', matchMethod: 'crypto_alias', confidence: 0.75 },
  { assetType: 'CRYPTO', ticker: 'APT', alias: 'aptos', matchMethod: 'crypto_alias', confidence: 0.75 },
  { assetType: 'CRYPTO', ticker: 'PEPE', alias: 'pepe', matchMethod: 'crypto_alias', confidence: 0.7 },
];

export function seededAliases(): AliasSeed[] {
  // Defensive copy to avoid accidental mutation by callers.
  return SEEDS.map((x) => ({ ...x }));
}

export const KNOWN_TICKERS: string[] = Array.from(
  new Set(
    SEEDS.filter((s) => s.assetType === ('STOCK' satisfies AssetType) || s.assetType === 'ETF')
      .map((s) => s.ticker.toUpperCase())
      .concat([
        'SPY', 'QQQ', 'IWM', 'GLD', 'SLV', 'TLT', 'XLF', 'XLE', 'XLK', 'ARKK',
        'TSLA', 'NVDA', 'AAPL', 'MSFT', 'AMZN', 'META', 'GOOGL', 'GOOG', 'AMD',
        'NFLX', 'ORCL', 'CRM', 'ADBE', 'INTC', 'QCOM', 'AVGO',
        'JPM', 'BAC', 'GS', 'MS', 'WFC', 'C', 'V', 'MA', 'BLK',
        'UNH', 'JNJ', 'PFE', 'MRK', 'ABBV', 'LLY',
        'WMT', 'TGT', 'COST', 'HD', 'MCD', 'SBUX', 'NKE', 'KO', 'PEP',
        'XOM', 'CVX', 'BA', 'CAT', 'DE', 'LMT', 'RTX',
        'DIS', 'PARA', 'WBD',
        'COIN', 'MSTR', 'PLTR', 'RBLX', 'SNAP', 'UBER', 'LYFT', 'ABNB',
        'HOOD', 'RIVN', 'LCID', 'GME', 'AMC',
      ])
  )
);

export const KNOWN_CRYPTO_TICKERS: string[] = Array.from(
  new Set(
    SEEDS.filter((s) => s.assetType === 'CRYPTO')
      .map((s) => s.ticker.toUpperCase())
      .concat(['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOGE', 'AVAX', 'LINK', 'DOT', 'MATIC', 'LTC', 'UNI', 'SHIB', 'BNB', 'SUI', 'APT', 'PEPE'])
  )
);

