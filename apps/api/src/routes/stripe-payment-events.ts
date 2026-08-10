import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { paymentCollectionConfigurationFromEnvironment } from '../config/payment-collection-config.js';
import {
  applyStripePaymentSucceeded,
  PaymentCollectionError
} from '../payments/payment-collection-service.js';
import {
  PaymentOperationError
} from '../payments/payment-operation.js';
import {
  applyStripeDisputeEvent,
  applyStripeRefundEvent
} from '../payments/stripe-operation-events.js';
import {
  StripeCheckoutProvider,
  StripeProviderError
} from '../payments/stripe-checkout-provider.js';
import { verifyAndParseStripeWebhook } from '../payments/stripe-webhook.js';
import { rateLimitResponse } from '../security/rate-limit.js';
import { writeSecurityAudit } from '../security/security-audit.js';
import { checkSharedRateLimit } from '../security/shared-rate-limit.js';

const configuration = paymentCollectionConfigurationFromEnvironment();
const provider = new StripeCheckoutProvider(configuration);

function firstHeader(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

async function enforceWebhookLimit(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  const result = await checkSharedRateLimit({
    group: 'payment.stripe_webhook.ip',
    identifiers: [`ip:${request.ip}`],
    limit: 600,
    windowMs: 5 * 60 * 1000
  });
  if (result.allowed) return true;
  reply.header('Retry-After', String(result.retryAfterSeconds));
  reply.code(429).send(rateLimitResponse(result));
  return false;
}

function eventTargetId(event: ReturnType<typeof verifyAndParseStripeWebhook>): string {
  if (event.type === 'payment_intent.succeeded') {
    return event.data.object.metadata.suqnaa_payment_intent_id;
  }
  if (event.type === 'charge.dispute.created') {
    return event.data.object.id;
  }
  return event.data.object.metadata.suqnaa_payment_operation_id;
}

export async function stripePaymentEventRoutes(app: FastifyInstance): Promise<void> {
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (_request, body, done) => done(null, body)
  );

  app.post('/payments/stripe-events', async (request, reply) => {
    if (!configuration.enabled || configuration.provider !== 'stripe') {
      return reply.code(503).send({ error: 'Payment collection webhook is unavailable' });
    }
    if (!await enforceWebhookLimit(request, reply)) return;
    if (!Buffer.isBuffer(request.body)) {
      return reply.code(400).send({ error: 'Payment webhook body is invalid' });
    }

    let event;
    try {
      event = verifyAndParseStripeWebhook({
        rawBody: request.body,
        signatureHeader: firstHeader(request.headers['stripe-signature']),
        webhookSecret: configuration.webhookSecret
      });
    } catch {
      writeSecurityAudit(app.log, {
        action: 'payment.stripe_webhook',
        decision: 'reject',
        ip: request.ip,
        reasonCodes: ['signature_or_payload_invalid']
      });
      return reply.code(400).send({ error: 'Payment webhook could not be verified' });
    }

    if (event.livemode !== configuration.liveMode) {
      writeSecurityAudit(app.log, {
        action: 'payment.stripe_webhook',
        decision: 'reject',
        targetId: eventTargetId(event),
        ip: request.ip,
        reasonCodes: ['provider_mode_mismatch'],
        metadata: { eventId: event.id, eventType: event.type }
      });
      return reply.code(409).send({ error: 'Payment webhook mode does not match configuration' });
    }

    try {
      if (event.type === 'payment_intent.succeeded') {
        const receipt = await provider.retrieveChargeReceipt(event.data.object.latest_charge);
        const applied = await applyStripePaymentSucceeded({ event, receipt });
        writeSecurityAudit(app.log, {
          action: 'payment.stripe_webhook',
          decision: 'allow',
          targetId: eventTargetId(event),
          ip: request.ip,
          reasonCodes: [applied.duplicate ? 'verified_replay' : 'verified_payment'],
          metadata: { eventId: event.id, eventType: event.type, orderId: applied.orderId, duplicate: applied.duplicate }
        });
        return reply.send({ accepted: true, eventId: event.id, eventType: event.type, orderId: applied.orderId, duplicate: applied.duplicate });
      }

      if (event.type === 'charge.dispute.created') {
        const applied = await applyStripeDisputeEvent(event);
        writeSecurityAudit(app.log, {
          action: 'payment.stripe_webhook',
          decision: 'allow',
          targetId: eventTargetId(event),
          ip: request.ip,
          reasonCodes: [applied.duplicate ? 'verified_replay' : 'verified_chargeback'],
          metadata: { eventId: event.id, eventType: event.type, orderId: applied.orderId, duplicate: applied.duplicate }
        });
        return reply.send({ accepted: true, eventId: event.id, eventType: event.type, orderId: applied.orderId, duplicate: applied.duplicate });
      }

      const applied = await applyStripeRefundEvent(event);
      writeSecurityAudit(app.log, {
        action: 'payment.stripe_webhook',
        decision: 'allow',
        targetId: eventTargetId(event),
        ip: request.ip,
        reasonCodes: ['verified_refund_update'],
        metadata: { eventId: event.id, eventType: event.type, orderId: applied.orderId, status: applied.status }
      });
      return reply.send({ accepted: true, eventId: event.id, eventType: event.type, orderId: applied.orderId, status: applied.status });
    } catch (error) {
      if (error instanceof StripeProviderError) {
        return reply.code(503).send({ error: 'Payment provider lookup is unavailable' });
      }
      if (error instanceof PaymentCollectionError) {
        writeSecurityAudit(app.log, {
          action: 'payment.stripe_webhook',
          decision: 'reject',
          targetId: eventTargetId(event),
          ip: request.ip,
          reasonCodes: [error.safeCode],
          metadata: { eventId: event.id, eventType: event.type }
        });
        return reply.code(409).send({ error: 'Payment event could not be applied' });
      }
      if (error instanceof PaymentOperationError) {
        writeSecurityAudit(app.log, {
          action: 'payment.stripe_webhook',
          decision: 'reject',
          targetId: eventTargetId(event),
          ip: request.ip,
          reasonCodes: [error.code],
          metadata: { eventId: event.id, eventType: event.type }
        });
        return reply.code(error.statusCode).send({ error: 'Payment operation event could not be applied' });
      }
      throw error;
    }
  });
}
