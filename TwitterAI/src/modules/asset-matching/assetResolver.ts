import type { AssetType } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import type { AliasSeed } from './assetMatching.types.js';
import { seededAliases } from './aliasDictionary.js';

export async function loadAliasSeedsFromDb(): Promise<AliasSeed[]> {
  const rows = await prisma.assetAlias.findMany();
  return rows.map((r) => ({
    assetType: r.assetType as AssetType,
    ticker: r.ticker,
    alias: r.alias,
    matchMethod: r.matchMethod as AliasSeed['matchMethod'],
    confidence: r.confidence,
  }));
}

export async function getAliasSeeds(opts?: { includeDb?: boolean }): Promise<AliasSeed[]> {
  const includeDb = opts?.includeDb ?? true;
  const codeSeeds = seededAliases();
  if (!includeDb) return codeSeeds;

  try {
    const db = await loadAliasSeedsFromDb();
    return [...codeSeeds, ...db];
  } catch {
    // DB might not be migrated/available yet during early dev; keep the service usable.
    return codeSeeds;
  }
}

