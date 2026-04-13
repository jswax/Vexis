import { prisma } from '../db/prisma.js';
import { getMarketDataProvider } from '../modules/market-data/marketDataClient.js';

async function main() {
  const provider = getMarketDataProvider();
  const now = new Date();

  // Use Alpaca to pick a timestamp where we actually have a price.
  const ref = await provider.getNearestPrice({ ticker: 'SPY', assetType: 'STOCK', timestamp: now });
  const createdAtTwitter = ref.timestamp;

  const author = await prisma.twitterAuthor.upsert({
    where: { externalId: 'local-test-author' },
    update: {
      username: 'local_test',
      displayName: 'Local Test',
      verified: false,
      rawJson: { source: 'local' },
    },
    create: {
      externalId: 'local-test-author',
      username: 'local_test',
      displayName: 'Local Test',
      verified: false,
      rawJson: { source: 'local' },
    },
  });

  const externalId = `local-test-${Date.now()}`;
  const tweet = await prisma.tweet.create({
    data: {
      externalId,
      url: `https://x.com/i/web/status/${externalId}`,
      text: 'TEST TWEET: SPY looks interesting here.',
      rawJson: { source: 'local', note: 'synthetic tweet for pipeline test' },
      language: 'en',
      createdAtTwitter,
      scrapedAt: new Date(),
      sourceQuery: 'local:test',
      sourceQueryType: 'local',
      matchedSearchTerm: 'SPY',
      likeCount: 0,
      retweetCount: 0,
      replyCount: 0,
      quoteCount: 0,
      bookmarkCount: 0,
      viewCount: 0,
      isReply: false,
      isRetweet: false,
      isQuote: false,
      hasImages: false,
      hasVideo: false,
      authorId: author.id,
    },
  });

  await prisma.tweetAssetMatch.create({
    data: {
      tweetId: tweet.id,
      assetType: 'ETF',
      ticker: 'SPY',
      confidence: 0.99,
      matchMethod: 'local_test',
    },
  });

  console.log(JSON.stringify({ tweetId: tweet.id, createdAtTwitter, priceAtTweet: ref.price }, null, 2));
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });

