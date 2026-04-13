import Fastify from 'fastify';
import { twitterRoutes } from './routes/twitter.routes.js';
import { jobsRoutes } from './routes/jobs.routes.js';
import { AppError } from './utils/errors.js';

export function buildApp() {
  const app = Fastify({
    logger: true,
  });

  app.get('/health', async () => ({ ok: true }));

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof AppError) {
      void reply.status(err.statusCode).send({
        error: err.code,
        message: err.message,
        details: err.details,
      });
      return;
    }

    app.log.error(err);
    void reply.status(500).send({
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Unexpected error',
    });
  });

  void app.register(twitterRoutes, { prefix: '/api/twitter' });
  void app.register(jobsRoutes, { prefix: '/api/jobs' });

  return app;
}

