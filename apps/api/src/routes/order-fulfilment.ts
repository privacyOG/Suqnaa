import { randomUUID } from 'node:crypto';
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
import { rateLimitResponse } from '../security/rate-limit.js';
import { writeSecurityAudit } from '../security/security-audit.js';
import { checkSharedRateLimit } from '../security/shared-rate-limit.js';

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
    trackingReference: z.string().trim().min(3).max(160),
    trackingUrl: z.string().trim().url().max(1000).optional()
  }).strict(),
  z.object({
    action: z.literal('confirm_received')
  }).strict()
]);

class FulfilmentRouteError extends Error {
  constructor(
    readonly statusCode: 400 | 404 | 409,
    readonly payload: Record<string, unknown>
  ) {
    super(String(payload.error ?? 'Fulfilment transition failed'));
  }
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function enforceFulfilmentLimit(
  request: FastifyRequest,
  reply: FastifyReply,
  accountId: string
): Promise<boolean> {
  const accountLimit = await checkSharedRateLimit({
    group: 'market.orders.fulfilment.account',
    identifiers: [`account:${accountId}`],
    limit: 30,
    windowMs: 60 * 60 * 1000
  });
  const ipLimit = await checkSharedRateLimit({
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

  if (!limited) return true;
  reply.header('Retry-After', String(limited.retryAfterSeconds));
  reply.code(429).send(rateLimitResponse(limited));
  return false;
}

function challengeAction(action: FulfilmentAction): string {
  return action === 'confirm_received'
    ? 'fulfilment.confirm'
    : 'fulfilment.manage';
}

function safeTrackingUrl(value: string | undefined): string | null {
  if (!value) return null;
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !parsed.hostname) {
    throw new FulfilmentRouteError(400, { error: 'Tracking link must use a public HTTPS URL' });
  }
  return parsed.toString();
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
      trackingUrl: fulfilment.tracking_url,
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

async function appendTimeline(transaction: any, input: {
  orderId: string;
  actorId: string;
  eventType: 'ready_for_pickup' | 'shipped' | 'received_confirmed';
  details?: Record<string, unknown>;
  now: Date;
}) {
  await transaction.insertInto('order_timeline_events').values({
    order_id: input.orderId,
    actor_id: input.actorId,
    event_key: `${input.eventType}:${randomUUID()}`,
    event_type: input.eventType,
    details: JSON.stringify(input.details ?? {}),
    occurred_at: input.now,
    created_at: input.now
  }).execute();
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
      const trackingUrl = body.action === 'shipped' ? safeTrackingUrl(body.trackingUrl) : null;

      if (!await enforceFulfilmentLimit(request, reply, accountId)) return;

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

          if (!order || (order.buyer_id !== accountId && order.seller_id !== accountId)) {
            throw new FulfilmentRouteError(404, { error: 'Order not found' });
          }

          const role = order.buyer_id === accountId ? 'buyer' : 'seller';
          const intent = await transaction.selectFrom('payment_intents')
            .select(['id', 'transaction_id', 'status', 'provider', 'provider_reference'])
            .where('transaction_id', '=', order.id)
            .executeTakeFirst();

          if (!intent) {
            throw new FulfilmentRouteError(409, { error: 'Order payment context is unavailable' });
          }

          const fulfilment = await transaction.selectFrom('fulfilments')
            .select([
              'id', 'payment_intent_id', 'status', 'carrier', 'tracking_reference', 'tracking_url',
              'shipped_at', 'delivered_at', 'buyer_confirmed_at', 'updated_at'
            ])
            .where('payment_intent_id', '=', intent.id)
            .executeTakeFirst();

          if (!fulfilment) {
            throw new FulfilmentRouteError(409, { error: 'Order fulfilment context is unavailable' });
          }

          const details = await transaction.selectFrom('order_fulfilment_details')
            .selectAll()
            .where('order_id', '=', order.id)
            .executeTakeFirst();

          if (!details) {
            throw new FulfilmentRouteError(409, { error: 'Buyer must select delivery or pickup before fulfilment' });
          }
          if (body.action === 'ready_for_pickup') {
            if (details.mode !== 'pickup') {
              throw new FulfilmentRouteError(409, { error: 'This order is configured for shipping' });
            }
            if (!details.pickup_address_line1 || !details.pickup_locality || !details.pickup_region || !details.pickup_postal_code) {
              throw new FulfilmentRouteError(409, { error: 'Pickup location must be disclosed before marking ready' });
            }
          }
          if (body.action === 'shipped') {
            if (details.mode !== 'shipping') {
              throw new FulfilmentRouteError(409, { error: 'This order is configured for pickup' });
            }
            if (!details.address_line1 || !details.locality || !details.region || !details.postal_code) {
              throw new FulfilmentRouteError(409, { error: 'Shipping address is unavailable' });
            }
          }

          const decision = decideFulfilmentTransition({
            role,
            action,
            orderStatus: order.status as TransactionStatus,
            paymentStatus: intent.status as PaymentStatus,
            providerConfigured: Boolean(intent.provider && intent.provider_reference),
            fulfilmentStatus: fulfilment.status as FulfilmentStatus
          });

          if (!decision.allowed) {
            throw new FulfilmentRouteError(409, transitionError(decision.reason));
          }

          if (decision.unchanged) {
            if (
              body.action === 'shipped' &&
              (fulfilment.carrier !== body.carrier ||
                fulfilment.tracking_reference !== body.trackingReference ||
                (fulfilment.tracking_url ?? null) !== trackingUrl)
            ) {
              throw new FulfilmentRouteError(409, { error: 'Stored shipping details differ from this request' });
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
            updateValues = { status: 'ready_for_pickup', updated_at: now };
          } else if (body.action === 'shipped') {
            updateValues = {
              status: 'shipped',
              carrier: body.carrier,
              tracking_reference: body.trackingReference,
              tracking_url: trackingUrl,
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
              'id', 'payment_intent_id', 'status', 'carrier', 'tracking_reference', 'tracking_url',
              'shipped_at', 'delivered_at', 'buyer_confirmed_at', 'updated_at'
            ])
            .executeTakeFirst();

          if (!updated) {
            throw new FulfilmentRouteError(409, { error: 'Fulfilment state changed; refresh and try again' });
          }

          if (body.action === 'ready_for_pickup') {
            await appendTimeline(transaction, {
              orderId: order.id,
              actorId: accountId,
              eventType: 'ready_for_pickup',
              details: { mode: 'pickup' },
              now
            });
          } else if (body.action === 'shipped') {
            await transaction.insertInto('order_fulfilment_evidence').values({
              order_id: order.id,
              fulfilment_id: fulfilment.id,
              actor_id: accountId,
              evidence_type: 'tracking_declared',
              reference: body.trackingReference,
              evidence_url: trackingUrl,
              note: null,
              occurred_at: now,
              created_at: now
            }).execute();
            await appendTimeline(transaction, {
              orderId: order.id,
              actorId: accountId,
              eventType: 'shipped',
              details: { carrier: body.carrier, trackingLinkAvailable: Boolean(trackingUrl) },
              now
            });
          } else {
            await appendTimeline(transaction, {
              orderId: order.id,
              actorId: accountId,
              eventType: 'received_confirmed',
              details: {},
              now
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

        return reply.send(fulfilmentResponse(params.orderId, result.fulfilment, result.unchanged));
      } catch (error) {
        if (error instanceof FulfilmentRouteError) {
          return reply.code(error.statusCode).send(error.payload);
        }
        throw error;
      }
    }
  );
}
