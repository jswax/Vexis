import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/prisma.js';
import { AppError } from '../utils/errors.js';

export async function jobsRoutes(app: FastifyInstance) {
  app.get('/:id', async (req) => {
    const { id } = req.params as { id: string };

    const job = await prisma.tweetIngestionJob.findUnique({ where: { id } });
    if (!job) throw new AppError({ statusCode: 404, code: 'JOB_NOT_FOUND', message: 'Job not found' });

    return job;
  });
}

