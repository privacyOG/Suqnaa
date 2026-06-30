import Fastify from 'fastify';
import { env } from './config/env.js';
import { accountRoutes } from './routes/account.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { assistantRoutes } from './routes/assistant.js';
import { categoryRoutes } from './routes/categories.js';
import { challengeRoutes } from './routes/challenge.js';
import { listingRoutes } from './routes/listings.js';
import { marketActionRoutes } from './routes/market-actions.js';
import { messageRoutes } from './routes/messages.js';
import { offerWorkflowRoutes } from './routes/offer-workflow.js';
import { orderActivityRoutes } from './routes/order-activity.js';
import { reportRoutes } from './routes/reports.js';
import { sessionManagementRoutes } from './routes/session-management.js';

const app = Fastify({
  logger: env.NODE_ENV !== 'test'
});

const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';

app.addHook('onRequest', async (request, reply) => {
  const origin = request.headers.origin;

  if (origin === webOrigin) {
    reply.header('Access-Control-Allow-Origin', origin);
    reply.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    reply.header(
      'Access-Control-Allow-Headers',
      'content-type, authorization, x-suqnaa-human-check'
    );
    reply.header('Access-Control-Max-Age', '600');
    reply.header('Vary', 'Origin');
  }

  if (request.method === 'OPTIONS') {
    if (origin !== webOrigin) {
      return reply.code(403).send({ error: 'Origin not allowed' });
    }

    return reply.code(204).send();
  }
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
await app.register(challengeRoutes, { prefix: '/v1' });
await app.register(listingRoutes, { prefix: '/v1' });
await app.register(marketActionRoutes, { prefix: '/v1' });
await app.register(offerWorkflowRoutes, { prefix: '/v1' });
await app.register(orderActivityRoutes, { prefix: '/v1' });
await app.register(messageRoutes, { prefix: '/v1' });
await app.register(reportRoutes, { prefix: '/v1' });
await app.register(sessionManagementRoutes, { prefix: '/v1' });

try {
  await app.listen({ host: env.API_HOST, port: env.API_PORT });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
