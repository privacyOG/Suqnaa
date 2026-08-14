import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { closeDb, db } from '../db/index.js';
import {
  applyListingModerationAction,
  decideModerationAppeal,
  openModerationAppeal
} from '../moderation/moderation-policy-service.js';

const sellerId = randomUUID();
const moderatorId = randomUUID();
const reviewerId = randomUUID();
const listingId = randomUUID();
const now = new Date();
let actionId = '';
let appealId = '';

try {
  await db.insertInto('users').values([
    {
      id: sellerId,
      email: `p1-15-moderation-seller-${sellerId}@example.test`,
      display_name: 'P1-15 Moderation Seller',
      status: 'active', email_verified_at: now, created_at: now, updated_at: now
    },
    {
      id: moderatorId,
      email: `p1-15-moderator-${moderatorId}@example.test`,
      display_name: 'P1-15 Moderator',
      status: 'active', email_verified_at: now, created_at: now, updated_at: now
    },
    {
      id: reviewerId,
      email: `p1-15-reviewer-${reviewerId}@example.test`,
      display_name: 'P1-15 Appeal Reviewer',
      status: 'active', email_verified_at: now, created_at: now, updated_at: now
    }
  ]).execute();

  await db.insertInto('listings').values({
    id: listingId,
    seller_id: sellerId,
    title: 'P1-15 moderation listing',
    description: 'Database-backed moderation and appeal integration test listing.',
    price_amount: '75.00',
    currency_code: 'AUD',
    condition: 'good',
    availability_status: 'in_stock',
    available_quantity: 1,
    status: 'active',
    country_code: 'AU',
    allow_pickup: true,
    allow_delivery: false,
    published_at: now,
    created_at: now,
    updated_at: now
  }).execute();

  const takedown = await applyListingModerationAction({
    listingId,
    actorId: moderatorId,
    action: 'takedown',
    reasonCode: 'integration.review',
    reason: 'P1-15 integration test moderation decision.'
  });
  actionId = takedown.actionId;
  assert.equal(takedown.status, 'removed');
  assert.equal((await db.selectFrom('listings').select('status').where('id', '=', listingId).executeTakeFirstOrThrow()).status, 'removed');

  const action = await db.selectFrom('moderation_actions')
    .select(['id', 'listing_id', 'action_type', 'status', 'acted_by', 'evidence_snapshot'])
    .where('id', '=', actionId)
    .executeTakeFirstOrThrow();
  assert.equal(action.listing_id, listingId);
  assert.equal(action.action_type, 'listing_takedown');
  assert.equal(action.status, 'active');
  assert.equal(action.acted_by, moderatorId);
  assert.ok(action.evidence_snapshot);

  const appeal = await openModerationAppeal({
    actionId,
    appellantUserId: sellerId,
    reason: 'Requesting independent review of the listing takedown.'
  });
  appealId = appeal.appealId;
  const opened = await db.selectFrom('moderation_appeals')
    .select(['status', 'appellant_user_id'])
    .where('id', '=', appealId)
    .executeTakeFirstOrThrow();
  assert.equal(opened.status, 'open');
  assert.equal(opened.appellant_user_id, sellerId);

  const decision = await decideModerationAppeal({
    appealId,
    reviewerUserId: reviewerId,
    decision: 'overturn',
    note: 'Independent review restores the listing for this integration journey.'
  });
  assert.equal(decision.status, 'overturned');

  const restored = await db.selectFrom('listings').select('status').where('id', '=', listingId).executeTakeFirstOrThrow();
  assert.equal(restored.status, 'active');
  const reversedAction = await db.selectFrom('moderation_actions')
    .select(['status', 'reversed_by'])
    .where('id', '=', actionId)
    .executeTakeFirstOrThrow();
  assert.equal(reversedAction.status, 'reversed');
  assert.equal(reversedAction.reversed_by, reviewerId);

  const audits = await db.selectFrom('audit_logs')
    .select(['action', 'actor_user_id'])
    .where('entity_id', 'in', [listingId, appealId])
    .execute();
  assert.ok(audits.some((row) => row.action === 'moderation.listing_takedown' && row.actor_user_id === moderatorId));
  assert.ok(audits.some((row) => row.action === 'moderation.appeal_decision' && row.actor_user_id === reviewerId));

  console.log('P1-15 moderation and appeal database journey passed.');
} finally {
  if (appealId) await db.deleteFrom('audit_logs').where('entity_id', '=', appealId).execute();
  await db.deleteFrom('audit_logs').where('entity_id', '=', listingId).execute();
  if (appealId) await db.deleteFrom('moderation_appeals').where('id', '=', appealId).execute();
  if (actionId) {
    await db.deleteFrom('moderation_notes').where('moderation_action_id', '=', actionId).execute();
    await db.deleteFrom('moderation_actions').where('id', '=', actionId).execute();
  }
  await db.deleteFrom('listings').where('id', '=', listingId).execute();
  await db.deleteFrom('users').where('id', 'in', [sellerId, moderatorId, reviewerId]).execute();
  await closeDb();
}
