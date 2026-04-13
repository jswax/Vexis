import fs from 'node:fs';
import path from 'node:path';
import { DatasetBuilderService, type TrainingRow } from './datasetBuilder.service.js';

export type ExportFilter = {
  /** Drop rows where spamScore >= threshold (default: no filter) */
  maxSpamScore?: number;
  /** Drop rows where credibilityScore < threshold (default: no filter) */
  minCredibilityScore?: number;
  /** Only include specific tickers */
  tickers?: string[];
  /** Only include specific horizons (M5, M15, H1, H4, D1) */
  horizons?: string[];
  /** Only include rows where |impactScore| >= threshold (filters out noise) */
  minAbsImpactScore?: number;
};

function applyFilter(rows: TrainingRow[], filter: ExportFilter): TrainingRow[] {
  return rows.filter((r) => {
    if (filter.maxSpamScore != null && r.spamScore != null && r.spamScore >= filter.maxSpamScore) return false;
    if (filter.minCredibilityScore != null && r.credibilityScore != null && r.credibilityScore < filter.minCredibilityScore) return false;
    if (filter.tickers?.length && !filter.tickers.includes(r.ticker)) return false;
    if (filter.horizons?.length && !filter.horizons.includes(r.horizon)) return false;
    if (filter.minAbsImpactScore != null && Math.abs(r.impactScore) < filter.minAbsImpactScore) return false;
    return true;
  });
}

function escapeCsvField(value: unknown): string {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const CSV_COLUMNS: (keyof TrainingRow)[] = [
  'tweetId',
  'tweetExternalId',
  'createdAtTwitter',
  'url',
  'text',
  'authorUsername',
  'authorVerified',
  'ticker',
  'horizon',
  'impactScore',
  'directionLabel',
  'rawReturn',
  'benchmarkReturn',
  'excessReturn',
  'expectedVolatility',
  'volAdjustedReturn',
  'spamScore',
  'credibilityScore',
  'duplicateGroupId',
];

export class TrainingExportService {
  constructor(private readonly builder = new DatasetBuilderService()) {}

  async exportJsonl(opts: { outFile: string; limit?: number; filter?: ExportFilter }) {
    const outPath = path.resolve(opts.outFile);
    let rows = await this.builder.buildRows({ limit: opts.limit });
    if (opts.filter) rows = applyFilter(rows, opts.filter);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const stream = fs.createWriteStream(outPath, { encoding: 'utf8' });
    for (const r of rows) {
      stream.write(`${JSON.stringify(r)}\n`);
    }
    stream.end();
    return { outFile: outPath, rows: rows.length, format: 'jsonl' };
  }

  async exportCsv(opts: { outFile: string; limit?: number; filter?: ExportFilter }) {
    const outPath = path.resolve(opts.outFile);
    let rows = await this.builder.buildRows({ limit: opts.limit });
    if (opts.filter) rows = applyFilter(rows, opts.filter);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const stream = fs.createWriteStream(outPath, { encoding: 'utf8' });
    // Header
    stream.write(CSV_COLUMNS.join(',') + '\n');
    for (const r of rows) {
      const line = CSV_COLUMNS.map((col) => escapeCsvField(r[col])).join(',');
      stream.write(line + '\n');
    }
    stream.end();
    return { outFile: outPath, rows: rows.length, format: 'csv' };
  }

  /** Export both JSONL and CSV side-by-side. */
  async exportBoth(opts: { outDir: string; baseName?: string; limit?: number; filter?: ExportFilter }) {
    const base = opts.baseName ?? 'training_data';
    const [jsonl, csv] = await Promise.all([
      this.exportJsonl({ outFile: path.join(opts.outDir, `${base}.jsonl`), limit: opts.limit, filter: opts.filter }),
      this.exportCsv({ outFile: path.join(opts.outDir, `${base}.csv`), limit: opts.limit, filter: opts.filter }),
    ]);
    return { jsonl, csv };
  }
}

