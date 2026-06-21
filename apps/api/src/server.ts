import Fastify from 'fastify';
import { env } from './config/env.js';
import { accountRoutes } from './routes/account.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { assistantRoutes } from './routes/assistant.js';
import { categoryRoutes } from './routes/categories.js';
import { listingRoutes } from './routes/listings.js';
import { marketActionRoutes } from './routes/market-actions.js';
import { messageRoutes } from './routes/messages.js';
import { sessionManagementRoutes } from './routes/session-management.js';

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
await app.register(accountRoutes, { prefix: '/v1' });
await app.register(authRoutes, { prefix: '/v1' });
await app.register(assistantRoutes, { prefix: '/v1' });
await app.register(categoryRoutes, { prefix: '/v1' });
await app.register(listingRoutes, { prefix: '/v1' });
await app.register(marketActionRoutes, { prefix: '/v1' });
await app.register(messageRoutes, { prefix: '/v1' });
await app.register(sessionManagementRoutes, { prefix: '/v1' });

try {
  await app.listen({ host: env.API_HOST, port: env.API_PORT });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
