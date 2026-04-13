import type { AssetType } from '@prisma/client';
import { env } from '../../../config/env.js';
import { AppError } from '../../../utils/errors.js';
import type { MarketDataProvider, PricePoint } from '../marketData.types.js';

type StockBar = {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  n: number;
  vw: number;
};

type StockBarsResponse = {
  bars: Record<string, StockBar[]>;
  next_page_token?: string | null;
  currency?: string;
};

type CryptoBar = {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  n: number;
  vw: number;
};

type CryptoBarsResponse = {
  bars: Record<string, CryptoBar[]>;
  next_page_token?: string | null;
};

function toIso(d: Date): string {
  return d.toISOString();
}

function absMs(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime());
}

function stddev(nums: number[]): number | null {
  if (nums.length < 2) return null;
  const mean = nums.reduce((s, x) => s + x, 0) / nums.length;
  const v = nums.reduce((s, x) => s + (x - mean) ** 2, 0) / (nums.length - 1);
  return Math.sqrt(v);
}

function computeRealizedVolFromBars(bars: { c: number }[]): number | null {
  // Simple (non-annualized) realized volatility proxy over the window.
  // This is used only as a denominator for vol-adjusted return; exact scaling can be tuned later.
  const rets: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const p0 = bars[i - 1]?.c;
    const p1 = bars[i]?.c;
    if (!Number.isFinite(p0) || !Number.isFinite(p1) || !p0) continue;
    rets.push(p1 / p0 - 1);
  }
  return stddev(rets);
}

function getNyClockParts(date: Date): { weekday: string; hour: number; minute: number } {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const weekday = get('weekday');
  const hour = Number(get('hour'));
  const minute = Number(get('minute'));
  return { weekday, hour, minute };
}

function inferMarketSessionForStocks(date: Date): { marketOpenFlag: boolean; sessionType: string } {
  const { weekday, hour, minute } = getNyClockParts(date);
  const isWeekend = weekday === 'Sat' || weekday === 'Sun';
  if (isWeekend) return { marketOpenFlag: false, sessionType: 'closed' };

  const minutes = hour * 60 + minute;
  const open = 9 * 60 + 30;
  const close = 16 * 60;
  if (minutes >= open && minutes < close) return { marketOpenFlag: true, sessionType: 'regular' };
  return { marketOpenFlag: false, sessionType: 'off_hours' };
}

function normalizeCryptoSymbol(ticker: string): string {
  const t = ticker.toUpperCase().trim();
  // Accept BTC, ETH, BTCUSD, BTC/USD.
  if (t.includes('/')) return t;
  if (t.endsWith('USD') && t.length > 3) return `${t.slice(0, -3)}/USD`;
  return `${t}/USD`;
}

async function fetchJson<T>(url: string, headers: Record<string, string>): Promise<T> {
  const res = await fetch(url, { headers });
  const text = await res.text();
  if (!res.ok) {
    throw new AppError({
      statusCode: 502,
      code: 'ALPACA_HTTP_ERROR',
      message: `Alpaca HTTP ${res.status} ${res.statusText}`,
      details: { url, body: text.slice(0, 2000) },
    });
  }
  return JSON.parse(text) as T;
}

export class AlpacaMarketDataProvider implements MarketDataProvider {
  name = 'alpaca';

  private readonly baseUrl = 'https://data.alpaca.markets';
  private readonly headers = {
    'APCA-API-KEY-ID': env.ALPACA_API_KEY!,
    'APCA-API-SECRET-KEY': env.ALPACA_API_SECRET!,
  };

  // Very small in-memory cache to reduce repeated bars calls during outcome computation.
  private readonly cache = new Map<string, unknown>();

  private async getStockBars(symbol: string, start: Date, end: Date): Promise<StockBar[]> {
    const url = new URL('/v2/stocks/bars', this.baseUrl);
    url.searchParams.set('symbols', symbol);
    url.searchParams.set('timeframe', '1Min');
    url.searchParams.set('start', toIso(start));
    url.searchParams.set('end', toIso(end));
    url.searchParams.set('limit', '10000');
    url.searchParams.set('adjustment', 'raw');
    url.searchParams.set('feed', env.ALPACA_STOCK_FEED);

    const key = `stocks:bars:${url.toString()}`;
    if (this.cache.has(key)) return this.cache.get(key) as StockBar[];

    const json = await fetchJson<StockBarsResponse>(url.toString(), this.headers);
    const bars = json.bars?.[symbol] ?? [];
    this.cache.set(key, bars);
    return bars;
  }

