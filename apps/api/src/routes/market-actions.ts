import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser, type AuthenticatedRequest } from '../auth/require-user.js';

const timedSaleBody = z.object({
  listingId: z.string().uuid(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  openingAmount: z.number().nonnegative(),
  minimumStep: z.number().positive().default(1)
});

const offerBody = z.object({
  marketEventId: z.string().uuid(),
  amount: z.number().positive(),
  currencyCode: z.string().length(3)
});

const orderBody = z.object({
  counterpartyId: z.string().uuid(),
  listingId: z.string().uuid().optional(),
  marketEventId: z.string().uuid().optional(),
  amount: z.number().positive(),
  currencyCode: z.string().length(3),
  paymentMethod: z.enum(['card', 'bank_transfer', 'wallet', 'xmr'])
});

const reviewBody = z.object({
  paymentRecordId: z.string().uuid(),
  reason: z.string().trim().min(3).max(120),
  summary: z.string().trim().max(2000).optional()
});

const identityBody = z.object({
  level: z.enum(['basic', 'seller', 'high_value_seller', 'business']),
  countryCode: z.string().length(2)
});

export async function marketActionRoutes(app: FastifyInstance): Promise<void> {
  app.post('/market/timed-sale', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const body = timedSaleBody.parse(request.body);

    return reply.code(202).send({ accepted: true, actorId: authRequest.user.sub, request: body });
  });

  app.post('/market/offers', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const body = offerBody.parse(request.body);

    return reply.code(202).send({ accepted: true, actorId: authRequest.user.sub, request: body });
  });

  app.post('/market/orders', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const body = orderBody.parse(request.body);

    if (body.counterpartyId === authRequest.user.sub) {
      return reply.code(400).send({ error: 'Counterparty must be different' });
    }

    return reply.code(202).send({ accepted: true, actorId: authRequest.user.sub, request: body });
  });

  app.post('/market/reviews', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const body = reviewBody.parse(request.body);

    return reply.code(202).send({ accepted: true, actorId: authRequest.user.sub, request: body });
  });

  app.post('/market/identity-checks', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const body = identityBody.parse(request.body);

    return reply.code(202).send({ accepted: true, actorId: authRequest.user.sub, request: body });
  });
}
