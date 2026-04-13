/**
 * Ingest tweets via Twitter API v2 (official API, no Apify).
 *
 * Modes:
 *   --user <handle>       Pull timeline from a specific account (free tier)
 *   --search <query>      Run a recent-tweet search (requires Basic plan $100/mo)
 *
 * Options:
 *   --total <n>           Max tweets to fetch (default 100)
 *   --start <ISO date>    Only tweets after this time
 *   --end <ISO date>      Only tweets before this time
 *   --include-retweets    Include retweets (excluded by default)
 *   --include-replies     Include replies (excluded by default)
 *
 * Requires TWITTER_BEARER_TOKEN in .env.
 *
 * Usage examples:
 *   npm run ingest:v2 -- --user unusual_whales --total 200
 *   npm run ingest:v2 -- --user elonmusk --total 50 --start 2024-01-01
 *   npm run ingest:v2 -- --search "$TSLA earnings" --total 100
 */
import { env } from '../config/env.js';
import { TwitterApiV2Client } from '../modules/twitter-ingestion/twitterApiV2Client.js';
import { ManualImportService } from '../modules/twitter-ingestion/manualImportService.js';

function getArg(name: string): string | null {
  const idx = process.argv.findIndex((a) => a === name);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

async function main() {
  if (!env.TWITTER_BEARER_TOKEN) {
    console.error('TWITTER_BEARER_TOKEN is not set in .env');
    process.exit(1);
  }

  // npm strips --user/--total flags and passes them as positional args instead.
  // Support both named flags and positional fallbacks.
  const positionals = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const userHandle = getArg('--user') ?? (positionals[0] ?? null);
  const searchQuery = getArg('--search');
  const total = Number(getArg('--total') ?? positionals[1] ?? '100');
  const startTime = getArg('--start') ?? undefined;
  const endTime = getArg('--end') ?? undefined;
  const excludeRetweets = !hasFlag('--include-retweets');
  const excludeReplies = !hasFlag('--include-replies');

  if (!userHandle && !searchQuery) {
    console.error('Provide --user <handle> or --search <query>');
    process.exit(1);
  }

  const client = new TwitterApiV2Client(env.TWITTER_BEARER_TOKEN);
  const importer = new ManualImportService();

  let response: Awaited<ReturnType<typeof client.fetchUserTimeline>>;
  let sourceLabel: string;

  if (userHandle) {
    console.log(`Fetching user timeline for @${userHandle} (total=${total}) ...`);
    const user = await client.getUserByUsername(userHandle);
    if (!user.data?.id) {
      console.error(`User not found: @${userHandle}`);
      process.exit(1);
    }
    response = await client.fetchUserTimeline(user.data.id, {
      total,
      startTime,
      endTime,
      excludeRetweets,
      excludeReplies,
    });
    sourceLabel = `v2:timeline:@${userHandle}`;
  } else {
    console.log(`Searching recent tweets: "${searchQuery}" (total=${total}) ...`);
    response = await client.searchRecent(searchQuery!, { maxResults: total, startTime, endTime });
    sourceLabel = `v2:search:${searchQuery}`;
  }

  console.log(`Fetched ${response.data?.length ?? 0} tweets. Importing...`);

  const result = await importer.import(response, { sourceLabel });
  console.log(JSON.stringify(result, null, 2));
  console.log('\nNext step: npm run outcomes');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
