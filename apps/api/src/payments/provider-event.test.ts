import assert from 'node:assert/strict';
import {
  decidePaymentHeldTransition,
  normalizePaymentAmount,
  normalizePaymentCurrency,
  paymentEventFingerprint,
  paymentEventHeaderSchema,
  paymentHeldEventSchema,
  signPaymentEvent,
  verifyPaymentEventSignature
} from './provider-event.js';

const configuration = {
  enabled: true,
  provider: 'verified_gateway',
  signingSecret: 's'.repeat(48),
  maxAgeSeconds: 300
} as const;
const event = paymentHeldEventSchema.parse({
  type: 'payment.held',
  paymentIntentId: '123e4567-e89b-42d3-a456-426614174000',
  providerReference: 'pay_12345',
  amount: '125.50',
  currencyCode: 'AUD',
  occurredAt: '2026-07-21T12:00:00.000Z'
});
const unsignedHeaders = {
  provider: 'verified_gateway',
  eventId: 'evt_12345',
  timestamp: '1784635500'
};
const signature = signPaymentEvent(
  configuration.signingSecret,
  unsignedHeaders,
  event
);
const headers = paymentEventHeaderSchema.parse({
  ...unsignedHeaders,
  signature
});

assert.deepEqual(
  verifyPaymentEventSignature(
    configuration,
    headers,
    event,
    1784635500 * 1000
  ),
  { verified: true, reason: 'verified' }
);
assert.equal(signature.length, 64);
assert.deepEqual(
  verifyPaymentEventSignature(
    configuration,
    { ...headers, signature: '0'.repeat(64) },
    event,
    1784635500 * 1000
  ),
  { verified: false, reason: 'signature_mismatch' }
);
assert.deepEqual(
  verifyPaymentEventSignature(
    configuration,
    headers,
    event,
    (1784635500 + 301) * 1000
  ),
  { verified: false, reason: 'timestamp_expired' }
);
assert.deepEqual(
  verifyPaymentEventSignature(
    configuration,
    headers,
    event,
    (1784635500 - 61) * 1000
  ),
  { verified: false, reason: 'timestamp_in_future' }
);
assert.deepEqual(
  verifyPaymentEventSignature(
    configuration,
    { ...headers, provider: 'other_gateway' },
    event,
    1784635500 * 1000
  ),
  { verified: false, reason: 'provider_mismatch' }
);

const fingerprint = paymentEventFingerprint(configuration.provider, event);
assert.equal(fingerprint.length, 64);
assert.equal(
  fingerprint,
  paymentEventFingerprint(configuration.provider, event)
);
assert.notEqual(
  fingerprint,
  paymentEventFingerprint(configuration.provider, {
    ...event,
    providerReference: 'pay_other'
  })
);

assert.equal(normalizePaymentAmount('125.5'), '125.50');
assert.equal(normalizePaymentAmount(125.5), '125.50');
assert.equal(normalizePaymentCurrency(' aud '), 'AUD');
assert.throws(() => normalizePaymentAmount('0'), /invalid/);
assert.throws(() => normalizePaymentCurrency('AU'), /invalid/);
assert.throws(
  () => paymentHeldEventSchema.parse({ ...event, amount: '125.5' }),
  /exactly two/
);
assert.throws(
  () => paymentEventHeaderSchema.parse({
    ...headers,
    eventId: '../event'
  }),
  /payment event identifier/
);

const emptyEvidence = {
  configuredProvider: 'verified_gateway',
  eventProviderReference: 'pay_12345',
  orderProvider: null,
  orderProviderReference: null,
  paymentProvider: null,
  paymentProviderReference: null
};

assert.deepEqual(
  decidePaymentHeldTransition({
    ...emptyEvidence,
    orderStatus: 'pending',
    paymentStatus: 'created'
  }),
  { allowed: true, unchanged: false, reason: 'allowed' }
);
for (const paymentStatus of [
  'awaiting_payment',
  'funds_received'
] as const) {
  assert.equal(
    decidePaymentHeldTransition({
      ...emptyEvidence,
      orderStatus: 'pending',
      paymentStatus
    }).allowed,
    true
  );
}

const exactEvidence = {
  ...emptyEvidence,
  orderProvider: 'verified_gateway',
  orderProviderReference: 'pay_12345',
  paymentProvider: 'verified_gateway',
  paymentProviderReference: 'pay_12345'
};
assert.deepEqual(
  decidePaymentHeldTransition({
    ...exactEvidence,
    orderStatus: 'paid',
    paymentStatus: 'held'
  }),
  { allowed: true, unchanged: true, reason: 'already_applied' }
);
assert.equal(
  decidePaymentHeldTransition({
    ...emptyEvidence,
    orderStatus: 'paid',
    paymentStatus: 'held'
  }).reason,
  'provider_evidence_conflict'
);
assert.equal(
  decidePaymentHeldTransition({
    ...emptyEvidence,
    orderStatus: 'cancelled',
    paymentStatus: 'cancelled'
  }).reason,
  'invalid_order_state'
);
assert.equal(
  decidePaymentHeldTransition({
    ...emptyEvidence,
    orderStatus: 'pending',
    paymentStatus: 'held'
  }).reason,
  'invalid_payment_state'
);
assert.equal(
  decidePaymentHeldTransition({
    ...emptyEvidence,
    paymentProvider: 'other_gateway',
    paymentProviderReference: 'pay_12345',
    orderStatus: 'pending',
    paymentStatus: 'created'
  }).reason,
  'provider_evidence_conflict'
);
