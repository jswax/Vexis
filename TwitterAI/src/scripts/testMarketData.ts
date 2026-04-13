import { getMarketDataProvider } from '../modules/market-data/marketDataClient.js';
import type { AssetType } from '@prisma/client';

function getArg(name: string): string | null {
  const idx = process.argv.findIndex((a) => a === name);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

function getPositionals(): string[] {
  return process.argv.slice(2).filter((a) => !a.startsWith('--'));
}

async function main() {
  const provider = getMarketDataProvider();
  const pos = getPositionals();
  const ticker = ((getArg('--ticker') ?? pos[0]) ?? 'SPY').toUpperCase();
  const assetType = ((getArg('--assetType') ?? pos[1]) ?? 'STOCK') as AssetType;
  const timestampRaw = getArg('--timestamp') ?? pos[2];
  const timestamp = timestampRaw ? new Date(timestampRaw) : new Date();

  const point = await provider.getNearestPrice({ ticker, assetType, timestamp });
  console.log(JSON.stringify({ provider: provider.name, request: { ticker, assetType, timestamp }, point }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

