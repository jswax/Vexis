import { extractLinks, nearDupHash } from './tweetDeduper.js';

export type FeatureScores = {
  spamScore: number;
  credibilityScore: number;
  duplicateGroupId: string;
};

type AuthorMeta = {
  verified: boolean;
  followersCount?: number | null;
  followingCount?: number | null;
  statusesCount?: number | null;
};

type TweetMeta = {
  text: string;
  likeCount?: number | null;
  retweetCount?: number | null;
  replyCount?: number | null;
  isRetweet: boolean;
  isReply: boolean;
  hasImages: boolean;
  hasVideo: boolean;
};

/**
 * Spam score heuristic (0 = clean, 1 = very spammy).
 *
 * Factors:
 * - Excessive external links (> 2 is suspicious in a financial tweet)
 * - Excessive hashtags
 * - Very short text (< 20 chars) that is not a retweet
 * - Repeated characters (e.g. "BRRR!!!!!!!!!")
 * - All-caps ratio
 */
export function computeSpamScore(tweet: TweetMeta): number {
  const { text, isRetweet } = tweet;
  let score = 0;

  const links = extractLinks(text);
  if (links.length >= 4) score += 0.5;
  else if (links.length === 3) score += 0.35;
  else if (links.length === 2) score += 0.2;
  else if (links.length === 1) score += 0.05;

  const hashtagCount = (text.match(/#\w+/g) ?? []).length;
  if (hashtagCount >= 6) score += 0.35;
  else if (hashtagCount >= 4) score += 0.2;
  else if (hashtagCount >= 2) score += 0.05;

  const stripped = text.replace(/https?:\/\/\S+/g, '').replace(/#\w+/g, '').trim();
  if (!isRetweet && stripped.length < 20) score += 0.2;

  // Repeated punctuation: "!!!!!!" or "???"
  if (/([!?.])\1{3,}/.test(text)) score += 0.15;

  // High caps ratio on long text
  const letters = text.replace(/[^a-zA-Z]/g, '');
  if (letters.length > 30) {
    const capsRatio = (text.replace(/[^A-Z]/g, '').length) / letters.length;
    if (capsRatio > 0.7) score += 0.1;
  }

  return Math.min(1, score);
}

/**
 * Credibility score heuristic (0 = low, 1 = high).
 *
 * Factors:
 * - Verified badge (strong positive signal)
 * - Follower count tiers
 * - Follower/following ratio (high ratio = more organic reach)
 * - Account activity (statusesCount as proxy for established account)
 */
export function computeCredibilityScore(author: AuthorMeta): number {
  let score = 0.2; // baseline

  if (author.verified) score += 0.35;

  const followers = author.followersCount ?? 0;
  if (followers >= 1_000_000) score += 0.35;
  else if (followers >= 100_000) score += 0.25;
  else if (followers >= 10_000) score += 0.15;
  else if (followers >= 1_000) score += 0.07;
  else if (followers >= 500) score += 0.03;

  // Follower/following ratio — high ratio suggests organic growth, not follow-for-follow
  const following = author.followingCount ?? 0;
  if (followers > 0 && following > 0) {
    const ratio = followers / following;
    if (ratio >= 10) score += 0.1;
    else if (ratio >= 3) score += 0.05;
  }

  // Established account (has posted a lot, not a brand-new bot)
  const statuses = author.statusesCount ?? 0;
  if (statuses >= 10_000) score += 0.05;
  else if (statuses >= 1_000) score += 0.03;

  return Math.min(1, score);
}

export function computeFeatureScores(tweet: TweetMeta, author: AuthorMeta): FeatureScores {
  return {
    spamScore: computeSpamScore(tweet),
    credibilityScore: computeCredibilityScore(author),
    duplicateGroupId: nearDupHash(tweet.text),
  };
}
