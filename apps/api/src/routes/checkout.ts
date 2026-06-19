import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const checkoutBody = z.object({
  buyerId: z.string().uuid(),
  sellerId: z.string().uuid(),
  listingId: z.string().uuid().optional(),
  auctionId: z.string().uuid().optional(),
  amount: z.number().positive(),
  currencyCode: z.string().length(3),
  rail: z.enum(['card', 'bank_transfer', 'wallet', 'crypto_xmr', 'crypto_other'])
}).refine((value) => value.buyerId !== value.sellerId, 'Buyer and seller must be different users');

export async function checkoutRoutes(app: FastifyInstance): Promise<void> {
  app.post('/checkout/protected', async (request, reply) => {
    const body = checkoutBody.parse(request.body);

    return reply.code(202).send({
      accepted: true,
      status: 'configuration_required',
      checkout: body,
      releaseModel: 'hold_until_fulfilment_or_review'
    });
  });
}
