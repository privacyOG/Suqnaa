import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireUser, type AuthenticatedRequest } from '../auth/require-user.js';
import { db } from '../db/index.js';
import {
  checkoutPaymentMethods,
  prepareOrderCheckout
} from '../payments/checkout-preparation.js';
import { NoopChallengeVerifier } from '../security/challenge-verifier.js';
import {
  checkHumanProtectionWithChallenge,
  humanProtectionResponse
} from '../security/human-protection.js';
import { checkRateLimit, rateLimitResponse } from '../security/rate-limit.js';
import { writeSecurityAudit } from '../security/security-audit.js';

const challengeVerifier = new NoopChallengeVerifier();
const paymentMethod = z.enum(checkoutPaymentMethods);

const checkoutBody = z.object({
  orderId: z.string().uuid()
}).strict();

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function enforceCheckoutLimit(
  request: FastifyRequest,
  reply: FastifyReply,
  accountId: string
): boolean {
  const accountLimit = checkRateLimit({
    group: 'payment.checkout_prepare.account',
    identifiers: [`account:${accountId}`],
    limit: 60,
    windowMs: 15 * 60 * 1000
  });
  const ipLimit = checkRateLimit({
    group: 'payment.checkout_prepare.ip',
    identifiers: [`ip:${request.ip}`],
    limit: 180,
    windowMs: 15 * 60 * 1000
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

export async function paymentRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/payments/protected-checkout',
    { preHandler: requireUser },
    async (request, reply) => {
      const authRequest = request as AuthenticatedRequest;
      const buyerId = authRequest.user.sub;
      const body = checkoutBody.parse(request.body);

      if (!enforceCheckoutLimit(request, reply, buyerId)) {
        return;
      }

      const order = await db.selectFrom('transactions')
        .select([
          'id',
          'listing_id',
          'buyer_id',
          'seller_id',
          'amount',
          'currency_code',
          'status',
          'payment_method',
          'payment_provider',
          'payment_reference'
        ])
        .where('id', '=', body.orderId)
        .executeTakeFirst();

      if (!order || order.buyer_id !== buyerId) {
        return reply.code(404).send({ error: 'Order not found' });
      }

      if (order.status !== 'pending') {
        return reply.code(409).send({
          error: 'Checkout preparation requires a pending order',
          currentStatus: order.status
        });
      }

      if (order.payment_provider || order.payment_reference) {
        return reply.code(409).send({
          error: 'Order payment is already configured'
        });
      }

      const parsedPaymentMethod = paymentMethod.safeParse(order.payment_method);
      if (!parsedPaymentMethod.success) {
        return reply.code(409).send({
          error: 'Order payment method is unavailable'
        });
      }

      const protection = await checkHumanProtectionWithChallenge(
        {
          action: 'payment.checkout_prepare',
          accountId: buyerId,
          ip: request.ip,
          userAgent: firstHeader(request.headers['user-agent']),
          challengeResponse: firstHeader(
            request.headers['x-suqnaa-human-check']
          )
        },
        challengeVerifier
      );

      if (protection.decision !== 'allow') {
        writeSecurityAudit(app.log, {
          action: 'payment.checkout_prepare',
          decision: protection.decision,
          actorId: buyerId,
          targetId: order.id,
          ip: request.ip,
          riskScore: protection.riskScore,
          reasonCodes: protection.reasonCodes
        });
        return reply.code(403).send(humanProtectionResponse(protection));
      }

      const checkout = prepareOrderCheckout({
        id: String(order.id),
        listingId: String(order.listing_id),
        amount: order.amount as string | number,
        currencyCode: String(order.currency_code).toUpperCase(),
        status: 'pending',
        paymentMethod: parsedPaymentMethod.data
      });

      writeSecurityAudit(app.log, {
        action: 'payment.checkout_prepare',
        decision: 'allow',
        actorId: buyerId,
        targetId: order.id,
        ip: request.ip,
        riskScore: protection.riskScore,
        reasonCodes: protection.reasonCodes,
        metadata: {
          listingId: order.listing_id,
          paymentMethod: parsedPaymentMethod.data
        }
      });

      return reply.send(checkout);
    }
  );
}
