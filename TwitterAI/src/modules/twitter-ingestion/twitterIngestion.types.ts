import { z } from 'zod';

export const apifyTweetScraperInputSchema = z.object({
  searchTerms: z.array(z.string()).default([]),
  twitterHandles: z.array(z.string()).default([]),
  startUrls: z.array(z.string()).default([]),
  conversationIds: z.array(z.string()).default([]),
  maxItems: z.number().int().positive().default(50),
  sort: z.enum(['Latest', 'Top', 'Latest + Top']).default('Latest'),
  tweetLanguage: z.string().optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  includeSearchTerms: z.boolean().optional(),
  onlyVerifiedUsers: z.boolean().optional(),
  onlyTwitterBlue: z.boolean().optional(),
  minimumRetweets: z.number().int().nonnegative().optional(),
  minimumFavorites: z.number().int().nonnegative().optional(),
  minimumReplies: z.number().int().nonnegative().optional(),
});

export type ApifyTweetScraperInput = z.infer<typeof apifyTweetScraperInputSchema>;

// We intentionally keep raw item as unknown. The normalizer extracts known fields safely.
export type ApifyTweetScraperRawItem = unknown;

export type NormalizedAuthor = {
  externalId: string;
  username: string;
  displayName: string;
  verified: boolean;
  followersCount?: number | null;
  followingCount?: number | null;
  favouritesCount?: number | null;
  statusesCount?: number | null;
  rawJson: unknown;
};

export type NormalizedTweet = {
  externalId: string;
  url: string;
  text: string;
  rawJson: unknown;
  language?: string | null;
  createdAtTwitter: Date;
  scrapedAt: Date;
  sourceQuery?: string | null;
  sourceQueryType?: string | null;
  matchedSearchTerm?: string | null;
  likeCount?: number | null;
  retweetCount?: number | null;
  replyCount?: number | null;
  quoteCount?: number | null;
  bookmarkCount?: number | null;
  viewCount?: number | null;
  isReply: boolean;
  isRetweet: boolean;
  isQuote: boolean;
  hasImages: boolean;
  hasVideo: boolean;
};

export type NormalizedTweetBundle = {
  tweet: NormalizedTweet;
  author: NormalizedAuthor;
};

export type IngestSource = 'api' | 'cli';

