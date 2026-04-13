import type { AssetType } from '@prisma/client';

export type MatchMethod =
  | 'cashtag'
  | 'direct_ticker'
  | 'alias_dictionary'
  | 'crypto_alias'
  | 'keyword_rule';

export type AssetMatchCandidate = {
  assetType: AssetType;
  ticker: string;
  confidence: number;
  matchMethod: MatchMethod;
  matchedText?: string;
};

export type AliasSeed = {
  assetType: AssetType;
  ticker: string;
  alias: string;
  matchMethod: MatchMethod;
  confidence: number;
};

