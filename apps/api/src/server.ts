import Fastify from 'fastify';
import { env } from './config/env.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { assistantRoutes } from './routes/assistant.js';
import { auctionRoutes } from './routes/auctions.js';
import { categoryRoutes } from './routes/categories.js';
import { checkoutRoutes } from './routes/checkout.js';
import { disputeRoutes } from './routes/disputes.js';
import { listingRoutes } from './routes/listings.js';
import { verificationRoutes } from './routes/verification.js';

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
await app.register(assistantRoutes, { prefix: '/v1' });
await app.register(auctionRoutes, { prefix: '/v1' });
await app.register(categoryRoutes, { prefix: '/v1' });
await app.register(checkoutRoutes, { prefix: '/v1' });
await app.register(disputeRoutes, { prefix: '/v1' });
await app.register(listingRoutes, { prefix: '/v1' });
await app.register(verificationRoutes, { prefix: '/v1' });

try {
  await app.listen({ host: env.API_HOST, port: env.API_PORT });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
