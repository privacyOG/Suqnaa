import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { SellerVerificationConfiguration } from '../config/seller-verification-config.js';
import { closeDb, db } from '../db/index.js';
import { applySellerVerificationProviderEvent } from './provider-event-service.js';
import type { SellerVerificationProviderHeaders } from './provider-event.js';
import type { ProviderSessionInput, SellerVerificationProvider } from './provider.js';
import {
  readSellerVerificationStatus,
  reviewSellerVerification,
  SellerVerificationError,
  startSellerVerification
} from './service.js';

const sellerId = randomUUID();
const businessId = randomUUID();
const reviewerId = randomUUID();
const now = new Date();
const calls: ProviderSessionInput[] = [];

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

const provider: SellerVerificationProvider = {
  name: 'identity_relay',
  async createSession(input) {
    calls.push(input);
    return {
      reference: input.reference ?? `ref-${input.checkId}`,
      hostedUrl: `https://verify.example.test/flow/${input.checkId}`,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000)
    };
  }
};

try {
  await db.insertInto('users').values([
    {
      id: sellerId,
      email: 'seller-verification@example.test',
      display_name: 'Seller Verification',
      status: 'active',
      email_verified_at: now,
      created_at: now,
      updated_at: now
    },
    {
      id: businessId,
      email: 'business-verification@example.test',
      display_name: 'Business Verification',
      status: 'active',
      email_verified_at: now,
      created_at: now,
      updated_at: now
    },
    {
      id: reviewerId,
      email: 'verification-reviewer@example.test',
      display_name: 'Verification Reviewer',
      status: 'active',
      email_verified_at: now,
      created_at: now,
      updated_at: now
    }
  ]).execute();

  await db.updateTable('user_profiles')
    .set({ is_business: true, business_name: 'Example Business', country_code: 'AU', updated_at: now })
    .where('user_id', '=', businessId)
    .execute();

  const started = await startSellerVerification({
    userId: sellerId,
    level: 'seller',
    countryCode: 'AU',
    configuration,
    provider
  });
  assert.equal(started.action, 'create');
  assert.match(started.hostedUrl, /^https:\/\/verify\.example\.test\/flow\//);
  assert.equal(calls[0]?.action, 'create');

  const resumed = await startSellerVerification({
    userId: sellerId,
    level: 'seller',
    countryCode: 'AU',
    configuration,
    provider
  });
  assert.equal(resumed.action, 'resume');
  assert.equal(calls[1]?.action, 'resume');
  assert.equal(calls[1]?.reference, calls[0]?.reference ?? `ref-${started.checkId}`);

  const headers: SellerVerificationProviderHeaders = {
    provider: 'identity_relay',
    eventId: 'seller-event-1',
    timestamp: String(Math.floor(Date.now() / 1000)),
    signature: '0'.repeat(64)
  };
  const passedEvent = {
    type: 'seller_verification.updated' as const,
    providerReference: `ref-${started.checkId}`,
    result: 'passed' as const,
    occurredAt: new Date().toISOString()
  };
  const applied = await applySellerVerificationProviderEvent({ headers, event: passedEvent });
  assert.equal(applied.duplicate, false);

  const pendingAfterProvider = await db.selectFrom('verification_checks')
    .select(['status', 'provider_result'])
    .where('id', '=', started.checkId)
    .executeTakeFirstOrThrow();
  assert.equal(pendingAfterProvider.status, 'pending');
  assert.equal(pendingAfterProvider.provider_result, 'passed');

  const duplicate = await applySellerVerificationProviderEvent({ headers, event: passedEvent });
  assert.equal(duplicate.duplicate, true);
  await assert.rejects(
    () => applySellerVerificationProviderEvent({
      headers,
      event: { ...passedEvent, result: 'failed', reasonCode: 'document_mismatch' }
    }),
    (error: unknown) => error instanceof SellerVerificationError && error.code === 'event_replay_conflict'
  );

  const approved = await reviewSellerVerification({
    checkId: started.checkId,
    reviewerId,
    decision: 'approve',
    validityDays: 365
  });
  assert.equal(approved.status, 'verified');
  assert.ok(approved.expiresAt);

  const sellerStatus = await readSellerVerificationStatus(sellerId, configuration);
  assert.equal(sellerStatus?.current?.status, 'verified');
  assert.equal(sellerStatus?.eligibleLevel, 'seller');

  await assert.rejects(
    () => startSellerVerification({
      userId: sellerId,
      level: 'seller',
      countryCode: 'AU',
      configuration,
      provider
    }),
    (error: unknown) => error instanceof SellerVerificationError && error.code === 'already_verified'
  );

  await db.updateTable('verification_checks')
    .set({ expires_at: new Date(Date.now() - 1000) })
    .where('id', '=', started.checkId)
    .execute();
  const expiredSeller = await readSellerVerificationStatus(sellerId, configuration);
  assert.equal(expiredSeller?.current?.status, 'expired');
  assert.equal(expiredSeller?.current?.reasonCode, 'verification_expired');

  const businessStarted = await startSellerVerification({
    userId: businessId,
    level: 'business',
    countryCode: 'AU',
    configuration,
    provider
  });
  await db.updateTable('verification_checks')
    .set({ provider_result: 'review_required', provider_completed_at: new Date() })
    .where('id', '=', businessStarted.checkId)
    .execute();
  await assert.rejects(
    () => reviewSellerVerification({
      checkId: businessStarted.checkId,
      reviewerId,
      decision: 'approve',
      validityDays: 365
    }),
    (error: unknown) => error instanceof SellerVerificationError && error.code === 'review_note_required'
  );
  await reviewSellerVerification({
    checkId: businessStarted.checkId,
    reviewerId,
    decision: 'approve',
    note: 'Provider requested manual review; evidence accepted.',
    validityDays: 365
  });

  await db.updateTable('user_profiles')
    .set({ business_name: 'Renamed Business', updated_at: new Date() })
    .where('user_id', '=', businessId)
    .execute();
  const businessAfterRename = await readSellerVerificationStatus(businessId, configuration);
  assert.equal(businessAfterRename?.current?.status, 'expired');
  assert.equal(businessAfterRename?.current?.reasonCode, 'verified_subject_changed');

  console.log('Seller verification lifecycle service tests passed.');
} finally {
  await db.deleteFrom('users').where('id', 'in', [sellerId, businessId, reviewerId]).execute();
  await closeDb();
}
