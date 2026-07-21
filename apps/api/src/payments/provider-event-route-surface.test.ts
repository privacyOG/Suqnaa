import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const route = readFileSync(
  new URL('../routes/payment-provider-events.ts', import.meta.url),
  'utf8'
);
const policy = readFileSync(
  new URL('./provider-event.ts', import.meta.url),
  'utf8'
);
const configuration = readFileSync(
  new URL('../config/payment-event-config.ts', import.meta.url),
  'utf8'
);
const environment = readFileSync(
  new URL('../config/env.ts', import.meta.url),
  'utf8'
);
const server = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
const migration = readFileSync(
  new URL(
    '../../../../infra/db/migrations/010_payment_provider_events.sql',
    import.meta.url
  ),
  'utf8'
);

assert.match(route, /app\.post\('\/payments\/provider-events'/);
assert.doesNotMatch(route, /requireUser/);
assert.doesNotMatch(route, /checkHumanProtectionWithChallenge/);
assert.match(route, /PAYMENT_EVENT_PROVIDER/);
assert.match(route, /PAYMENT_EVENT_SIGNING_SECRET/);
assert.match(route, /PAYMENT_EVENT_MAX_AGE_SECONDS/);
assert.match(route, /payment\.provider_event\.ip/);
assert.match(route, /x-suqnaa-payment-provider/);
assert.match(route, /x-suqnaa-payment-event-id/);
assert.match(route, /x-suqnaa-payment-event-timestamp/);
assert.match(route, /x-suqnaa-payment-signature/);
assert.match(route, /verifyPaymentEventSignature/);
assert.match(route, /paymentEventFingerprint/);
assert.match(route, /db\.transaction\(\)\.execute/);
assert.match(route, /selectFrom\('payment_provider_events'\)/);
assert.match(route, /insertInto\('payment_provider_events'\)/);
assert.match(route, /provider_event_id/);
assert.match(route, /event_replay_conflict/);
assert.match(route, /assertOrderPaymentContextMatches/);
assert.match(route, /normalizePaymentAmount/);
assert.match(route, /normalizePaymentCurrency/);
assert.match(route, /decidePaymentHeldTransition/);
assert.match(route, /updateTable\('transactions'\)/);
assert.match(route, /status: 'paid'/);
assert.match(route, /where\('status', '=', 'pending'\)/);
assert.match(route, /payment_provider: eventConfiguration\.provider/);
assert.match(route, /payment_reference: event\.providerReference/);
assert.match(route, /currentIntent\.status !== 'held'/);
assert.doesNotMatch(route, /updateTable\('payment_intents'\)/);
assert.doesNotMatch(route, /status: '(released|refunded|disputed)'/);
assert.match(route, /collectionEnabled: false/);
assert.match(route, /releaseEnabled: false/);
assert.match(route, /refundEnabled: false/);
assert.match(route, /disputeResolutionEnabled: false/);
assert.match(route, /writeSecurityAudit/);

assert.match(policy, /createHmac/);
assert.match(policy, /timingSafeEqual/);
assert.match(policy, /suqnaa-payment-event-v1/);
assert.match(policy, /payment\.held/);
assert.match(policy, /timestamp_expired/);
assert.match(policy, /timestamp_in_future/);
assert.match(policy, /signature_mismatch/);
assert.match(policy, /provider_evidence_conflict/);
assert.match(policy, /input\.orderStatus !== 'pending'/);
assert.match(policy, /input\.paymentStatus !== 'created'/);
assert.match(policy, /input\.paymentStatus !== 'awaiting_payment'/);
assert.match(policy, /input\.paymentStatus !== 'funds_received'/);

assert.match(configuration, /provider === 'none'/);
assert.match(configuration, /signingSecret\.length < 32/);
assert.match(configuration, /signingSecret\.length > 512/);
assert.match(configuration, /maxAgeSeconds < 30/);
assert.match(configuration, /maxAgeSeconds > 900/);
assert.match(environment, /PAYMENT_EVENT_PROVIDER/);
assert.match(environment, /PAYMENT_EVENT_SIGNING_SECRET/);
assert.match(environment, /PAYMENT_EVENT_MAX_AGE_SECONDS/);

assert.match(
  server,
  /import \{ paymentProviderEventRoutes \} from '\.\/routes\/payment-provider-events\.js'/
);
assert.match(
  server,
  /app\.register\(paymentProviderEventRoutes, \{ prefix: '\/v1' \}\)/
);

assert.match(migration, /CREATE TABLE payment_provider_events/);
assert.match(migration, /payment_provider_events_provider_id_unique/);
assert.match(migration, /UNIQUE \(\s*provider,\s*provider_event_id\s*\)/);
assert.match(migration, /event_type = 'payment\.held'/);
assert.match(migration, /payload_fingerprint ~ '\^\[a-f0-9\]\{64\}\$'/);
assert.match(migration, /processing_result IN \('processed', 'unchanged'\)/);
assert.match(migration, /REFERENCES payment_intents\(id\) ON DELETE RESTRICT/);
