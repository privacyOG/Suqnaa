import assert from 'node:assert/strict';
import { resolvePaymentEventConfiguration } from './payment-event-config.js';

assert.deepEqual(resolvePaymentEventConfiguration({}), {
  enabled: false,
  provider: 'none',
  signingSecret: '',
  maxAgeSeconds: 300
});

assert.deepEqual(
  resolvePaymentEventConfiguration({
    provider: 'verified_gateway',
    signingSecret: 'a'.repeat(48),
    maxAgeSeconds: 120
  }),
  {
    enabled: true,
    provider: 'verified_gateway',
    signingSecret: 'a'.repeat(48),
    maxAgeSeconds: 120
  }
);

assert.throws(
  () => resolvePaymentEventConfiguration({ signingSecret: 'a'.repeat(48) }),
  /requires an enabled/
);
assert.throws(
  () => resolvePaymentEventConfiguration({
    provider: 'verified_gateway',
    signingSecret: 'too-short'
  }),
  /32 to 512/
);
assert.throws(
  () => resolvePaymentEventConfiguration({
    provider: '../gateway',
    signingSecret: 'a'.repeat(48)
  }),
  /safe provider identifier/
);
assert.throws(
  () => resolvePaymentEventConfiguration({ maxAgeSeconds: 10 }),
  /30 to 900/
);
