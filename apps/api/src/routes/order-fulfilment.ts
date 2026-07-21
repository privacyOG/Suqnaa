import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireUser, type AuthenticatedRequest } from '../auth/require-user.js';
import { db } from '../db/index.js';
import type {
  FulfilmentStatus,
  PaymentStatus,
  TransactionStatus
} from '../db/types.js';
import {
  decideFulfilmentTransition,
  type FulfilmentAction
} from '../market/fulfilment-transition.js';
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

const fulfilmentBody = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('ready_for_pickup')
  }).strict(),
  z.object({
    action: z.literal('shipped'),
    carrier: z.string().trim().min(2).max(80),
    trackingReference: z.string().trim().min(3).max(160)
  }).strict(),
  z.object({
    action: z.literal('confirm_received')
  }).strict()
]);

class FulfilmentRouteError extends Error {
  constructor(
    readonly statusCode: 404 | 409,
    readonly payload: Record<string, unknown>
  ) {
    super(String(payload.error ?? 'Fulfilment transition failed'));
  }
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function enforceFulfilmentLimit(
  request: FastifyRequest,
  reply: FastifyReply,
  accountId: string
): boolean {
  const accountLimit = checkRateLimit({
    group: 'market.orders.fulfilment.account',
    identifiers: [`account:${accountId}`],
    limit: 30,
    windowMs: 60 * 60 * 1000
  });
  const ipLimit = checkRateLimit({
    group: 'market.orders.fulfilment.ip',
    identifiers: [`ip:${request.ip}`],
    limit: 120,
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

function challengeAction(action: FulfilmentAction): string {
  return action === 'confirm_received'
    ? 'fulfilment.confirm'
    : 'fulfilment.manage';
}

function transitionError(reason: string): Record<string, unknown> {
  switch (reason) {
    case 'actor_not_allowed':
      return { error: 'This participant cannot perform that fulfilment action' };
    case 'order_not_paid':
      return { error: 'Fulfilment requires a paid order' };
    case 'payment_not_held':
      return { error: 'Fulfilment requires held payment status' };
    case 'provider_evidence_missing':
      return { error: 'Verified payment evidence is unavailable' };
    default:
      return { error: 'Fulfilment state changed; refresh and try again' };
  }
}

function fulfilmentResponse(
  orderId: string,
  fulfilment: Record<string, any>,
  unchanged: boolean
) {
  return {
    accepted: true,
    orderId,
    fulfilment: {
      id: fulfilment.id,
      status: fulfilment.status,
      carrier: fulfilment.carrier,
      trackingReference: fulfilment.tracking_reference,
      shippedAt: fulfilment.shipped_at,
      deliveredAt: fulfilment.delivered_at,
      buyerConfirmedAt: fulfilment.buyer_confirmed_at,
      updatedAt: fulfilment.updated_at,
      unchanged
    },
    payment: {
      releaseEnabled: false
    }
  };
}

export async function orderFulfilmentRoutes(
  app: FastifyInstance
): Promise<void> {
  app.post(
    '/market/orders/:orderId/fulfilment',
    { preHandler: requireUser },
    async (request, reply) => {
      const authRequest = request as AuthenticatedRequest;
      const accountId = authRequest.user.sub;
      const params = orderParams.parse(request.params);
      const body = fulfilmentBody.parse(request.body);
      const action = body.action as FulfilmentAction;
      const auditAction = challengeAction(action);

      if (!enforceFulfilmentLimit(request, reply, accountId)) {
        return;
      }

      const protection = await checkHumanProtectionWithChallenge(
        {
          action: auditAction,
          accountId,
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
          action: auditAction,
          decision: protection.decision,
          actorId: accountId,
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
            .select(['id', 'buyer_id', 'seller_id', 'status'])
            .where('id', '=', params.orderId)
            .executeTakeFirst();

          if (
            !order ||
            (order.buyer_id !== accountId && order.seller_id !== accountId)
          ) {
            throw new FulfilmentRouteError(404, { error: 'Order not found' });
          }

          const role = order.buyer_id === accountId ? 'buyer' : 'seller';
          const intent = await transaction.selectFrom('payment_intents')
            .select([
              'id',
              'transaction_id',
              'status',
              'provider',
              'provider_reference'
            ])
            .where('transaction_id', '=', order.id)
            .executeTakeFirst();

          if (!intent) {
            throw new FulfilmentRouteError(409, {
              error: 'Order payment context is unavailable'
            });
          }

          const fulfilment = await transaction.selectFrom('fulfilments')
            .select([
              'id',
              'payment_intent_id',
              'status',
              'carrier',
              'tracking_reference',
              'shipped_at',
              'delivered_at',
              'buyer_confirmed_at',
              'updated_at'
            ])
            .where('payment_intent_id', '=', intent.id)
            .executeTakeFirst();

          if (!fulfilment) {
            throw new FulfilmentRouteError(409, {
              error: 'Order fulfilment context is unavailable'
            });
          }

          const decision = decideFulfilmentTransition({
            role,
            action,
            orderStatus: order.status as TransactionStatus,
            paymentStatus: intent.status as PaymentStatus,
            providerConfigured: Boolean(
              intent.provider && intent.provider_reference
            ),
            fulfilmentStatus: fulfilment.status as FulfilmentStatus
          });

          if (!decision.allowed) {
            throw new FulfilmentRouteError(
              409,
              transitionError(decision.reason)
            );
          }

          if (decision.unchanged) {
            if (
              body.action === 'shipped' &&
              (fulfilment.carrier !== body.carrier ||
                fulfilment.tracking_reference !== body.trackingReference)
            ) {
              throw new FulfilmentRouteError(409, {
                error: 'Stored shipping details differ from this request'
              });
            }
            return {
              fulfilment,
              unchanged: true,
              fromStatus: fulfilment.status,
              toStatus: fulfilment.status
            };
          }

          const now = new Date();
          let updateValues: Record<string, unknown>;
          if (body.action === 'ready_for_pickup') {
            updateValues = {
              status: 'ready_for_pickup',
              updated_at: now
            };
          } else if (body.action === 'shipped') {
            updateValues = {
              status: 'shipped',
              carrier: body.carrier,
              tracking_reference: body.trackingReference,
              shipped_at: now,
              updated_at: now
            };
          } else {
            updateValues = {
              status: 'received_confirmed',
              buyer_confirmed_at: now,
              updated_at: now
            };
          }

          const updated = await transaction.updateTable('fulfilments')
            .set(updateValues)
            .where('id', '=', fulfilment.id)
            .where('payment_intent_id', '=', intent.id)
            .where('status', '=', fulfilment.status)
            .returning([
              'id',
              'payment_intent_id',
              'status',
              'carrier',
              'tracking_reference',
              'shipped_at',
              'delivered_at',
              'buyer_confirmed_at',
              'updated_at'
            ])
            .executeTakeFirst();

          if (!updated) {
            throw new FulfilmentRouteError(409, {
              error: 'Fulfilment state changed; refresh and try again'
            });
          }

          return {
            fulfilment: updated,
            unchanged: false,
            fromStatus: fulfilment.status,
            toStatus: updated.status
          };
        });

        writeSecurityAudit(app.log, {
          action: auditAction,
          decision: 'allow',
          actorId: accountId,
          targetId: params.orderId,
          ip: request.ip,
          riskScore: protection.riskScore,
          reasonCodes: protection.reasonCodes,
          metadata: {
            requestedAction: action,
            fromStatus: result.fromStatus,
            toStatus: result.toStatus,
            unchanged: result.unchanged
          }
        });

        return reply.send(
          fulfilmentResponse(
            params.orderId,
            result.fulfilment,
            result.unchanged
          )
        );
      } catch (error) {
        if (error instanceof FulfilmentRouteError) {
          return reply.code(error.statusCode).send(error.payload);
        }
        throw error;
      }
    }
  );
}
