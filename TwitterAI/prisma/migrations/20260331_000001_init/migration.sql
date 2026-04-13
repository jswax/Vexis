-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TweetIngestionJobStatus" AS ENUM ('CREATED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('STOCK', 'ETF', 'CRYPTO', 'INDEX', 'FX', 'COMMODITY', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "OutcomeHorizon" AS ENUM ('M5', 'M15', 'H1', 'H4', 'D1');

-- CreateEnum
CREATE TYPE "DirectionLabel" AS ENUM ('BULLISH', 'BEARISH', 'NEUTRAL');

-- CreateTable
CREATE TABLE "TweetIngestionJob" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "TweetIngestionJobStatus" NOT NULL,
    "actorId" TEXT NOT NULL,
    "apifyRunId" TEXT,
    "queryConfigJson" JSONB NOT NULL,
    "itemsRequested" INTEGER,
    "itemsReceived" INTEGER,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TweetIngestionJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TwitterAuthor" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL,
    "followersCount" INTEGER,
    "followingCount" INTEGER,
    "favouritesCount" INTEGER,
    "statusesCount" INTEGER,
    "rawJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TwitterAuthor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tweet" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "rawJson" JSONB NOT NULL,
    "language" TEXT,
    "createdAtTwitter" TIMESTAMP(3) NOT NULL,
    "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceQuery" TEXT,
    "sourceQueryType" TEXT,
    "matchedSearchTerm" TEXT,
    "likeCount" INTEGER,
    "retweetCount" INTEGER,
    "replyCount" INTEGER,
    "quoteCount" INTEGER,
    "bookmarkCount" INTEGER,
    "viewCount" INTEGER,
    "isReply" BOOLEAN NOT NULL,
    "isRetweet" BOOLEAN NOT NULL,
    "isQuote" BOOLEAN NOT NULL,
    "hasImages" BOOLEAN NOT NULL,
    "hasVideo" BOOLEAN NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tweet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TweetAssetMatch" (
    "id" TEXT NOT NULL,
    "tweetId" TEXT NOT NULL,
    "assetType" "AssetType" NOT NULL,
    "ticker" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "matchMethod" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TweetAssetMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketSnapshot" (
    "id" TEXT NOT NULL,
    "tweetId" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "assetType" "AssetType" NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "volume" DOUBLE PRECISION,
    "vwap" DOUBLE PRECISION,
    "rsi" DOUBLE PRECISION,
    "macd" DOUBLE PRECISION,
    "atr" DOUBLE PRECISION,
    "realizedVolatility" DOUBLE PRECISION,
    "benchmarkTicker" TEXT,
    "benchmarkPrice" DOUBLE PRECISION,
    "marketOpenFlag" BOOLEAN NOT NULL,
    "sessionType" TEXT,
    "rawJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TweetOutcome" (
    "id" TEXT NOT NULL,
    "tweetId" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "horizon" "OutcomeHorizon" NOT NULL,
    "priceAtTweet" DOUBLE PRECISION NOT NULL,
    "priceAtHorizon" DOUBLE PRECISION NOT NULL,
    "rawReturn" DOUBLE PRECISION NOT NULL,
    "benchmarkReturn" DOUBLE PRECISION,
    "excessReturn" DOUBLE PRECISION,
    "expectedVolatility" DOUBLE PRECISION,
    "volAdjustedReturn" DOUBLE PRECISION,
    "impactScore" INTEGER NOT NULL,
    "directionLabel" "DirectionLabel" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TweetOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TweetFeatures" (
    "id" TEXT NOT NULL,
    "tweetId" TEXT NOT NULL,
    "sentimentScore" DOUBLE PRECISION,
    "credibilityScore" DOUBLE PRECISION,
    "spamScore" DOUBLE PRECISION,
    "duplicateGroupId" TEXT,
    "embeddingModel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TweetFeatures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetAlias" (
    "id" TEXT NOT NULL,
    "assetType" "AssetType" NOT NULL,
    "ticker" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "matchMethod" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetAlias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TweetIngestionJob_status_createdAt_idx" ON "TweetIngestionJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "TweetIngestionJob_apifyRunId_idx" ON "TweetIngestionJob"("apifyRunId");

-- CreateIndex
CREATE UNIQUE INDEX "TwitterAuthor_externalId_key" ON "TwitterAuthor"("externalId");

-- CreateIndex
CREATE INDEX "TwitterAuthor_username_idx" ON "TwitterAuthor"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Tweet_externalId_key" ON "Tweet"("externalId");

-- CreateIndex
CREATE INDEX "Tweet_createdAtTwitter_idx" ON "Tweet"("createdAtTwitter");

-- CreateIndex
CREATE INDEX "Tweet_authorId_createdAtTwitter_idx" ON "Tweet"("authorId", "createdAtTwitter");

-- CreateIndex
CREATE INDEX "TweetAssetMatch_tweetId_idx" ON "TweetAssetMatch"("tweetId");

-- CreateIndex
CREATE INDEX "TweetAssetMatch_ticker_idx" ON "TweetAssetMatch"("ticker");

-- CreateIndex
CREATE UNIQUE INDEX "TweetAssetMatch_tweetId_ticker_matchMethod_key" ON "TweetAssetMatch"("tweetId", "ticker", "matchMethod");

-- CreateIndex
CREATE INDEX "MarketSnapshot_tweetId_idx" ON "MarketSnapshot"("tweetId");

-- CreateIndex
CREATE INDEX "MarketSnapshot_ticker_idx" ON "MarketSnapshot"("ticker");

-- CreateIndex
CREATE UNIQUE INDEX "MarketSnapshot_tweetId_ticker_key" ON "MarketSnapshot"("tweetId", "ticker");

-- CreateIndex
CREATE INDEX "TweetOutcome_tweetId_idx" ON "TweetOutcome"("tweetId");

-- CreateIndex
CREATE INDEX "TweetOutcome_ticker_idx" ON "TweetOutcome"("ticker");

-- CreateIndex
CREATE INDEX "TweetOutcome_horizon_idx" ON "TweetOutcome"("horizon");

-- CreateIndex
CREATE INDEX "TweetOutcome_directionLabel_idx" ON "TweetOutcome"("directionLabel");

-- CreateIndex
CREATE UNIQUE INDEX "TweetOutcome_tweetId_ticker_horizon_key" ON "TweetOutcome"("tweetId", "ticker", "horizon");

-- CreateIndex
CREATE UNIQUE INDEX "TweetFeatures_tweetId_key" ON "TweetFeatures"("tweetId");

-- CreateIndex
CREATE INDEX "TweetFeatures_duplicateGroupId_idx" ON "TweetFeatures"("duplicateGroupId");

-- CreateIndex
CREATE INDEX "AssetAlias_ticker_idx" ON "AssetAlias"("ticker");

-- CreateIndex
CREATE INDEX "AssetAlias_alias_idx" ON "AssetAlias"("alias");

-- CreateIndex
CREATE UNIQUE INDEX "AssetAlias_assetType_alias_key" ON "AssetAlias"("assetType", "alias");

-- AddForeignKey
ALTER TABLE "Tweet" ADD CONSTRAINT "Tweet_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "TwitterAuthor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TweetAssetMatch" ADD CONSTRAINT "TweetAssetMatch_tweetId_fkey" FOREIGN KEY ("tweetId") REFERENCES "Tweet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketSnapshot" ADD CONSTRAINT "MarketSnapshot_tweetId_fkey" FOREIGN KEY ("tweetId") REFERENCES "Tweet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TweetOutcome" ADD CONSTRAINT "TweetOutcome_tweetId_fkey" FOREIGN KEY ("tweetId") REFERENCES "Tweet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TweetFeatures" ADD CONSTRAINT "TweetFeatures_tweetId_fkey" FOREIGN KEY ("tweetId") REFERENCES "Tweet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

