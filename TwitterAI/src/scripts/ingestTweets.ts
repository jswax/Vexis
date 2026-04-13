import fs from 'node:fs';
import path from 'node:path';
import { TwitterIngestionService } from '../modules/twitter-ingestion/twitterIngestion.service.js';
import { apifyTweetScraperInputSchema } from '../modules/twitter-ingestion/twitterIngestion.types.js';
import { defaultMarketRelevantIngestConfig } from '../modules/twitter-ingestion/queryBuilder.js';

function getArg(name: string): string | null {
  const idx = process.argv.findIndex((a) => a === name);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

function getFirstPositionalArg(): string | null {
  const args = process.argv.slice(2);
  for (const a of args) {
    if (!a.startsWith('--')) return a;
  }
  return null;
}

async function main() {
  // NOTE: npm treats "--config" specially and may strip it, even when passed through `npm run ... --`.
  // Accept multiple spellings + a positional JSON path.
  const configPath =
    getArg('--input') ??
    getArg('--configPath') ??
    getArg('--config') ??
    getFirstPositionalArg();

  const raw = configPath
    ? JSON.parse(fs.readFileSync(path.resolve(configPath), 'utf8'))
    : defaultMarketRelevantIngestConfig({ maxItems: 100, sort: 'Latest', mode: 'default' });

  const input = apifyTweetScraperInputSchema.parse(raw);
  const svc = new TwitterIngestionService();
  const res = await svc.ingest(input, { source: 'cli', sourceLabel: configPath ? `cli:${configPath}` : 'cli:defaults' });
  console.log(JSON.stringify(res, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

