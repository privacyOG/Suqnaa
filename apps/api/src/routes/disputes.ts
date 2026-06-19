import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const bodySchema = z.object({
  paymentIntentId: z.string().uuid(),
  openedByUserId: z.string().uuid(),
  reason: z.string().trim().min(3).max(120),
  summary: z.string().trim().max(2000).optional()
});

export async function disputeRoutes(app: FastifyInstance): Promise<void> {
  app.post('/disputes', async (request, reply) => {
    const body = bodySchema.parse(request.body);

    return reply.code(202).send({
      accepted: true,
      dispute: body,
      status: 'review_required'
    });
  });
}
