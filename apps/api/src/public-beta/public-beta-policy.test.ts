import assert from 'node:assert/strict';
import {
  publicBetaFeatureForRoute,
  publicBetaRequestAllowed,
  resolvePublicBetaConfiguration
} from './public-beta-policy.js';

const base = {
  NODE_ENV: 'production',
  PUBLIC_BETA_ENABLED: 'true',
  PUBLIC_BETA_REGISTRATION_ENABLED: 'true',
  PUBLIC_BETA_LISTING_WRITE_ENABLED: 'true',
  PUBLIC_BETA_MESSAGING_ENABLED: 'true',
  PUBLIC_BETA_TRADING_ENABLED: 'true',
  PUBLIC_BETA_PAYMENT_COLLECTION_ENABLED: 'true',
  PUBLIC_BETA_SELLER_VERIFICATION_ENABLED: 'false',
  PUBLIC_BETA_SELLER_SETTLEMENT_ENABLED: 'false',
  PUBLIC_BETA_DISPUTES_REPORTS_ENABLED: 'true',
  PUBLIC_BETA_APPROVED_PAYMENT_PROVIDER: 'stripe_test',
  PUBLIC_BETA_APPROVED_SELLER_VERIFICATION_PROVIDER: 'none',
  PAYMENT_COLLECTION_PROVIDER: 'stripe',
  STRIPE_SECRET_KEY: 'sk_test_abcdefghijklmnop',
  PAYMENT_COLLECTION_LIVE_APPROVED: 'false',
  SELLER_VERIFICATION_PROVIDER: 'none',
  SELLER_SETTLEMENT_ENABLED: 'false',
  SELLER_SETTLEMENT_LIVE_APPROVED: 'false'
} satisfies NodeJS.ProcessEnv;

const configuration = resolvePublicBetaConfiguration(base);
assert.equal(configuration.enabled, true);
assert.equal(configuration.features.trading, true);
assert.equal(configuration.features.seller_settlement, false);
assert.equal(configuration.approvedPaymentProvider, 'stripe_test');

assert.equal(publicBetaFeatureForRoute('POST', '/v1/auth/register'), 'registration');
assert.equal(publicBetaFeatureForRoute('POST', '/v1/listings'), 'listing_write');
assert.equal(publicBetaFeatureForRoute('GET', '/v1/listings'), null);
assert.equal(publicBetaFeatureForRoute('POST', '/v1/market/offers'), 'trading');
assert.equal(publicBetaFeatureForRoute('POST', '/v1/reports'), 'disputes_reports');
assert.equal(publicBetaRequestAllowed(configuration, 'POST', '/v1/market/offers'), true);
assert.equal(publicBetaRequestAllowed(configuration, 'POST', '/v1/seller-payouts'), false);

assert.throws(
  () => resolvePublicBetaConfiguration({ ...base, PUBLIC_BETA_TRADING_ENABLED: undefined }),
  /must be explicitly true or false/
);
assert.throws(
  () => resolvePublicBetaConfiguration({ ...base, NODE_ENV: 'development' }),
  /requires NODE_ENV=production/
);
assert.throws(
  () => resolvePublicBetaConfiguration({
    ...base,
    STRIPE_SECRET_KEY: 'sk_live_abcdefghijklmnop'
  }),
  /not approved for public beta/
);
assert.throws(
  () => resolvePublicBetaConfiguration({
    ...base,
    PUBLIC_BETA_PAYMENT_COLLECTION_ENABLED: 'false',
    PUBLIC_BETA_APPROVED_PAYMENT_PROVIDER: 'none'
  }),
  /provider must be disabled/
);
assert.throws(
  () => resolvePublicBetaConfiguration({
    ...base,
    PUBLIC_BETA_SELLER_VERIFICATION_ENABLED: 'true',
    PUBLIC_BETA_APPROVED_SELLER_VERIFICATION_PROVIDER: 'approved_vendor',
    SELLER_VERIFICATION_PROVIDER: 'different_vendor'
  }),
  /not approved for public beta/
);
assert.throws(
  () => resolvePublicBetaConfiguration({
    ...base,
    PUBLIC_BETA_SELLER_SETTLEMENT_ENABLED: 'true',
    SELLER_SETTLEMENT_ENABLED: 'true',
    SELLER_SETTLEMENT_LIVE_APPROVED: 'false'
  }),
  /requires explicit live settlement approval/
);

const disabled = resolvePublicBetaConfiguration({ PUBLIC_BETA_ENABLED: 'false' });
assert.equal(disabled.enabled, false);
assert.equal(publicBetaRequestAllowed(disabled, 'POST', '/v1/seller-payouts'), true);

console.log('Public beta policy tests passed.');
