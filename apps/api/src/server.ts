import Fastify from 'fastify';
import { env } from './config/env.js';
import { resolveApiErrorResponse } from './config/http-error.js';
import { resolveApiRequestSizeBytes } from './config/request-size.js';
import { resolveWebOrigin } from './config/web-origin.js';
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
import { operationRecordRoutes } from './routes/operation-records.js';
import { operationsRoutes } from './routes/operations.js';
import { orderActivityRoutes } from './routes/order-activity.js';
import { reportRoutes } from './routes/reports.js';
import { sessionManagementRoutes } from './routes/session-management.js';

const app = Fastify({
  logger: env.NODE_ENV !== 'test',
  bodyLimit: resolveApiRequestSizeBytes({
    value: process.env.API_REQUEST_SIZE_BYTES
  })
});

const webOrigin = resolveWebOrigin({
  nodeEnv: env.NODE_ENV,
  webOrigin: process.env.WEB_ORIGIN
});

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

  const mappedError = resolveApiErrorResponse(error);
  if (mappedError) {
    return reply.code(mappedError.statusCode).send(mappedError.body);
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
await app.register(operationsRoutes, { prefix: '/v1' });
await app.register(operationRecordRoutes, { prefix: '/v1' });
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
