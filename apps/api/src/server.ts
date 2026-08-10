import Fastify from 'fastify';
import { env } from './config/env.js';
import { resolveApiErrorResponse } from './config/http-error.js';
import { resolveApiRequestSizeBytes } from './config/request-size.js';
import { resolveWebOrigin } from './config/web-origin.js';
import { interceptLegacyQueueModeration } from './moderation/legacy-queue-moderation-hook.js';
import { enforceSellerListingPublicationPolicy } from './moderation/listing-publication-hook.js';
import { enforceModeratorListingApprovalPolicy } from './moderation/moderator-listing-approval-hook.js';
import { errorReport, getErrorReporter } from './observability/error-reporter.js';
import {
  registerHttpObservability,
  requestObservabilityContext
} from './observability/http-observability.js';
import { apiLoggerOptions } from './observability/logger-config.js';
import { serveRiskFraudDashboard } from './risk/fraud-dashboard-hook.js';
import { recordMarketplaceRiskResponse } from './risk/marketplace-risk-event-hook.js';
import { accountRoutes } from './routes/account.js';
import { accountProfileRoutes } from './routes/account-profile.js';
import { accountVerificationRoutes } from './routes/account-verification.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { categoryRoutes } from './routes/categories.js';
import { challengeRoutes } from './routes/challenge.js';
import { conversationSafetyRoutes } from './routes/conversation-safety.js';
import { conversationSyncRoutes } from './routes/conversation-sync.js';
import { discoveryRoutes } from './routes/discovery.js';
import { disputeRoutes } from './routes/disputes.js';
import { listingEditRoutes } from './routes/listing-edit.js';
import { listingLifecycleRoutes } from './routes/listing-lifecycle.js';
import { listingLocationRoutes } from './routes/listing-location.js';
import { listingMediaRoutes } from './routes/listing-media.js';
import { listingMediaThumbnailRoutes } from './routes/listing-media-thumbnail.js';
import { listingMediaUploadRoutes } from './routes/listing-media-upload.js';
import { listingSearchRoutes } from './routes/listing-search.js';
import { listingShippingOptionRoutes } from './routes/listing-shipping-options.js';
import { listingRoutes } from './routes/listings.js';
import { marketActionRoutes } from './routes/market-actions.js';
import { messageRoutes } from './routes/messages.js';
import { moderationParticipantRoutes } from './routes/moderation-participant.js';
import { moderationRoutes } from './routes/moderation.js';
import { notificationRoutes } from './routes/notifications.js';
import { observabilityRoutes } from './routes/observability.js';
import { offerWorkflowRoutes } from './routes/offer-workflow.js';
import { operationRecordRoutes } from './routes/operation-records.js';
import { operationsAccessRoutes } from './routes/operations-access.js';
import { operationsDashboardRoutes } from './routes/operations-dashboard.js';
import { operationsDisputeRoutes } from './routes/operations-disputes.js';
import { operationsPaymentRoutes } from './routes/operations-payments.js';
import { operationsRiskRoutes } from './routes/operations-risk.js';
import { operationsSettlementRoutes } from './routes/operations-settlements.js';
import { operationsRoutes } from './routes/operations.js';
import { operationsVerificationRoutes } from './routes/operations-verifications.js';
import { orderActivityRoutes } from './routes/order-activity.js';
import { orderCancellationRoutes } from './routes/order-cancellation.js';
import { orderDeliveryRoutes } from './routes/order-delivery.js';
import { orderFulfilmentRoutes } from './routes/order-fulfilment.js';
import { orderPaymentContextRoutes } from './routes/order-payment-context.js';
import { orderProtectionRoutes } from './routes/order-protection.js';
import { passwordSecurityRoutes } from './routes/password-security.js';
import { paymentProviderEventRoutes } from './routes/payment-provider-events.js';
import { paymentRoutes } from './routes/payments.js';
import { reportRoutes } from './routes/reports.js';
import { sellerPayoutRoutes } from './routes/seller-payouts.js';
import { sellerVerificationRoutes } from './routes/seller-verification.js';
import { sessionManagementRoutes } from './routes/session-management.js';
import { stripeConnectEventRoutes } from './routes/stripe-connect-events.js';
import { stripePaymentEventRoutes } from './routes/stripe-payment-events.js';

const app = Fastify({
  logger: apiLoggerOptions({ nodeEnv: env.NODE_ENV, logLevel: process.env.LOG_LEVEL }),
  disableRequestLogging: true,
  bodyLimit: resolveApiRequestSizeBytes({
    value: process.env.API_REQUEST_SIZE_BYTES
  })
});

registerHttpObservability(app);

const webOrigin = resolveWebOrigin({
  nodeEnv: env.NODE_ENV,
  webOrigin: process.env.WEB_ORIGIN
});

app.addHook('onRequest', async (request, reply) => {
  const origin = request.headers.origin;

  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('Referrer-Policy', 'no-referrer');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  reply.header('Cache-Control', 'no-store');
  reply.header('Pragma', 'no-cache');

  if (origin === webOrigin) {
    reply.header('Access-Control-Allow-Origin', origin);
    reply.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    reply.header(
      'Access-Control-Allow-Headers',
      'content-type, authorization, x-request-id, traceparent, x-suqnaa-human-check'
    );
    reply.header('Access-Control-Expose-Headers', 'x-request-id');
    reply.header('Access-Control-Max-Age', '600');
    reply.header('Vary', 'Origin');
  }

  if (request.method === 'OPTIONS') {
    if (origin !== webOrigin) {
      return reply.code(403).send({ error: 'Origin not allowed' });
    }

    return reply.code(204).send();
  }
});

