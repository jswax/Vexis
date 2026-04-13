import { prisma } from '../db/prisma.js';
import { seededAliases } from '../modules/asset-matching/aliasDictionary.js';

async function main() {
  const aliases = seededAliases();

  const upserts = aliases.map((a) =>
    prisma.assetAlias.upsert({
      where: {
        assetType_alias: {
          assetType: a.assetType,
          alias: a.alias,
        },
      },
      update: {
        ticker: a.ticker,
        matchMethod: a.matchMethod,
        confidence: a.confidence,
      },
      create: {
        assetType: a.assetType,
        ticker: a.ticker,
        alias: a.alias,
        matchMethod: a.matchMethod,
        confidence: a.confidence,
      },
    })
  );

  await prisma.$transaction(upserts);
  console.log(`Seeded/upserted ${aliases.length} aliases into AssetAlias`);
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });

