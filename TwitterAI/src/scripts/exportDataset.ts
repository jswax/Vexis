/**
 * Export the labeled tweet dataset for model training.
 *
 * Usage:
 *   npm run export                          # JSONL to ./exports/
 *   npm run export -- --format csv         # CSV format
 *   npm run export -- --format both        # JSONL + CSV
 *   npm run export -- --out ./my-dir --name my_dataset
 *   npm run export -- --limit 5000
 *   npm run export -- --min-impact 2       # Only rows where |impactScore| >= 2
 *   npm run export -- --max-spam 0.5       # Drop rows with spamScore >= 0.5
 *   npm run export -- --min-cred 0.4       # Drop rows with credibilityScore < 0.4
 *   npm run export -- --tickers TSLA,NVDA  # Only these tickers
 *   npm run export -- --horizons H1,D1     # Only these horizons
 */
import path from 'node:path';
import { TrainingExportService, type ExportFilter } from '../modules/training/trainingExport.service.js';

function getArg(name: string): string | null {
  const idx = process.argv.findIndex((a) => a === name);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

async function main() {
  const format = (getArg('--format') ?? 'jsonl') as 'jsonl' | 'csv' | 'both';
  const outDir = path.resolve(getArg('--out') ?? './exports');
  const baseName = getArg('--name') ?? 'training_data';
  const limit = getArg('--limit') ? Number(getArg('--limit')) : undefined;

  const filter: ExportFilter = {};
  const maxSpam = getArg('--max-spam');
  if (maxSpam) filter.maxSpamScore = Number(maxSpam);
  const minCred = getArg('--min-cred');
  if (minCred) filter.minCredibilityScore = Number(minCred);
  const minImpact = getArg('--min-impact');
  if (minImpact) filter.minAbsImpactScore = Number(minImpact);
  const tickers = getArg('--tickers');
  if (tickers) filter.tickers = tickers.split(',').map((t) => t.trim().toUpperCase());
  const horizons = getArg('--horizons');
  if (horizons) filter.horizons = horizons.split(',').map((h) => h.trim().toUpperCase());

  const svc = new TrainingExportService();

  if (format === 'both') {
    const res = await svc.exportBoth({ outDir, baseName, limit, filter: Object.keys(filter).length ? filter : undefined });
    console.log(JSON.stringify(res, null, 2));
  } else if (format === 'csv') {
    const res = await svc.exportCsv({ outFile: path.join(outDir, `${baseName}.csv`), limit, filter: Object.keys(filter).length ? filter : undefined });
    console.log(JSON.stringify(res, null, 2));
  } else {
    const res = await svc.exportJsonl({ outFile: path.join(outDir, `${baseName}.jsonl`), limit, filter: Object.keys(filter).length ? filter : undefined });
    console.log(JSON.stringify(res, null, 2));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
