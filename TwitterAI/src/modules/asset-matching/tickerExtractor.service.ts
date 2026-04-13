import type { AssetType } from '@prisma/client';
import crypto from 'node:crypto';
import { getAliasSeeds } from './assetResolver.js';
import type { AssetMatchCandidate } from './assetMatching.types.js';
import { KNOWN_CRYPTO_TICKERS, KNOWN_TICKERS } from './aliasDictionary.js';

function normalizeTicker(t: string): string {
  return t.trim().toUpperCase();
}

function cleanTextForWordMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^\p{L}\p{N}\s$]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickAssetTypeForTicker(ticker: string): AssetType {
  const t = normalizeTicker(ticker);
  if (KNOWN_CRYPTO_TICKERS.includes(t)) return 'CRYPTO';
  return 'STOCK';
}

function dedupeAndSort(cands: AssetMatchCandidate[]): AssetMatchCandidate[] {
  const key = (c: AssetMatchCandidate) => `${c.assetType}:${c.ticker}`;
  const map = new Map<string, AssetMatchCandidate>();
  for (const c of cands) {
    const k = key(c);
    const prev = map.get(k);
    if (!prev || c.confidence > prev.confidence) map.set(k, c);
  }
  return [...map.values()].sort((a, b) => b.confidence - a.confidence);
}

function aliasWordBoundaryRegex(alias: string): RegExp {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Prefer word boundaries but allow multi-word aliases with spaces.
  return new RegExp(`(^|\\s)${escaped}(\\s|$)`, 'i');
}

function inferDirectTickers(text: string): string[] {
  const words = text
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^\p{L}\p{N}\s$]/gu, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);

  const out: string[] = [];
  for (const w of words) {
    if (/^\$[A-Za-z]{1,10}$/.test(w)) continue;
    if (/^[A-Z]{1,6}$/.test(w) && KNOWN_TICKERS.includes(w)) out.push(w);
    if (/^[A-Za-z]{2,6}$/.test(w) && KNOWN_CRYPTO_TICKERS.includes(w.toUpperCase())) out.push(w.toUpperCase());
  }
  return Array.from(new Set(out));
}

export class TickerExtractorService {
  async extract(text: string): Promise<AssetMatchCandidate[]> {
    const cands: AssetMatchCandidate[] = [];
    const cleaned = cleanTextForWordMatch(text);

    // (1) Cashtags: $TSLA, $NVDA, $BTC
    for (const match of text.matchAll(/\$([A-Za-z]{1,10})/g)) {
      const ticker = normalizeTicker(match[1] ?? '');
      if (!ticker) continue;
      cands.push({
        assetType: pickAssetTypeForTicker(ticker),
        ticker,
        confidence: 0.95,
        matchMethod: 'cashtag',
        matchedText: match[0],
      });
    }

    // (2) Direct ticker mentions (limited to a known list to reduce false positives).
    for (const t of inferDirectTickers(text)) {
      cands.push({
        assetType: pickAssetTypeForTicker(t),
        ticker: normalizeTicker(t),
        confidence: 0.7,
        matchMethod: 'direct_ticker',
        matchedText: t,
      });
    }

    // (3) Alias dictionary + (4) crypto aliases + (5) keyword rules are all represented as AliasSeed entries.
    const seeds = await getAliasSeeds({ includeDb: true });
    for (const seed of seeds) {
      const rx = aliasWordBoundaryRegex(seed.alias.toLowerCase());
      if (!rx.test(cleaned)) continue;
      cands.push({
        assetType: seed.assetType,
        ticker: normalizeTicker(seed.ticker),
        confidence: seed.confidence,
        matchMethod: seed.matchMethod,
        matchedText: seed.alias,
      });
    }

    return dedupeAndSort(cands);
  }

  // Useful for grouping duplicate tweets by "what asset(s) were mentioned" during early heuristics.
  fingerprintMatches(cands: AssetMatchCandidate[]): string {
    const payload = cands
      .slice(0, 5)
      .map((c) => `${c.assetType}:${c.ticker}`)
      .join('|');
    return crypto.createHash('sha1').update(payload).digest('hex');
  }
}

