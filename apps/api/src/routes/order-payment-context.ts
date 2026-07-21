import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireUser, type AuthenticatedRequest } from '../auth/require-user.js';
import { db } from '../db/index.js';
import type { TransactionStatus } from '../db/types.js';
import {
  assertOrderPaymentContextMatches,
  orderPaymentMethods,
  OrderPaymentContextError,
  presentOrderPaymentContext
} from '../payments/order-payment-context.js';
import { checkRateLimit, rateLimitResponse } from '../security/rate-limit.js';

const orderParams = z.object({
  orderId: z.string().uuid()
});

const paymentMethod = z.enum(orderPaymentMethods);

function enforceReadLimit(
  request: FastifyRequest,
  reply: FastifyReply,
  accountId: string
): boolean {
  const accountLimit = checkRateLimit({
    group: 'market.orders.payment_context.account',
    identifiers: [`account:${accountId}`],
    limit: 120,
    windowMs: 5 * 60 * 1000
  });
  const ipLimit = checkRateLimit({
    group: 'market.orders.payment_context.ip',
    identifiers: [`ip:${request.ip}`],
    limit: 300,
    windowMs: 5 * 60 * 1000
  });
  const limited = !accountLimit.allowed
    ? accountLimit
    : !ipLimit.allowed
      ? ipLimit
      : undefined;

  if (!limited) {
    return true;
  }

  reply.header('Retry-After', String(limited.retryAfterSeconds));
  reply.code(429).send(rateLimitResponse(limited));
  return false;
}

export async function orderPaymentContextRoutes(
  app: FastifyInstance
): Promise<void> {
  app.get(
    '/market/orders/:orderId/payment-context',
    { preHandler: requireUser },
    async (request, reply) => {
      const authRequest = request as AuthenticatedRequest;
      const accountId = authRequest.user.sub;
      const params = orderParams.parse(request.params);

      if (!enforceReadLimit(request, reply, accountId)) {
        return;
      }

      const order = await db.selectFrom('transactions')
        .select([
          'id',
          'buyer_id',
          'seller_id',
          'listing_id',
          'amount',
          'currency_code',
          'status',
          'payment_method'
        ])
        .where('id', '=', params.orderId)
        .executeTakeFirst();

      if (
        !order ||
        (order.buyer_id !== accountId && order.seller_id !== accountId)
      ) {
        return reply.code(404).send({ error: 'Order not found' });
      }

      const parsedPaymentMethod = paymentMethod.safeParse(order.payment_method);
      if (!parsedPaymentMethod.success) {
        return reply.code(409).send({
          error: 'Order payment context is unavailable'
        });
      }

      const intent = await db.selectFrom('payment_intents')
        .select([
          'id',
          'transaction_id',
          'buyer_id',
          'seller_id',
          'listing_id',
          'rail',
          'status',
          'amount',
          'currency_code',
          'provider',
          'provider_reference',
          'expires_at',
          'created_at',
          'updated_at'
        ])
        .where('transaction_id', '=', order.id)
        .executeTakeFirst();

      if (!intent) {
        return reply.code(409).send({
          error: 'Order payment context is unavailable'
        });
      }

      try {
        assertOrderPaymentContextMatches(intent, {
          id: String(order.id),
          buyerId: String(order.buyer_id),
          sellerId: String(order.seller_id),
          listingId: String(order.listing_id),
          amount: order.amount as string | number,
          currencyCode: String(order.currency_code),
          status: order.status as TransactionStatus,
          paymentMethod: parsedPaymentMethod.data
        });
      } catch (error) {
        if (error instanceof OrderPaymentContextError) {
          return reply.code(409).send({
            error: 'Order payment context is inconsistent'
          });
        }
        throw error;
      }

      const fulfilment = await db.selectFrom('fulfilments')
        .select(['id', 'payment_intent_id', 'status', 'created_at', 'updated_at'])
        .where('payment_intent_id', '=', intent.id)
        .executeTakeFirst();

      if (!fulfilment || fulfilment.payment_intent_id !== intent.id) {
        return reply.code(409).send({
          error: 'Order fulfilment context is unavailable'
        });
      }

      return reply.send({
        orderId: order.id,
        paymentContext: presentOrderPaymentContext(intent, fulfilment)
      });
    }
  );
}
