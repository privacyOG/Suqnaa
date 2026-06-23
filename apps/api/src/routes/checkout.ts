import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser, type AuthenticatedRequest } from '../auth/require-user.js';
import { env } from '../config/env.js';
import { db } from '../db/index.js';
import { getStripe, isStripeEnabled } from '../services/stripe-client.js';

const cardIntentBody = z.object({
  orderId: z.string().uuid()
});

export async function checkoutRoutes(app: FastifyInstance): Promise<void> {
  app.post('/checkout/card-intent', { preHandler: requireUser }, async (request, reply) => {
    if (!isStripeEnabled()) {
      return reply.code(503).send({ error: 'Card payments are not configured' });
    }

    const authRequest = request as AuthenticatedRequest;
    const buyerId = authRequest.user.sub;
    const body = cardIntentBody.parse(request.body);

    const order = await db.selectFrom('transactions')
      .select([
        'id',
        'buyer_id',
        'seller_id',
        'listing_id',
        'amount',
        'currency_code',
        'status',
        'payment_method',
        'payment_reference'
      ])
      .where('id', '=', body.orderId)
      .where('buyer_id', '=', buyerId)
      .executeTakeFirst();

    if (!order) {
      return reply.code(404).send({ error: 'Order not found' });
    }
    if (order.status !== 'pending') {
      return reply.code(409).send({ error: 'Order is not in a payable state', status: order.status });
    }
    if (order.payment_method !== 'card') {
      return reply.code(409).send({ error: 'Order payment method is not card' });
    }

    if (order.payment_reference) {
      const stripe = getStripe();
      try {
        const existing = await stripe.paymentIntents.retrieve(order.payment_reference);
        if (existing.status === 'requires_payment_method' || existing.status === 'requires_confirmation' || existing.status === 'requires_action') {
          return reply.send({ clientSecret: existing.client_secret });
        }
      } catch {
        // PI is gone or invalid — fall through to create a new one
      }
    }

    const stripe = getStripe();
    const amountCents = Math.round(Number(order.amount) * 100);

    const pi = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: (order.currency_code as string).toLowerCase(),
      metadata: {
        orderId: order.id,
        listingId: order.listing_id ?? '',
        buyerId: order.buyer_id,
        sellerId: order.seller_id
      },
      automatic_payment_methods: { enabled: true }
    });

    await db.insertInto('payment_intents')
      .values({
        buyer_id: order.buyer_id,
        seller_id: order.seller_id,
        listing_id: order.listing_id ?? null,
        rail: 'card',
        status: 'awaiting_payment',
        amount: order.amount,
        currency_code: order.currency_code,
        provider: 'stripe',
        provider_reference: pi.id,
        updated_at: new Date()
      })
      .execute();

    await db.updateTable('transactions')
      .set({
        payment_provider: 'stripe',
        payment_reference: pi.id,
        updated_at: new Date()
      })
      .where('id', '=', order.id)
      .execute();

    return reply.send({ clientSecret: pi.client_secret });
  });

  // Stripe webhook — needs raw body for signature verification
  await app.register(async (scope) => {
    scope.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => {
      done(null, body);
    });

    scope.post('/checkout/stripe-webhook', async (request, reply) => {
      if (!isStripeEnabled() || !env.STRIPE_WEBHOOK_SECRET) {
        return reply.code(503).send({ error: 'Stripe webhook not configured' });
      }

      const sig = request.headers['stripe-signature'];
      if (!sig || typeof sig !== 'string') {
        return reply.code(400).send({ error: 'Missing stripe-signature header' });
      }

      let event: import('stripe').Stripe.Event;
      try {
        event = getStripe().webhooks.constructEvent(
          request.body as Buffer,
          sig,
          env.STRIPE_WEBHOOK_SECRET
        );
      } catch {
        return reply.code(400).send({ error: 'Webhook signature verification failed' });
      }

      if (event.type === 'payment_intent.succeeded') {
        const pi = event.data.object as import('stripe').Stripe.PaymentIntent;

        await db.updateTable('transactions')
          .set({ status: 'paid', updated_at: new Date() })
          .where('payment_reference', '=', pi.id)
          .where('status', '=', 'pending')
          .execute();

        await db.updateTable('payment_intents')
          .set({ status: 'funds_received', updated_at: new Date() })
          .where('provider_reference', '=', pi.id)
          .where('provider', '=', 'stripe')
          .execute();
      }

      if (event.type === 'payment_intent.payment_failed') {
        const pi = event.data.object as import('stripe').Stripe.PaymentIntent;

        await db.updateTable('payment_intents')
          .set({ status: 'cancelled', updated_at: new Date() })
          .where('provider_reference', '=', pi.id)
          .where('provider', '=', 'stripe')
          .execute();
      }

      return reply.send({ received: true });
    });
  });
}
