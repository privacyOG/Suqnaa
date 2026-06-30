import type { FastifyInstance } from 'fastify';
import { requireOperationsUser } from '../auth/require-operations-user.js';

export async function operationsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/operations/health', { preHandler: requireOperationsUser }, async (_request, reply) => {
    return reply.send({ ok: true });
  });
}