  private async getCryptoBars(symbol: string, start: Date, end: Date): Promise<CryptoBar[]> {
    const url = new URL(`/v1beta3/crypto/${env.ALPACA_CRYPTO_LOC}/bars`, this.baseUrl);
    url.searchParams.set('symbols', symbol);
    url.searchParams.set('timeframe', '1Min');
    url.searchParams.set('start', toIso(start));
    url.searchParams.set('end', toIso(end));
    url.searchParams.set('limit', '10000');
    url.searchParams.set('sort', 'asc');

    const key = `crypto:bars:${url.toString()}`;
    if (this.cache.has(key)) return this.cache.get(key) as CryptoBar[];

    const json = await fetchJson<CryptoBarsResponse>(url.toString(), this.headers);
    const bars = json.bars?.[symbol] ?? [];
    this.cache.set(key, bars);
    return bars;
  }

  async getNearestPrice(opts: { ticker: string; assetType: AssetType; timestamp: Date }): Promise<PricePoint> {
    const ts = opts.timestamp;
    const windowsMs =
      opts.assetType === 'CRYPTO'
        ? [2 * 60 * 60 * 1000] // crypto should have data continuously; keep it tight
        : [2 * 60 * 60 * 1000, 12 * 60 * 60 * 1000, 48 * 60 * 60 * 1000, 7 * 24 * 60 * 60 * 1000];

    if (opts.assetType === 'CRYPTO') {
      const symbol = normalizeCryptoSymbol(opts.ticker);
      const w = windowsMs[0]!;
      const start = new Date(ts.getTime() - w);
      const end = new Date(ts.getTime() + w);
      const bars = await this.getCryptoBars(symbol, start, end);
      if (!bars.length) {
        throw new AppError({
          statusCode: 404,
          code: 'ALPACA_NO_BARS',
          message: `No crypto bars returned for ${symbol}`,
          details: { symbol, start: toIso(start), end: toIso(end) },
        });
      }

      let best = bars[0]!;
      let bestDist = Number.POSITIVE_INFINITY;
      for (const b of bars) {
        const bt = new Date(b.t);
        const d = absMs(bt, ts);
        if (d < bestDist) {
          best = b;
          bestDist = d;
        }
      }

      const realizedVolatility = computeRealizedVolFromBars(bars.slice(Math.max(0, bars.length - 60)));
      return {
        timestamp: new Date(best.t),
        price: best.c,
        volume: best.v ?? null,
        vwap: best.vw ?? null,
        rsi: null,
        macd: null,
        atr: null,
        realizedVolatility,
        marketOpenFlag: true,
        sessionType: '24x7',
        rawJson: { source: 'alpaca', kind: 'crypto_bars', symbol, best, window: { start: toIso(start), end: toIso(end) } },
      };
    }

    // STOCK/ETF/INDEX
    const symbol = opts.ticker.toUpperCase().trim();
    let bars: StockBar[] = [];
    let start: Date | null = null;
    let end: Date | null = null;
    for (const w of windowsMs) {
      start = new Date(ts.getTime() - w);
      end = new Date(ts.getTime() + w);
      bars = await this.getStockBars(symbol, start, end);
      if (bars.length) break;
    }
    if (!bars.length || !start || !end) {
      throw new AppError({
        statusCode: 404,
        code: 'ALPACA_NO_BARS',
        message: `No stock bars returned for ${symbol} (try a market-hours timestamp or check your Alpaca data entitlements/feed)`,
        details: { symbol, feed: env.ALPACA_STOCK_FEED, attemptedWindowsMs: windowsMs },
      });
    }

    let best = bars[0]!;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const b of bars) {
      const bt = new Date(b.t);
      const d = absMs(bt, ts);
      if (d < bestDist) {
        best = b;
        bestDist = d;
      }
    }

    const { marketOpenFlag, sessionType } = inferMarketSessionForStocks(new Date(best.t));
    const realizedVolatility = computeRealizedVolFromBars(bars.slice(Math.max(0, bars.length - 60)));

    return {
      timestamp: new Date(best.t),
      price: best.c,
      volume: best.v ?? null,
      vwap: best.vw ?? null,
      rsi: null,
      macd: null,
      atr: null,
      realizedVolatility,
      marketOpenFlag,
      sessionType,
      rawJson: { source: 'alpaca', kind: 'stock_bars', symbol, feed: env.ALPACA_STOCK_FEED, best, window: { start: toIso(start), end: toIso(end) } },
    };
  }
}

