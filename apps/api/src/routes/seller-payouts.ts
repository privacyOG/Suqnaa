import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser, type AuthenticatedRequest } from '../auth/require-user.js';
import { paymentCollectionConfigurationFromEnvironment } from '../config/payment-collection-config.js';
import { sellerSettlementConfigurationFromEnvironment } from '../config/seller-settlement-config.js';
import { StripeConnectProvider } from '../payments/stripe-connect-provider.js';
import {
  beginSellerPayoutOnboarding,
  readSellerPayoutStatus,
  SellerSettlementError,
  updateSellerPayoutSchedule
} from '../settlements/seller-settlement-service.js';

const scheduleBody = z.discriminatedUnion('interval', [
  z.object({ interval: z.literal('daily') }).strict(),
  z.object({ interval: z.literal('weekly'), anchor: z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday']) }).strict(),
  z.object({ interval: z.literal('monthly'), anchor: z.coerce.number().int().min(1).max(31) }).strict()
]);

function settlementError(reply: any, error: unknown) {
  if (error instanceof SellerSettlementError) {
    return reply.code(error.statusCode).send({ error: 'Seller payout action rejected', code: error.code });
  }
  throw error;
}

export async function sellerPayoutRoutes(app: FastifyInstance): Promise<void> {
  app.get('/account/payouts', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    return reply.send({ payouts: await readSellerPayoutStatus(authRequest.user.sub) });
  });

  app.post('/account/payouts/onboarding', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const paymentConfiguration = paymentCollectionConfigurationFromEnvironment();
    const settlementConfiguration = sellerSettlementConfigurationFromEnvironment();
    const provider = new StripeConnectProvider(paymentConfiguration, settlementConfiguration);
    try {
      const onboarding = await beginSellerPayoutOnboarding({
        sellerId: authRequest.user.sub,
        provider,
        configuration: settlementConfiguration,
        webOrigin: paymentConfiguration.webOrigin
      });
      return reply.send({ onboarding });
    } catch (error) {
      return settlementError(reply, error);
    }
  });

  app.post('/account/payouts/schedule', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const body = scheduleBody.parse(request.body);
    const paymentConfiguration = paymentCollectionConfigurationFromEnvironment();
    const settlementConfiguration = sellerSettlementConfigurationFromEnvironment();
    const provider = new StripeConnectProvider(paymentConfiguration, settlementConfiguration);
    const anchor = body.interval === 'daily' ? 'daily' : String(body.anchor);
    try {
      const schedule = await updateSellerPayoutSchedule({
        sellerId: authRequest.user.sub,
        interval: body.interval,
        anchor,
        provider
      });
      return reply.send({ schedule });
    } catch (error) {
      return settlementError(reply, error);
    }
  });
}
