import Fastify from 'fastify';
import { env } from './config/env.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { listingRoutes } from './routes/listings.js';

const app = Fastify({
  logger: env.NODE_ENV !== 'test'
});

app.setErrorHandler((error, _request, reply) => {
  app.log.error(error);

  if (error.name === 'ZodError') {
    return reply.code(400).send({ error: 'Invalid request payload' });
  }

  return reply.code(500).send({ error: 'Internal server error' });
});

await app.register(healthRoutes, { prefix: '/v1' });
await app.register(authRoutes, { prefix: '/v1' });
await app.register(listingRoutes, { prefix: '/v1' });

try {
  await app.listen({ host: env.API_HOST, port: env.API_PORT });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
