import type { FastifyReply, FastifyRequest } from 'fastify';
import { db } from '../db/index.js';
import { observeMarketplaceRiskEvent } from './marketplace-risk-service.js';

function decodedPayload(payload: unknown): Record<string, any> | null {
  try {
    if (typeof payload === 'string') return JSON.parse(payload) as Record<string, any>;
    if (Buffer.isBuffer(payload)) return JSON.parse(payload.toString('utf8')) as Record<string, any>;
  } catch {
    return null;
  }
  return payload && typeof payload === 'object' ? payload as Record<string, any> : null;
}

function requestUserId(request: FastifyRequest): string | null {
  const value = (request as FastifyRequest & { user?: { sub?: unknown } }).user?.sub;
  return typeof value === 'string' ? value : null;
}

function routePath(request: FastifyRequest): string {
  return request.url.split('?')[0] ?? request.url;
}

export async function recordMarketplaceRiskResponse(
  request: FastifyRequest,
  reply: FastifyReply,
  payload: unknown
): Promise<void> {
  const body = decodedPayload(payload);
  if (!body) return;

  try {
    const path = routePath(request);

    if (request.method === 'POST' && path === '/v1/market/offers' && reply.statusCode === 201) {
      const offer = body.offer as Record<string, unknown> | undefined;
      if (offer && typeof offer.id === 'string' && typeof offer.buyerId === 'string') {
        await observeMarketplaceRiskEvent({
          eventType: 'offer.created',
          sourceEventId: offer.id,
          userId: offer.buyerId,
          listingId: typeof offer.listingId === 'string' ? offer.listingId : null,
          offerId: offer.id,
          amount: Number(offer.amount),
          summary: 'Buyer offer velocity threshold matched.',
          evidence: { route: path }
        });
      }
    }

    const reasonCodes = Array.isArray(body.reasonCodes)
      ? body.reasonCodes.filter((item: unknown): item is string => typeof item === 'string')
      : [];
    const userId = requestUserId(request);
    if (reply.statusCode === 403 && userId && reasonCodes.includes('challenge_failed')) {
      await observeMarketplaceRiskEvent({
        eventType: 'account.challenge_failed',
        sourceEventId: `request:${request.id}`,
        userId,
        summary: 'Repeated human-verification failures on authenticated marketplace activity.',
        evidence: { route: path, reasonCodes }
      });
    }

    if (
      request.method === 'POST' &&
      path === '/v1/payments/stripe-events' &&
      reply.statusCode >= 200 && reply.statusCode < 300 &&
      body.eventType === 'charge.dispute.created' &&
      typeof body.eventId === 'string' &&
      typeof body.orderId === 'string'
    ) {
      const order = await db.selectFrom('transactions')
        .select(['id', 'buyer_id', 'seller_id', 'listing_id'])
        .where('id', '=', body.orderId)
        .executeTakeFirst();
      if (order) {
        const intent = await db.selectFrom('payment_intents')
          .select(['id'])
          .where('transaction_id', '=', order.id)
          .executeTakeFirst();

        await observeMarketplaceRiskEvent({
          eventType: 'payment.chargeback_created',
          sourceEventId: body.eventId,
          userId: String(order.buyer_id),
          listingId: String(order.listing_id),
          orderId: String(order.id),
          paymentIntentId: intent ? String(intent.id) : null,
          summary: 'Verified payment chargeback associated with buyer activity.',
          evidence: { providerEventType: body.eventType }
        });

        await observeMarketplaceRiskEvent({
          eventType: 'seller.adverse_outcome',
          sourceEventId: `chargeback:${body.eventId}`,
          userId: String(order.seller_id),
          listingId: String(order.listing_id),
          orderId: String(order.id),
          paymentIntentId: intent ? String(intent.id) : null,
          summary: 'Verified chargeback recorded as an adverse seller outcome.',
          evidence: { source: 'verified_chargeback' }
        });
      }
    }
  } catch (error) {
    request.log.warn({ error, route: routePath(request) }, 'marketplace risk observation failed');
  }
}
