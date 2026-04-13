import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { AppError } from '../utils/errors.js';
import { IngestionJobProcessor } from '../modules/jobs/ingestionJob.processor.js';
import { OutcomeJobProcessor } from '../modules/jobs/outcomeJob.processor.js';
import { RecomputeJobProcessor } from '../modules/jobs/recomputeJob.processor.js';
import { apifyTweetScraperInputSchema } from '../modules/twitter-ingestion/twitterIngestion.types.js';
import { ManualImportService } from '../modules/twitter-ingestion/manualImportService.js';

export async function twitterRoutes(app: FastifyInstance) {
  const ingestion = new IngestionJobProcessor();
  const outcome = new OutcomeJobProcessor();
  const recompute = new RecomputeJobProcessor();
  const manualImport = new ManualImportService();

  app.post('/ingest', async (req) => {
    const body = apifyTweetScraperInputSchema.parse(req.body);
    return ingestion.run(body, { sourceLabel: 'api:/api/twitter/ingest' });
  });

  /**
   * POST /api/twitter/import
   *
   * Import tweets without Apify. Accepts:
   *   - Array of tweet objects (Apify or flat format)
   *   - Twitter API v2 response { data: [], includes: { users: [] } }
   *   - Single tweet object
   *
   * Body: { tweets: <array|object>, source?: string }
   */
  app.post('/import', async (req) => {
    const body = z
      .object({
        tweets: z.unknown(),
        source: z.string().optional(),
      })
      .parse(req.body);
    return manualImport.import(body.tweets, { sourceLabel: body.source ?? 'api:/api/twitter/import' });
  });

  app.post('/compute-outcomes', async (req) => {
    const body = z.object({ limit: z.number().int().positive().max(500).optional() }).parse(req.body ?? {});
    return outcome.computeForUnprocessedTweets({ limit: body.limit });
  });

  app.post('/recompute-labels', async (req) => {
    const body = z.object({ limit: z.number().int().positive().max(2000).optional() }).parse(req.body ?? {});
    return recompute.run({ limit: body.limit });
  });

  app.get('/tweets/:id', async (req) => {
    const { id } = req.params as { id: string };
    const tweet = await prisma.tweet.findUnique({
      where: { id },
      include: {
        author: true,
        assetMatches: { orderBy: { confidence: 'desc' } },
        marketSnapshots: true,
        outcomes: { orderBy: { horizon: 'asc' } },
        features: true,
      },
    });
    if (!tweet) throw new AppError({ statusCode: 404, code: 'TWEET_NOT_FOUND', message: 'Tweet not found' });
    return tweet;
  });
}

