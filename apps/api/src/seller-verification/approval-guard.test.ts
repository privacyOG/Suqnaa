import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { closeDb, db } from '../db/index.js';

const sellerId = randomUUID();
const reviewerId = randomUUID();
const checkId = randomUUID();
const now = new Date();

try {
  await db.insertInto('users').values([
    {
      id: sellerId,
      email: 'approval-guard-seller@example.test',
      display_name: 'Approval Guard Seller',
      status: 'active',
      created_at: now,
      updated_at: now
    },
    {
      id: reviewerId,
      email: 'approval-guard-reviewer@example.test',
      display_name: 'Approval Guard Reviewer',
      status: 'active',
      created_at: now,
      updated_at: now
    }
  ]).execute();

  await db.updateTable('user_profiles')
    .set({
      is_business: true,
      business_name: 'Original Business',
      updated_at: now
    })
    .where('user_id', '=', sellerId)
    .execute();

  await db.insertInto('verification_checks').values({
    id: checkId,
    user_id: sellerId,
    status: 'pending',
    level: 'business',
    provider: 'identity_relay',
    reference: `approval-guard-${checkId}`,
    country_code: 'AU',
    provider_result: 'passed',
    submitted_at: now,
    provider_completed_at: now,
    subject_snapshot: {
      countryCode: 'AU',
      businessName: 'Original Business'
    },
    created_at: now,
    updated_at: now
  }).execute();

  await db.updateTable('user_profiles')
    .set({ business_name: 'Changed Business', updated_at: new Date() })
    .where('user_id', '=', sellerId)
    .execute();

  await assert.rejects(
    () => db.updateTable('verification_checks')
      .set({
        status: 'verified',
        reviewed_by: reviewerId,
        reviewed_at: new Date(),
        verified_at: new Date(),
        expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        updated_at: new Date()
      })
      .where('id', '=', checkId)
      .execute(),
    /Business verification subject changed before approval/
  );

  const stillPending = await db.selectFrom('verification_checks')
    .select(['status'])
    .where('id', '=', checkId)
    .executeTakeFirstOrThrow();
  assert.equal(stillPending.status, 'pending');

  await db.updateTable('user_profiles')
    .set({ business_name: 'Original Business', updated_at: new Date() })
    .where('user_id', '=', sellerId)
    .execute();

  await db.updateTable('verification_checks')
    .set({
      status: 'verified',
      reviewed_by: reviewerId,
      reviewed_at: new Date(),
      verified_at: new Date(),
      expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      updated_at: new Date()
    })
    .where('id', '=', checkId)
    .execute();

  const verified = await db.selectFrom('verification_checks')
    .select(['status'])
    .where('id', '=', checkId)
    .executeTakeFirstOrThrow();
  assert.equal(verified.status, 'verified');

  console.log('Seller verification approval guard tests passed.');
} finally {
  await db.deleteFrom('users').where('id', 'in', [sellerId, reviewerId]).execute();
  await closeDb();
}
