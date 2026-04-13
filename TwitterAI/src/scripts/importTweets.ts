/**
 * Import tweets from a local JSON file without using Apify.
 *
 * Accepts any of:
 *   - Array of tweet objects (Apify or flat format)
 *   - Twitter API v2 response { data: [], includes: { users: [] } }
 *
 * Usage:
 *   npm run import -- path/to/tweets.json
 *   npm run import -- --input path/to/tweets.json --source "my-source"
 *
 * After importing, run `npm run outcomes` to compute market-reaction labels.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ManualImportService } from '../modules/twitter-ingestion/manualImportService.js';

function getArg(name: string): string | null {
  const idx = process.argv.findIndex((a) => a === name);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

function getFirstPositionalArg(): string | null {
  for (const a of process.argv.slice(2)) {
    if (!a.startsWith('--')) return a;
  }
  return null;
}

async function main() {
  const inputPath = getArg('--input') ?? getFirstPositionalArg();
  if (!inputPath) {
    console.error('Usage: npm run import -- <path/to/tweets.json> [--source "label"]');
    process.exit(1);
  }

  const source = getArg('--source') ?? `cli:${path.basename(inputPath)}`;
  const raw = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8')) as unknown;

  const svc = new ManualImportService();
  const res = await svc.import(raw, { sourceLabel: source });

  console.log(JSON.stringify(res, null, 2));
  console.log('\nNext step: npm run outcomes');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