app.addHook('preHandler', enforceSellerListingPublicationPolicy);
app.addHook('preHandler', enforceModeratorListingApprovalPolicy);
app.addHook('preHandler', interceptLegacyQueueModeration);
app.addHook('preHandler', serveRiskFraudDashboard);
app.addHook('onSend', async (request, reply, payload) => {
  await recordMarketplaceRiskResponse(request, reply, payload);
  return payload;
});

app.setErrorHandler(async (error, request, reply) => {
  const context = requestObservabilityContext(request);
  const report = errorReport({
    error,
    requestId: context?.requestId,
    traceId: context?.traceId,
    route: request.routeOptions.url,
    method: request.method
  });

  try {
    await getErrorReporter().capture(report);
  } catch (reporterError) {
    app.log.warn({
      event: 'error_report_delivery_failed',
      requestId: context?.requestId ?? null,
      traceId: context?.traceId ?? null,
      errorName: reporterError instanceof Error ? reporterError.name : 'Error'
    });
  }

  app.log.error({
    event: 'http_request_failed',
    requestId: context?.requestId ?? null,
    traceId: context?.traceId ?? null,
    method: request.method,
    route: request.routeOptions.url ?? 'unknown',
    errorName: report.errorName
  });

  const mappedError = resolveApiErrorResponse(error);
  if (mappedError) {
    return reply.code(mappedError.statusCode).send(mappedError.body);
  }

  return reply.code(500).send({ error: 'Internal server error' });
});

await app.register(observabilityRoutes, { prefix: '/internal/observability' });
await app.register(healthRoutes, { prefix: '/v1' });
await app.register(accountRoutes, { prefix: '/v1' });
await app.register(accountProfileRoutes, { prefix: '/v1' });
await app.register(accountVerificationRoutes, { prefix: '/v1' });
await app.register(authRoutes, { prefix: '/v1' });
await app.register(passwordSecurityRoutes, { prefix: '/v1' });
await app.register(sellerVerificationRoutes, { prefix: '/v1' });
await app.register(sellerPayoutRoutes, { prefix: '/v1' });
await app.register(categoryRoutes, { prefix: '/v1' });
await app.register(challengeRoutes, { prefix: '/v1' });
await app.register(conversationSafetyRoutes, { prefix: '/v1' });
await app.register(conversationSyncRoutes, { prefix: '/v1' });
await app.register(discoveryRoutes, { prefix: '/v1' });
await app.register(disputeRoutes, { prefix: '/v1' });
await app.register(listingRoutes, { prefix: '/v1' });
await app.register(listingEditRoutes, { prefix: '/v1' });
await app.register(listingLocationRoutes, { prefix: '/v1' });
await app.register(listingLifecycleRoutes, { prefix: '/v1' });
await app.register(listingMediaRoutes, { prefix: '/v1' });
await app.register(listingMediaThumbnailRoutes, { prefix: '/v1' });
await app.register(listingMediaUploadRoutes, { prefix: '/v1' });
await app.register(listingSearchRoutes, { prefix: '/v1' });
await app.register(listingShippingOptionRoutes, { prefix: '/v1' });
await app.register(marketActionRoutes, { prefix: '/v1' });
await app.register(offerWorkflowRoutes, { prefix: '/v1' });
await app.register(paymentProviderEventRoutes, { prefix: '/v1' });
await app.register(stripePaymentEventRoutes, { prefix: '/v1' });
await app.register(stripeConnectEventRoutes, { prefix: '/v1' });
await app.register(paymentRoutes, { prefix: '/v1' });
await app.register(operationsAccessRoutes, { prefix: '/v1' });
await app.register(operationsDashboardRoutes, { prefix: '/v1' });
await app.register(operationsRiskRoutes, { prefix: '/v1' });
await app.register(operationsRoutes, { prefix: '/v1' });
await app.register(operationsVerificationRoutes, { prefix: '/v1' });
await app.register(operationsPaymentRoutes, { prefix: '/v1' });
await app.register(operationsSettlementRoutes, { prefix: '/v1' });
await app.register(operationsDisputeRoutes, { prefix: '/v1' });
await app.register(operationRecordRoutes, { prefix: '/v1' });
await app.register(moderationRoutes, { prefix: '/v1' });
await app.register(moderationParticipantRoutes, { prefix: '/v1' });
await app.register(orderActivityRoutes, { prefix: '/v1' });
await app.register(orderCancellationRoutes, { prefix: '/v1' });
await app.register(orderDeliveryRoutes, { prefix: '/v1' });
await app.register(orderFulfilmentRoutes, { prefix: '/v1' });
await app.register(orderPaymentContextRoutes, { prefix: '/v1' });
await app.register(orderProtectionRoutes, { prefix: '/v1' });
await app.register(messageRoutes, { prefix: '/v1' });
await app.register(notificationRoutes, { prefix: '/v1' });
await app.register(reportRoutes, { prefix: '/v1' });
await app.register(sessionManagementRoutes, { prefix: '/v1' });

try {
  await app.listen({ host: env.API_HOST, port: env.API_PORT });
} catch (error) {
  const report = errorReport({ error, route: 'startup', method: 'START' });
  try {
    await getErrorReporter().capture(report);
  } catch {
    // Startup already failed; keep the final path deterministic and secret-free.
  }
  app.log.error({ event: 'api_startup_failed', errorName: report.errorName });
  process.exit(1);
}
