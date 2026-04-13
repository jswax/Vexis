import { OutcomeJobProcessor } from '../modules/jobs/outcomeJob.processor.js';

function getArgInt(name: string): number | null {
  const idx = process.argv.findIndex((a) => a === name);
  if (idx === -1) return null;
  const v = Number(process.argv[idx + 1]);
  return Number.isFinite(v) ? Math.trunc(v) : null;
}

async function main() {
  const limit = getArgInt('--limit') ?? 50;
  const proc = new OutcomeJobProcessor();
  const res = await proc.computeForUnprocessedTweets({ limit });
  console.log(JSON.stringify(res, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

