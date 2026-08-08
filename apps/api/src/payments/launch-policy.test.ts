import assert from 'node:assert/strict';
import {
  evaluateInitialLaunchPayment,
  initialLaunchPolicy
} from './launch-policy.js';

assert.deepEqual(initialLaunchPolicy.countries, ['AU']);
assert.deepEqual(initialLaunchPolicy.currencies, ['AUD']);
assert.deepEqual(initialLaunchPolicy.paymentMethods, ['card', 'wallet']);
assert.equal(initialLaunchPolicy.legalModel, 'marketplace_intermediary');
assert.equal(initialLaunchPolicy.suqnaaIsMerchantOfRecord, false);
assert.equal(initialLaunchPolicy.suqnaaCustodiesCustomerFunds, false);
assert.equal(initialLaunchPolicy.virtualAssetPaymentsEnabled, false);

assert.deepEqual(
  evaluateInitialLaunchPayment({
    countryCode: 'au',
    currencyCode: 'aud',
    paymentMethod: 'card'
  }),
  { eligible: true }
);

assert.deepEqual(
  evaluateInitialLaunchPayment({
    countryCode: 'NZ',
    currencyCode: 'AUD',
    paymentMethod: 'card'
  }),
  { eligible: false, reason: 'country_not_launched' }
);

assert.deepEqual(
  evaluateInitialLaunchPayment({
    countryCode: 'AU',
    currencyCode: 'USD',
    paymentMethod: 'card'
  }),
  { eligible: false, reason: 'currency_not_launched' }
);

for (const paymentMethod of ['bank_transfer', 'xmr', 'crypto_other']) {
  assert.deepEqual(
    evaluateInitialLaunchPayment({
      countryCode: 'AU',
      currencyCode: 'AUD',
      paymentMethod
    }),
    { eligible: false, reason: 'payment_method_not_launched' }
  );
}
