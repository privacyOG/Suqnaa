import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { env } from '../config/env.js';
import { resolvePaymentEventConfiguration } from '../config/payment-event-config.js';
import { db } from '../db/index.js';
import type { PaymentStatus, TransactionStatus } from '../db/types.js';
import {
  assertOrderPaymentContextMatches,
  orderPaymentMethods,
  OrderPaymentContextError
} from '../payments/order-payment-context.js';
import {
  decidePaymentHeldTransition,
  normalizePaymentAmount,
  normalizePaymentCurrency,
  paymentEventFingerprint,
  paymentEventHeaderSchema,
  paymentHeldEventSchema,
  verifyPaymentEventSignature,
  type PaymentEventHeaders,
  type PaymentHeldEvent
} from '../payments/provider-event.js';
import { checkRateLimit, rateLimitResponse } from '../security/rate-limit.js';
import { writeSecurityAudit } from '../security/security-audit.js';

const eventConfiguration = resolvePaymentEventConfiguration({
  provider: env.PAYMENT_EVENT_PROVIDER,
  signingSecret: env.PAYMENT_EVENT_SIGNING_SECRET,
  maxAgeSeconds: env.PAYMENT_EVENT_MAX_AGE_SECONDS
});
const paymentMethod = z.enum(orderPaymentMethods);

class PaymentProviderEventError extends Error {
  constructor(
    readonly statusCode: 409,
    readonly payload: Record<string, unknown>,
    readonly reasonCode: string
  ) {
    super(String(payload.error ?? 'Payment provider event failed'));
  }
}

