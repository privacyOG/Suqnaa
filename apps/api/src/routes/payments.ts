import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireUser, type AuthenticatedRequest } from '../auth/require-user.js';
import { paymentCollectionConfigurationFromEnvironment } from '../config/payment-collection-config.js';
import { db } from '../db/index.js';
import {
  checkoutPaymentMethods,
  prepareOrderCheckout
} from '../payments/checkout-preparation.js';
import { evaluateInitialLaunchPayment } from '../payments/launch-policy.js';
import {
  beginStripeCheckout,
  PaymentCollectionError
} from '../payments/payment-collection-service.js';
import { StripeCheckoutProvider, StripeProviderError } from '../payments/stripe-checkout-provider.js';
import { NoopChallengeVerifier } from '../security/challenge-verifier.js';
import {
  checkHumanProtectionWithChallenge,
  humanProtectionResponse
} from '../security/human-protection.js';
import { checkRateLimit, rateLimitResponse } from '../security/rate-limit.js';
import { writeSecurityAudit } from '../security/security-audit.js';

const challengeVerifier = new NoopChallengeVerifier();
const paymentMethod = z.enum(checkoutPaymentMethods);
const collectionConfiguration = paymentCollectionConfigurationFromEnvironment();
const stripeProvider = new StripeCheckoutProvider(collectionConfiguration);

const checkoutBody = z.object({
  orderId: z.string().uuid(),
  locale: z.enum(['en', 'ar']).default('en')
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

      const [buyer, seller, listing] = await Promise.all([
        db.selectFrom('users')
          .select(['id', 'status', 'email', 'email_verified_at'])
          .where('id', '=', buyerId)
          .executeTakeFirst(),
        db.selectFrom('users')
          .select(['id', 'status'])
          .where('id', '=', order.seller_id)
          .executeTakeFirst(),
        db.selectFrom('listings')
          .select(['id', 'seller_id', 'status', 'country_code'])
          .where('id', '=', order.listing_id)
          .executeTakeFirst()
      ]);

      if (!buyer || buyer.status !== 'active') {
        return reply.code(403).send({ error: 'Buyer account is unavailable' });
      }
      if (!seller || seller.status !== 'active') {
        return reply.code(409).send({ error: 'Seller account is unavailable' });
      }
      if (
        !listing ||
        listing.seller_id !== order.seller_id ||
        listing.status !== 'reserved'
      ) {
        return reply.code(409).send({
          error: 'Order reservation is no longer available'
        });
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

      const launchEligibility = evaluateInitialLaunchPayment({
        countryCode: String(listing.country_code),
        currencyCode: String(order.currency_code),
        paymentMethod: parsedPaymentMethod.data
      });
      if (!launchEligibility.eligible) {
        writeSecurityAudit(app.log, {
          action: 'payment.checkout_prepare',
          decision: 'reject',
          actorId: buyerId,
          targetId: order.id,
          ip: request.ip,
          reasonCodes: [launchEligibility.reason],
          metadata: {
            listingId: order.listing_id,
            countryCode: listing.country_code,
            currencyCode: order.currency_code,
            paymentMethod: parsedPaymentMethod.data
          }
        });
        return reply.code(409).send({
          error: 'Order is outside the initial marketplace payment launch policy',
          reason: launchEligibility.reason
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

      if (collectionConfiguration.enabled) {
        if (
          !buyer.email ||
          !buyer.email_verified_at ||
          (parsedPaymentMethod.data !== 'card' && parsedPaymentMethod.data !== 'wallet')
        ) {
          return reply.code(409).send({
            error: 'Buyer payment contact or payment method is unavailable'
          });
        }

        const intent = await db.selectFrom('payment_intents')
          .select(['id', 'status'])
          .where('transaction_id', '=', order.id)
          .executeTakeFirst();
        if (!intent || (intent.status !== 'created' && intent.status !== 'awaiting_payment')) {
          return reply.code(409).send({ error: 'Order payment context is unavailable' });
        }

        try {
          const session = await beginStripeCheckout({
            provider: stripeProvider,
            internalPaymentIntentId: String(intent.id),
            orderId: String(order.id),
            listingId: String(order.listing_id),
            sellerId: String(order.seller_id),
            buyerId,
            buyerEmail: String(buyer.email),
            amount: order.amount as string | number,
            currencyCode: String(order.currency_code),
            paymentMethod: parsedPaymentMethod.data,
            locale: body.locale
          });

          writeSecurityAudit(app.log, {
            action: 'payment.checkout_prepare',
            decision: 'allow',
            actorId: buyerId,
            targetId: order.id,
            ip: request.ip,
            riskScore: protection.riskScore,
            reasonCodes: [...protection.reasonCodes, 'provider_checkout_created'],
            metadata: {
              listingId: order.listing_id,
              countryCode: listing.country_code,
              currencyCode: order.currency_code,
              paymentMethod: parsedPaymentMethod.data,
              provider: 'stripe'
            }
          });

          return reply.send({
            accepted: true,
            status: 'redirect_required' as const,
            order: {
              id: String(order.id),
              listingId: String(order.listing_id),
              amount: order.amount,
              currencyCode: String(order.currency_code).toUpperCase(),
              status: 'pending' as const,
              paymentMethod: parsedPaymentMethod.data
            },
            payment: {
              provider: 'stripe' as const,
              nextAction: 'redirect_to_provider' as const,
              checkoutUrl: session.url,
              expiresAt: session.expiresAt
            },
            releaseModel: 'hold_until_fulfilment_or_dispute_resolution' as const
          });
        } catch (error) {
          if (error instanceof StripeProviderError) {
            writeSecurityAudit(app.log, {
              action: 'payment.checkout_prepare',
              decision: 'reject',
              actorId: buyerId,
              targetId: order.id,
              ip: request.ip,
              reasonCodes: [error.safeCode]
            });
            return reply.code(503).send({ error: 'Payment provider is temporarily unavailable' });
          }
          if (error instanceof PaymentCollectionError) {
            return reply.code(409).send({ error: 'Order payment context changed; refresh and try again' });
          }
          throw error;
        }
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
          countryCode: listing.country_code,
          currencyCode: order.currency_code,
          paymentMethod: parsedPaymentMethod.data
        }
      });

      return reply.send(checkout);
    }
  );
}
