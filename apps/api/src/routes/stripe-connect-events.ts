import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { paymentCollectionConfigurationFromEnvironment } from '../config/payment-collection-config.js';
import { sellerSettlementConfigurationFromEnvironment } from '../config/seller-settlement-config.js';
import { verifyAndParseStripeConnectWebhook } from '../payments/stripe-connect-webhook.js';
import { rateLimitResponse } from '../security/rate-limit.js';
import { writeSecurityAudit } from '../security/security-audit.js';
import { checkSharedRateLimit } from '../security/shared-rate-limit.js';
import { applyStripeConnectEvent, SellerSettlementError } from '../settlements/seller-settlement-service.js';

const paymentConfiguration = paymentCollectionConfigurationFromEnvironment();
const settlementConfiguration = sellerSettlementConfigurationFromEnvironment();

function firstHeader(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

async function enforceLimit(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  const result = await checkSharedRateLimit({
    group: 'payment.stripe_connect_webhook.ip',
    identifiers: [`ip:${request.ip}`],
    limit: 600,
    windowMs: 5 * 60 * 1000
  });
  if (result.allowed) return true;
  reply.header('Retry-After', String(result.retryAfterSeconds));
  reply.code(429).send(rateLimitResponse(result));
  return false;
}

export async function stripeConnectEventRoutes(app: FastifyInstance): Promise<void> {
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_request, body, done) => done(null, body));

  app.post('/payments/stripe-connect-events', async (request, reply) => {
    if (!settlementConfiguration.enabled || !paymentConfiguration.enabled || paymentConfiguration.provider !== 'stripe') {
      return reply.code(503).send({ error: 'Seller settlement webhook is unavailable' });
    }
    if (!await enforceLimit(request, reply)) return;
    if (!Buffer.isBuffer(request.body)) return reply.code(400).send({ error: 'Settlement webhook body is invalid' });

    let event;
    try {
      event = verifyAndParseStripeConnectWebhook({
        rawBody: request.body,
        signatureHeader: firstHeader(request.headers['stripe-signature']),
        webhookSecret: settlementConfiguration.connectWebhookSecret
      });
    } catch {
      writeSecurityAudit(app.log, {
        action: 'payment.stripe_connect_webhook',
        decision: 'reject',
        ip: request.ip,
        reasonCodes: ['signature_or_payload_invalid']
      });
      return reply.code(400).send({ error: 'Settlement webhook could not be verified' });
    }

    if (event.livemode !== paymentConfiguration.liveMode) {
      return reply.code(409).send({ error: 'Settlement webhook mode does not match configuration' });
    }

    try {
      const applied = await applyStripeConnectEvent(event);
      writeSecurityAudit(app.log, {
        action: 'payment.stripe_connect_webhook',
        decision: 'allow',
        targetId: event.account,
        ip: request.ip,
        reasonCodes: [applied.duplicate ? 'verified_replay' : 'verified_connect_event'],
        metadata: { eventId: event.id, eventType: event.type, sellerId: applied.sellerId }
      });
      return reply.send({ accepted: true, eventId: event.id, eventType: event.type, duplicate: applied.duplicate });
    } catch (error) {
      if (error instanceof SellerSettlementError) {
        return reply.code(error.statusCode).send({ error: 'Settlement event could not be applied', code: error.code });
      }
      throw error;
    }
  });
}
