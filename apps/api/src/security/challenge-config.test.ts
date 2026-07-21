import assert from 'node:assert/strict';
import {
  buildPublicChallengeConfiguration,
  challengeActions
} from './challenge-config.js';

const disabled = buildPublicChallengeConfiguration({
  provider: 'turnstile',
  siteKey: '',
  secretKey: ''
});

assert.deepEqual(disabled, {
  provider: 'none',
  enabled: false,
  siteKey: null,
  actions: challengeActions
});

const enabled = buildPublicChallengeConfiguration({
  provider: 'turnstile',
  siteKey: 'public-site-key',
  secretKey: 'private-server-key'
});

assert.equal(enabled.provider, 'turnstile');
assert.equal(enabled.enabled, true);
assert.equal(enabled.siteKey, 'public-site-key');
assert.deepEqual(enabled.actions, {
  accountLogin: 'account_login',
  accountRegister: 'account_register',
  listingCreate: 'listing_create',
  listingStatusUpdate: 'listing_status_update',
  messageCreate: 'message_create',
  offerCreate: 'offer_create',
  offerManage: 'offer_manage',
  orderCreate: 'order_create',
  orderCancel: 'order_cancel',
  paymentCheckout: 'payment_checkout_prepare',
  reportCreate: 'report_create'
});

assert.throws(
  () => buildPublicChallengeConfiguration({
    provider: 'turnstile',
    siteKey: '',
    secretKey: '',
    nodeEnv: 'production'
  }),
  /incomplete/
);
