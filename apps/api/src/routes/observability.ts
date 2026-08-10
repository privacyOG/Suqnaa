import type { FastifyInstance } from 'fastify';
import { httpMetrics } from '../observability/http-metrics.js';
import {
  metricsAuthorizationAllowed,
  resolveMetricsAccessToken
} from '../observability/metrics-access.js';

export async function observabilityRoutes(app: FastifyInstance): Promise<void> {
  const expectedToken = resolveMetricsAccessToken({
    nodeEnv: process.env.NODE_ENV,
    token: process.env.OBSERVABILITY_METRICS_TOKEN
  });

  app.get('/metrics', async (request, reply) => {
    if (!metricsAuthorizationAllowed(request.headers.authorization, expectedToken)) {
      reply.header('WWW-Authenticate', 'Bearer');
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    reply.header('Cache-Control', 'no-store');
    reply.header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    return reply.send(httpMetrics.renderPrometheus());
  });
}
