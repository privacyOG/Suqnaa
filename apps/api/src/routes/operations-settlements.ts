import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireOperationsUser } from '../auth/require-operations-user.js';
import { listSettlementOperations, runSellerSettlementBatch } from '../settlements/seller-settlement-service.js';
import { reconcileSettlementSources } from '../settlements/settlement-source-reconciliation.js';

const listQuery = z.object({
  status: z.enum(['blocked', 'scheduled', 'processing', 'transferred', 'partially_reversed', 'reversed', 'failed']).optional(),
  sellerId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100)
}).strict();

const runBody = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50)
}).strict().default({ limit: 50 });

export async function operationsSettlementRoutes(app: FastifyInstance): Promise<void> {
  app.get('/operations/settlements', { preHandler: requireOperationsUser }, async (request, reply) => {
    const query = listQuery.parse(request.query);
    return reply.send({ settlements: await listSettlementOperations(query) });
  });

  app.post('/operations/settlements/run', { preHandler: requireOperationsUser }, async (request, reply) => {
    const body = runBody.parse(request.body ?? {});
    const sources = await reconcileSettlementSources(body.limit);
    const processed = await runSellerSettlementBatch({ limit: body.limit });
    return reply.send({ sources, ...processed });
  });
}
