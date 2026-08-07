import assert from 'node:assert/strict';
import { resolveSellerVerificationConfiguration } from './seller-verification-config.js';

assert.deepEqual(resolveSellerVerificationConfiguration({}), {
  enabled: false,
  provider: 'none',
  endpoint: '',
  token: '',
  signingSecret: '',
  timeoutMs: 5000,
  eventMaxAgeSeconds: 300,
  verifiedValidityDays: 365
});

const enabled = resolveSellerVerificationConfiguration({
  provider: 'identity_relay',
  endpoint: 'https://verify.example.test/session',
  token: 'verification-bearer-token-123',
  signingSecret: 'verification-signing-secret-1234567890',
  timeoutMs: 4000,
  eventMaxAgeSeconds: 240,
  verifiedValidityDays: 365,
  nodeEnv: 'production'
});
assert.equal(enabled.enabled, true);
assert.equal(enabled.provider, 'identity_relay');
assert.equal(enabled.endpoint, 'https://verify.example.test/session');

assert.throws(() => resolveSellerVerificationConfiguration({
  provider: 'identity_relay',
  endpoint: 'http://verify.example.test/session',
  token: 'verification-bearer-token-123',
  signingSecret: 'verification-signing-secret-1234567890',
  nodeEnv: 'production'
}), /trusted provider endpoint/);

assert.throws(() => resolveSellerVerificationConfiguration({
  provider: 'none',
  signingSecret: 'verification-signing-secret-1234567890'
}), /require an enabled provider/);

console.log('Seller verification configuration tests passed.');