function firstHeader(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

function providerEventHeaders(request: FastifyRequest): PaymentEventHeaders {
  return paymentEventHeaderSchema.parse({
    provider: firstHeader(request.headers['x-suqnaa-payment-provider']),
    eventId: firstHeader(request.headers['x-suqnaa-payment-event-id']),
    timestamp: firstHeader(request.headers['x-suqnaa-payment-event-timestamp']),
    signature: firstHeader(request.headers['x-suqnaa-payment-signature'])
  });
}

function enforceProviderEventLimit(
  request: FastifyRequest,
  reply: FastifyReply
): boolean {
  const limit = checkRateLimit({
    group: 'payment.provider_event.ip',
    identifiers: [`ip:${request.ip}`],
    limit: 300,
    windowMs: 5 * 60 * 1000
  });
  if (limit.allowed) {
    return true;
  }

  reply.header('Retry-After', String(limit.retryAfterSeconds));
  reply.code(429).send(rateLimitResponse(limit));
  return false;
}

function ledgerEventMatches(
  existing: Record<string, any>,
  headers: PaymentEventHeaders,
  event: PaymentHeldEvent,
  fingerprint: string
): boolean {
  return existing.provider === headers.provider &&
    existing.provider_event_id === headers.eventId &&
    existing.payment_intent_id === event.paymentIntentId &&
    existing.event_type === event.type &&
    existing.provider_reference === event.providerReference &&
    existing.payload_fingerprint === fingerprint;
}

function transitionConflict(reason: string): PaymentProviderEventError {
  return new PaymentProviderEventError(
    409,
    { error: 'Payment event could not be applied' },
    reason
  );
}

function acceptedResponse(input: {
  eventId: string;
  paymentIntentId: string;
  orderId: string;
  duplicate: boolean;
  unchanged: boolean;
}) {
  return {
    accepted: true,
    event: {
      id: input.eventId,
      type: 'payment.held' as const,
      duplicate: input.duplicate,
      unchanged: input.unchanged
    },
    appliedState: {
      orderId: input.orderId,
      orderStatus: 'paid' as const,
      paymentIntentId: input.paymentIntentId,
      paymentStatus: 'held' as const
    },
    operations: {
      collectionEnabled: false,
      releaseEnabled: false,
      refundEnabled: false,
      disputeResolutionEnabled: false
    }
  };
}

export async function paymentProviderEventRoutes(
  app: FastifyInstance
): Promise<void> {
  app.post('/payments/provider-events', async (request, reply) => {
    if (!eventConfiguration.enabled || !eventConfiguration.provider) {
      writeSecurityAudit(app.log, {
        action: 'payment.provider_event',
        decision: 'reject',
        ip: request.ip,
        reasonCodes: ['provider_not_configured']
      });
      return reply.code(503).send({
        error: 'Payment event ingestion is unavailable'
      });
    }

    if (!enforceProviderEventLimit(request, reply)) {
      writeSecurityAudit(app.log, {
        action: 'payment.provider_event',
        decision: 'rate_limited',
        ip: request.ip,
        reasonCodes: ['ip_rate_limit']
      });
      return;
    }

    const headers = providerEventHeaders(request);
    const event = paymentHeldEventSchema.parse(request.body);
    const verification = verifyPaymentEventSignature(
      eventConfiguration,
      headers,
      event
    );

    if (!verification.verified) {
      writeSecurityAudit(app.log, {
        action: 'payment.provider_event',
        decision: 'reject',
        targetId: event.paymentIntentId,
        ip: request.ip,
        reasonCodes: [verification.reason],
        metadata: {
          eventType: event.type,
          eventId: headers.eventId
        }
      });
      return reply.code(401).send({ error: 'Payment event signature is invalid' });
    }

    const occurredAt = new Date(event.occurredAt);
    if (occurredAt.getTime() > Date.now() + 60_000) {
      writeSecurityAudit(app.log, {
        action: 'payment.provider_event',
        decision: 'reject',
        targetId: event.paymentIntentId,
        ip: request.ip,
        reasonCodes: ['event_time_in_future'],
        metadata: {
          eventType: event.type,
          eventId: headers.eventId
        }
      });
      return reply.code(400).send({ error: 'Payment event time is invalid' });
    }

    const fingerprint = paymentEventFingerprint(headers.provider, event);

    try {
      const result = await db.transaction().execute(async (transaction) => {
        const existing = await transaction
          .selectFrom('payment_provider_events')
          .select([
            'provider',
            'provider_event_id',
            'payment_intent_id',
            'event_type',
            'provider_reference',
            'payload_fingerprint'
          ])
          .where('provider', '=', headers.provider)
          .where('provider_event_id', '=', headers.eventId)
          .executeTakeFirst();

        if (existing) {
          if (!ledgerEventMatches(existing, headers, event, fingerprint)) {
            throw transitionConflict('event_replay_conflict');
          }
          const existingIntent = await transaction
            .selectFrom('payment_intents')
            .select(['transaction_id'])
            .where('id', '=', event.paymentIntentId)
            .executeTakeFirst();
          if (!existingIntent?.transaction_id) {
            throw transitionConflict('event_context_missing');
          }
          return {
            orderId: String(existingIntent.transaction_id),
            duplicate: true,
            unchanged: true
          };
        }

        const intent = await transaction
          .selectFrom('payment_intents')
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
            'provider_reference'
          ])
          .where('id', '=', event.paymentIntentId)
          .executeTakeFirst();

        if (!intent?.transaction_id) {
          throw transitionConflict('payment_context_missing');
        }

        const order = await transaction
          .selectFrom('transactions')
          .select([
            'id',
            'buyer_id',
            'seller_id',
            'listing_id',
            'amount',
            'currency_code',
            'status',
            'payment_method',
            'payment_provider',
            'payment_reference'
          ])
          .where('id', '=', intent.transaction_id)
          .executeTakeFirst();

        if (!order) {
          throw transitionConflict('order_context_missing');
        }

        const parsedPaymentMethod = paymentMethod.safeParse(order.payment_method);
        if (!parsedPaymentMethod.success) {
          throw transitionConflict('payment_method_invalid');
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
            throw transitionConflict('payment_context_inconsistent');
          }
          throw error;
        }

        if (
          normalizePaymentAmount(intent.amount as string | number) !== event.amount ||
          normalizePaymentCurrency(String(intent.currency_code)) !== event.currencyCode
        ) {
          throw transitionConflict('payment_amount_or_currency_mismatch');
        }

        let decision = decidePaymentHeldTransition({
          configuredProvider: eventConfiguration.provider,
          eventProviderReference: event.providerReference,
          orderStatus: order.status as TransactionStatus,
          paymentStatus: intent.status as PaymentStatus,
          orderProvider: order.payment_provider ?? null,
          orderProviderReference: order.payment_reference ?? null,
          paymentProvider: intent.provider ?? null,
          paymentProviderReference: intent.provider_reference ?? null
        });

        if (!decision.allowed) {
          throw transitionConflict(decision.reason);
        }

        let unchanged = decision.unchanged;
        if (!unchanged) {
          let update = transaction
            .updateTable('transactions')
            .set({
              status: 'paid',
              payment_provider: eventConfiguration.provider,
              payment_reference: event.providerReference,
              updated_at: new Date()
            })
            .where('id', '=', order.id)
            .where('status', '=', 'pending');

          if (
            order.payment_provider === null &&
            order.payment_reference === null
          ) {
            update = update
              .where('payment_provider', 'is', null)
              .where('payment_reference', 'is', null);
          } else {
            update = update
              .where('payment_provider', '=', eventConfiguration.provider)
              .where('payment_reference', '=', event.providerReference);
          }

          const updatedOrder = await update
            .returning(['id', 'status', 'payment_provider', 'payment_reference'])
            .executeTakeFirst();

          const currentIntent = await transaction
            .selectFrom('payment_intents')
            .select(['status', 'provider', 'provider_reference'])
            .where('id', '=', intent.id)
            .executeTakeFirst();

          if (!updatedOrder || !currentIntent) {
            const currentOrder = await transaction
              .selectFrom('transactions')
              .select([
                'status',
                'payment_provider',
                'payment_reference'
              ])
              .where('id', '=', order.id)
              .executeTakeFirst();
            const currentPayment = currentIntent ?? await transaction
              .selectFrom('payment_intents')
              .select(['status', 'provider', 'provider_reference'])
              .where('id', '=', intent.id)
              .executeTakeFirst();

            if (!currentOrder || !currentPayment) {
              throw transitionConflict('concurrent_context_missing');
            }

            decision = decidePaymentHeldTransition({
              configuredProvider: eventConfiguration.provider,
              eventProviderReference: event.providerReference,
              orderStatus: currentOrder.status as TransactionStatus,
              paymentStatus: currentPayment.status as PaymentStatus,
              orderProvider: currentOrder.payment_provider ?? null,
              orderProviderReference: currentOrder.payment_reference ?? null,
              paymentProvider: currentPayment.provider ?? null,
              paymentProviderReference: currentPayment.provider_reference ?? null
            });
            if (!decision.allowed || !decision.unchanged) {
              throw transitionConflict('concurrent_transition_conflict');
            }
            unchanged = true;
          } else if (
            updatedOrder.status !== 'paid' ||
            updatedOrder.payment_provider !== eventConfiguration.provider ||
            updatedOrder.payment_reference !== event.providerReference ||
            currentIntent.status !== 'held' ||
            currentIntent.provider !== eventConfiguration.provider ||
            currentIntent.provider_reference !== event.providerReference
          ) {
            throw transitionConflict('post_transition_verification_failed');
          }
        }

        const inserted = await transaction
          .insertInto('payment_provider_events')
          .values({
            provider: headers.provider,
            provider_event_id: headers.eventId,
            payment_intent_id: event.paymentIntentId,
            event_type: event.type,
            provider_reference: event.providerReference,
            payload_fingerprint: fingerprint,
            occurred_at: occurredAt,
            processed_at: new Date(),
            processing_result: unchanged ? 'unchanged' : 'processed'
          })
          .onConflict((conflict) => conflict.doNothing())
          .returning(['id'])
          .executeTakeFirst();

        let duplicate = false;
        if (!inserted) {
          const racedEvent = await transaction
            .selectFrom('payment_provider_events')
            .select([
              'provider',
              'provider_event_id',
              'payment_intent_id',
              'event_type',
              'provider_reference',
              'payload_fingerprint'
            ])
            .where('provider', '=', headers.provider)
            .where('provider_event_id', '=', headers.eventId)
            .executeTakeFirst();
          if (
            !racedEvent ||
            !ledgerEventMatches(racedEvent, headers, event, fingerprint)
          ) {
            throw transitionConflict('event_replay_conflict');
          }
          duplicate = true;
          unchanged = true;
        }

        return {
          orderId: String(order.id),
          duplicate,
          unchanged
        };
      });

      writeSecurityAudit(app.log, {
        action: 'payment.provider_event',
        decision: 'allow',
        targetId: event.paymentIntentId,
        ip: request.ip,
        reasonCodes: [result.duplicate ? 'verified_replay' : 'verified_event'],
        metadata: {
          eventType: event.type,
          eventId: headers.eventId,
          duplicate: result.duplicate,
          unchanged: result.unchanged
        }
      });

      return reply.send(acceptedResponse({
        eventId: headers.eventId,
        paymentIntentId: event.paymentIntentId,
        orderId: result.orderId,
        duplicate: result.duplicate,
        unchanged: result.unchanged
      }));
    } catch (error) {
      if (error instanceof PaymentProviderEventError) {
        writeSecurityAudit(app.log, {
          action: 'payment.provider_event',
          decision: 'reject',
          targetId: event.paymentIntentId,
          ip: request.ip,
          reasonCodes: [error.reasonCode],
          metadata: {
            eventType: event.type,
            eventId: headers.eventId
          }
        });
        return reply.code(error.statusCode).send(error.payload);
      }
      throw error;
    }
  });
}
