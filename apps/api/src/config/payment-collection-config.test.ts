import assert from 'node:assert/strict';
import { resolvePaymentCollectionConfiguration } from './payment-collection-config.js';

const disabled = resolvePaymentCollectionConfiguration({
  nodeEnv: 'test',
  provider: 'none',
  webOrigin: 'http://localhost:3000'
});
assert.equal(disabled.enabled, false);
assert.equal(disabled.provider, null);
assert.equal(disabled.apiVersion, '2026-02-25.clover');

const testMode = resolvePaymentCollectionConfiguration({
  nodeEnv: 'test',
  provider: 'stripe',
  stripeSecretKey: 'sk_test_1234567890abcdef',
  stripeWebhookSecret: 'whsec_1234567890abcdef',
  webOrigin: 'https://suqnaa.example'
});
assert.equal(testMode.enabled, true);
assert.equal(testMode.provider, 'stripe');
assert.equal(testMode.liveMode, false);
assert.equal(testMode.webOrigin, 'https://suqnaa.example');

assert.throws(() => resolvePaymentCollectionConfiguration({
  nodeEnv: 'production',
  provider: 'stripe',
  stripeSecretKey: 'sk_live_1234567890abcdef',
  stripeWebhookSecret: 'whsec_1234567890abcdef',
  webOrigin: 'https://suqnaa.example'
}), /explicit approval/);

const live = resolvePaymentCollectionConfiguration({
  nodeEnv: 'production',
  provider: 'stripe',
  stripeSecretKey: 'sk_live_1234567890abcdef',
  stripeWebhookSecret: 'whsec_1234567890abcdef',
  liveApproved: 'true',
  webOrigin: 'https://suqnaa.example'
});
assert.equal(live.liveMode, true);

assert.throws(() => resolvePaymentCollectionConfiguration({
  nodeEnv: 'test',
  provider: 'none',
  stripeSecretKey: 'sk_test_1234567890abcdef'
}), /require PAYMENT_COLLECTION_PROVIDER=stripe/);

assert.throws(() => resolvePaymentCollectionConfiguration({
  nodeEnv: 'production',
  provider: 'stripe',
  stripeSecretKey: 'sk_test_1234567890abcdef',
  stripeWebhookSecret: 'whsec_1234567890abcdef',
  webOrigin: 'http://suqnaa.example'
}), /trusted origin/);
