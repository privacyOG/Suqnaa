import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireUser, type AuthenticatedRequest } from '../auth/require-user.js';
import { db } from '../db/index.js';
import { evaluateOrderCancellation } from '../market/order-cancellation.js';
import { NoopChallengeVerifier } from '../security/challenge-verifier.js';
import {
  checkHumanProtectionWithChallenge,
  humanProtectionResponse
} from '../security/human-protection.js';
import { checkRateLimit, rateLimitResponse } from '../security/rate-limit.js';
import { writeSecurityAudit } from '../security/security-audit.js';

const challengeVerifier = new NoopChallengeVerifier();

const orderParams = z.object({
  orderId: z.string().uuid()
});

class OrderCancellationError extends Error {
  constructor(
    readonly statusCode: 404 | 409,
    readonly payload: Record<string, unknown>
  ) {
    super(String(payload.error ?? 'Order cancellation failed'));
  }
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function enforceCancellationLimit(
  request: FastifyRequest,
  reply: FastifyReply,
  accountId: string
): boolean {
  const accountLimit = checkRateLimit({
    group: 'market.orders.cancel.account',
    identifiers: [`account:${accountId}`],
    limit: 20,
    windowMs: 60 * 60 * 1000
  });
  const ipLimit = checkRateLimit({
    group: 'market.orders.cancel.ip',
    identifiers: [`ip:${request.ip}`],
    limit: 80,
    windowMs: 60 * 60 * 1000
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

export async function orderCancellationRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/market/orders/:orderId/cancel',
    { preHandler: requireUser },
    async (request, reply) => {
      const authRequest = request as AuthenticatedRequest;
      const buyerId = authRequest.user.sub;
      const params = orderParams.parse(request.params);

      if (!enforceCancellationLimit(request, reply, buyerId)) {
        return;
      }

      const protection = await checkHumanProtectionWithChallenge(
        {
          action: 'order.cancel',
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
          action: 'order.cancel',
          decision: protection.decision,
          actorId: buyerId,
          targetId: params.orderId,
          ip: request.ip,
          riskScore: protection.riskScore,
          reasonCodes: protection.reasonCodes
        });
        return reply.code(403).send(humanProtectionResponse(protection));
      }

      try {
        const result = await db.transaction().execute(async (transaction) => {
          const order = await transaction.selectFrom('transactions')
            .select([
              'id',
              'offer_id',
              'listing_id',
              'buyer_id',
              'seller_id',
              'status',
              'payment_provider',
              'payment_reference',
              'updated_at'
            ])
            .where('id', '=', params.orderId)
            .executeTakeFirst();

          const [offer, listing] = await Promise.all([
            order?.offer_id
              ? transaction.selectFrom('offers')
                  .select(['id', 'listing_id', 'buyer_id', 'status'])
                  .where('id', '=', order.offer_id)
                  .executeTakeFirst()
              : Promise.resolve(undefined),
            order
              ? transaction.selectFrom('listings')
                  .select(['id', 'seller_id', 'status'])
                  .where('id', '=', order.listing_id)
                  .executeTakeFirst()
              : Promise.resolve(undefined)
          ]);

          const decision = evaluateOrderCancellation({
            actorId: buyerId,
            order: order
              ? {
                  id: order.id,
                  buyerId: order.buyer_id,
                  sellerId: order.seller_id,
                  listingId: order.listing_id,
                  offerId: order.offer_id,
                  status: order.status,
                  paymentProvider: order.payment_provider,
                  paymentReference: order.payment_reference
                }
              : undefined,
            offer: offer
              ? {
                  id: offer.id,
                  listingId: offer.listing_id,
                  buyerId: offer.buyer_id,
                  status: offer.status
                }
              : undefined,
            listing: listing
              ? {
                  id: listing.id,
                  sellerId: listing.seller_id,
                  status: listing.status
                }
              : undefined
          });

          if (!decision.allowed) {
            throw new OrderCancellationError(
              decision.statusCode,
              decision.payload
            );
          }

          if (decision.unchanged && order) {
            return {
              id: order.id,
              status: 'cancelled' as const,
              updatedAt: order.updated_at,
              unchanged: true
            };
          }

          if (!order || !offer || !listing) {
            throw new OrderCancellationError(409, {
              error: 'Order changed; refresh and try again'
            });
          }

          const now = new Date();
          const cancelledOrder = await transaction.updateTable('transactions')
            .set({ status: 'cancelled', updated_at: now })
            .where('id', '=', order.id)
            .where('buyer_id', '=', buyerId)
            .where('status', '=', 'pending')
            .where('payment_provider', 'is', null)
            .where('payment_reference', 'is', null)
            .returning(['id', 'status', 'updated_at'])
            .executeTakeFirst();

          if (!cancelledOrder) {
            throw new OrderCancellationError(409, {
              error: 'Order changed; refresh and try again'
            });
          }

          const cancelledOffer = await transaction.updateTable('offers')
            .set({ status: 'cancelled', updated_at: now })
            .where('id', '=', offer.id)
            .where('listing_id', '=', order.listing_id)
            .where('buyer_id', '=', buyerId)
            .where('status', '=', 'accepted')
            .returning(['id'])
            .executeTakeFirst();

          if (!cancelledOffer) {
            throw new OrderCancellationError(409, {
              error: 'Order offer changed; refresh and try again'
            });
          }

          const releasedListing = await transaction.updateTable('listings')
            .set({ status: 'active', updated_at: now })
            .where('id', '=', listing.id)
            .where('seller_id', '=', order.seller_id)
            .where('status', '=', 'reserved')
            .returning(['id'])
            .executeTakeFirst();

          if (!releasedListing) {
            throw new OrderCancellationError(409, {
              error: 'Order reservation changed; refresh and try again'
            });
          }

          return {
            id: cancelledOrder.id,
            status: 'cancelled' as const,
            updatedAt: cancelledOrder.updated_at,
            unchanged: false
          };
        });

        writeSecurityAudit(app.log, {
          action: 'order.cancel',
          decision: 'allow',
          actorId: buyerId,
          targetId: result.id,
          ip: request.ip,
          riskScore: protection.riskScore,
          reasonCodes: protection.reasonCodes,
          metadata: { unchanged: result.unchanged }
        });

        return reply.send({
          accepted: true,
          order: {
            id: result.id,
            status: result.status,
            updatedAt: result.updatedAt
          },
          cancellation: {
            unchanged: result.unchanged
          }
        });
      } catch (error) {
        if (error instanceof OrderCancellationError) {
          return reply.code(error.statusCode).send(error.payload);
        }
        throw error;
      }
    }
  );
}
