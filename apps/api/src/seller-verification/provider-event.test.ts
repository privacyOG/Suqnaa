import assert from 'node:assert/strict';
import type { SellerVerificationConfiguration } from '../config/seller-verification-config.js';
import {
  sellerVerificationEventFingerprint,
  signSellerVerificationEvent,
  verifySellerVerificationEventSignature,
  type SellerVerificationProviderEvent
} from './provider-event.js';

const configuration: SellerVerificationConfiguration = {
  enabled: true,
  provider: 'identity_relay',
  endpoint: 'https://verify.example.test/session',
  token: 'verification-bearer-token-123',
  signingSecret: 'verification-signing-secret-1234567890',
  timeoutMs: 5000,
  eventMaxAgeSeconds: 300,
  verifiedValidityDays: 365
};
const now = Date.now();
const event: SellerVerificationProviderEvent = {
  type: 'seller_verification.updated',
  providerReference: 'verification-ref-123',
  result: 'passed',
  occurredAt: new Date(now - 1000).toISOString()
};
const unsigned = {
  provider: 'identity_relay',
  eventId: 'event-123',
  timestamp: String(Math.floor(now / 1000))
};
const signature = signSellerVerificationEvent(configuration.signingSecret, unsigned, event);
const verified = verifySellerVerificationEventSignature(configuration, { ...unsigned, signature }, event, now);
assert.deepEqual(verified, { verified: true, reason: 'verified' });
assert.equal(sellerVerificationEventFingerprint(configuration.provider, event).length, 64);
assert.equal(
  verifySellerVerificationEventSignature(configuration, { ...unsigned, signature: '0'.repeat(64) }, event, now).reason,
  'signature_mismatch'
);
assert.equal(
  verifySellerVerificationEventSignature(configuration, {
    ...unsigned,
    timestamp: String(Math.floor((now - 10 * 60 * 1000) / 1000)),
    signature
  }, event, now).reason,
  'timestamp_expired'
);

console.log('Seller verification provider event tests passed.');
