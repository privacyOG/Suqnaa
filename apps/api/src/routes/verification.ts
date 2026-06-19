import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const startVerificationBody = z.object({
  userId: z.string().uuid(),
  level: z.enum(['basic', 'seller', 'high_value_seller', 'business']),
  countryCode: z.string().length(2)
});

export async function verificationRoutes(app: FastifyInstance): Promise<void> {
  app.post('/verification/start', async (request, reply) => {
    const body = startVerificationBody.parse(request.body);

    return reply.code(202).send({
      accepted: true,
      verification: body,
      status: 'provider_configuration_required'
    });
  });
}
