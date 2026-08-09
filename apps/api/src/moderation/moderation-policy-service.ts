import { db } from '../db/index.js';

export const moderationEvidenceRetentionDays = 180;
export const moderationAppealWindowDays = 30;

export class ModerationPolicyError extends Error {
  constructor(
    message: string,
    readonly statusCode = 409
  ) {
    super(message);
    this.name = 'ModerationPolicyError';
  }
}

function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}

function normalizedText(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('en-AU').replace(/\s+/g, ' ').trim();
}

export async function evaluateListingModerationPolicy(input: {
  categoryId: string | null;
  title: string;
  description: string;
}) {
  const rules = await db.selectFrom('moderation_policy_rules')
    .select(['id', 'scope', 'category_id', 'pattern', 'action', 'reason_code', 'note'])
    .where('is_active', '=', true)
    .orderBy('updated_at', 'desc')
    .execute();

  const text = normalizedText(`${input.title}\n${input.description}`);
  const matches = rules.filter((rule) => {
    if (rule.scope === 'category') return Boolean(input.categoryId && rule.category_id === input.categoryId);
    const pattern = typeof rule.pattern === 'string' ? normalizedText(rule.pattern) : '';
    return pattern.length > 0 && text.includes(pattern);
  }).map((rule) => ({
    ruleId: String(rule.id),
    action: String(rule.action) as 'block' | 'manual_review',
    reasonCode: String(rule.reason_code),
    note: rule.note ? String(rule.note) : null
  }));

  const decision = matches.some((match) => match.action === 'block')
    ? 'block'
    : matches.some((match) => match.action === 'manual_review')
      ? 'manual_review'
      : 'allow';

  return { decision, matches } as const;
}

export async function createPolicyListingReview(input: {
  listingId: string;
  matches: Array<{ ruleId: string; action: 'block' | 'manual_review'; reasonCode: string; note: string | null }>;
}) {
  const now = new Date();
  const existing = await db.selectFrom('moderation_actions')
    .select(['id'])
    .where('listing_id', '=', input.listingId)
    .where('action_type', '=', 'listing_review_pending')
    .where('status', '=', 'active')
    .executeTakeFirst();
  if (existing) return { actionId: String(existing.id), duplicate: true };

  const listing = await db.selectFrom('listings')
    .select(['id', 'seller_id', 'category_id', 'title', 'description', 'status', 'updated_at'])
    .where('id', '=', input.listingId)
    .executeTakeFirst();
  if (!listing) throw new ModerationPolicyError('listing_not_found', 404);

  const reasonCodes = [...new Set(input.matches.map((match) => match.reasonCode))];
  const inserted = await db.insertInto('moderation_actions').values({
    report_id: null,
    listing_id: listing.id,
    user_id: null,
    action_type: 'listing_review_pending',
    source: 'policy',
    reason_code: reasonCodes[0] ?? 'policy.manual_review',
    reason: `Listing requires manual moderation review: ${reasonCodes.join(', ') || 'policy match'}`,
    status: 'active',
    acted_by: null,
    metadata: {
      policyRuleIds: input.matches.map((match) => match.ruleId),
      reasonCodes,
      previousStatus: listing.status
    },
    evidence_snapshot: {
      listingId: listing.id,
      sellerId: listing.seller_id,
      categoryId: listing.category_id,
      title: listing.title,
      description: listing.description,
      status: listing.status,
      listingUpdatedAt: listing.updated_at
    },
    evidence_retain_until: addDays(now, moderationEvidenceRetentionDays),
    created_at: now,
    updated_at: now
  }).returning(['id']).executeTakeFirstOrThrow();

  return { actionId: String(inserted.id), duplicate: false };
}

export async function applyListingModerationAction(input: {
  listingId: string;
  actorId: string;
  action: 'approve' | 'takedown';
  reasonCode: string;
  reason: string;
  reportId?: string | null;
}) {
  return db.transaction().execute(async (trx) => {
    const listing = await trx.selectFrom('listings')
      .select(['id', 'seller_id', 'category_id', 'title', 'description', 'status', 'updated_at'])
      .where('id', '=', input.listingId)
      .forUpdate()
      .executeTakeFirst();
    if (!listing) throw new ModerationPolicyError('listing_not_found', 404);
    if (input.action === 'approve' && ['sold', 'reserved'].includes(String(listing.status))) {
      throw new ModerationPolicyError('listing_cannot_be_approved');
    }
    if (input.action === 'takedown' && listing.status === 'sold') {
      throw new ModerationPolicyError('sold_listing_cannot_be_taken_down');
    }

    const now = new Date();
    const nextStatus = input.action === 'approve' ? 'active' : 'removed';
    await trx.updateTable('listings').set({
      status: nextStatus,
      updated_at: now,
      ...(input.action === 'approve' ? { published_at: now } : {})
    }).where('id', '=', listing.id).execute();

    if (input.action === 'approve') {
      await trx.updateTable('moderation_actions').set({
        status: 'superseded', updated_at: now
      }).where('listing_id', '=', listing.id)
        .where('action_type', '=', 'listing_review_pending')
        .where('status', '=', 'active')
        .execute();
    }

    const action = await trx.insertInto('moderation_actions').values({
      report_id: input.reportId ?? null,
      listing_id: listing.id,
      user_id: null,
      action_type: input.action === 'approve' ? 'listing_approve' : 'listing_takedown',
      source: 'moderator',
      reason_code: input.reasonCode,
      reason: input.reason,
      status: 'active',
      acted_by: input.actorId,
      metadata: { previousStatus: listing.status, resultingStatus: nextStatus },
      evidence_snapshot: {
        listingId: listing.id,
        sellerId: listing.seller_id,
        categoryId: listing.category_id,
        title: listing.title,
        description: listing.description,
        status: listing.status,
        listingUpdatedAt: listing.updated_at
      },
      evidence_retain_until: addDays(now, moderationEvidenceRetentionDays),
      created_at: now,
      updated_at: now
    }).returning(['id', 'action_type', 'created_at']).executeTakeFirstOrThrow();

    await trx.insertInto('audit_logs').values({
      actor_user_id: input.actorId,
      action: `moderation.${input.action === 'approve' ? 'listing_approve' : 'listing_takedown'}`,
      entity_type: 'listing',
      entity_id: listing.id,
      metadata: { moderationActionId: action.id, reasonCode: input.reasonCode, reportId: input.reportId ?? null },
      created_at: now
    }).execute();

    return { actionId: String(action.id), listingId: String(listing.id), status: nextStatus };
  });
}

export async function applyAccountModerationAction(input: {
  userId: string;
  actorId: string;
  action: 'suspend' | 'close';
  reasonCode: string;
  reason: string;
  reportId?: string | null;
}) {
  if (input.userId === input.actorId) throw new ModerationPolicyError('self_moderation_forbidden', 403);
  return db.transaction().execute(async (trx) => {
    const user = await trx.selectFrom('users')
      .select(['id', 'display_name', 'status', 'email_verified_at', 'phone_verified_at', 'updated_at'])
      .where('id', '=', input.userId)
      .forUpdate()
      .executeTakeFirst();
    if (!user) throw new ModerationPolicyError('account_not_found', 404);
    if (user.status === 'closed') throw new ModerationPolicyError('account_already_closed');

    const now = new Date();
    const nextStatus = input.action === 'close' ? 'closed' : 'suspended';
    await trx.updateTable('users').set({ status: nextStatus, updated_at: now }).where('id', '=', user.id).execute();

    const action = await trx.insertInto('moderation_actions').values({
      report_id: input.reportId ?? null,
      listing_id: null,
      user_id: user.id,
      action_type: input.action === 'close' ? 'account_close' : 'account_suspend',
      source: 'moderator',
      reason_code: input.reasonCode,
      reason: input.reason,
      status: 'active',
      acted_by: input.actorId,
      metadata: { previousStatus: user.status, resultingStatus: nextStatus },
      evidence_snapshot: {
        userId: user.id,
        displayName: user.display_name,
        status: user.status,
        emailVerified: Boolean(user.email_verified_at),
        phoneVerified: Boolean(user.phone_verified_at),
        accountUpdatedAt: user.updated_at
      },
      evidence_retain_until: addDays(now, moderationEvidenceRetentionDays),
      created_at: now,
      updated_at: now
    }).returning(['id']).executeTakeFirstOrThrow();

    await trx.insertInto('audit_logs').values({
      actor_user_id: input.actorId,
      action: `moderation.${input.action === 'close' ? 'account_close' : 'account_suspend'}`,
      entity_type: 'user',
      entity_id: user.id,
      metadata: { moderationActionId: action.id, reasonCode: input.reasonCode, reportId: input.reportId ?? null },
      created_at: now
    }).execute();

    return { actionId: String(action.id), userId: String(user.id), status: nextStatus };
  });
}

export async function addModeratorNote(input: { actionId: string; authorUserId: string; note: string }) {
  const action = await db.selectFrom('moderation_actions').select(['id']).where('id', '=', input.actionId).executeTakeFirst();
  if (!action) throw new ModerationPolicyError('moderation_action_not_found', 404);
  const row = await db.insertInto('moderation_notes').values({
    moderation_action_id: action.id,
    author_user_id: input.authorUserId,
    note: input.note.trim(),
    created_at: new Date()
  }).returning(['id', 'created_at']).executeTakeFirstOrThrow();
  return { id: String(row.id), createdAt: row.created_at };
}

export async function openModerationAppeal(input: { actionId: string; appellantUserId: string; reason: string }) {
  return db.transaction().execute(async (trx) => {
    const action = await trx.selectFrom('moderation_actions')
      .select(['id', 'listing_id', 'user_id', 'action_type', 'status', 'created_at'])
      .where('id', '=', input.actionId)
      .forUpdate()
      .executeTakeFirst();
    if (!action) throw new ModerationPolicyError('moderation_action_not_found', 404);
    if (action.status !== 'active' || !['listing_takedown', 'account_suspend', 'account_close'].includes(String(action.action_type))) {
      throw new ModerationPolicyError('moderation_action_not_appealable');
    }

    let ownsAction = action.user_id === input.appellantUserId;
    if (action.listing_id) {
      const listing = await trx.selectFrom('listings').select(['seller_id']).where('id', '=', action.listing_id).executeTakeFirst();
      ownsAction = listing?.seller_id === input.appellantUserId;
    }
    if (!ownsAction) throw new ModerationPolicyError('moderation_action_not_found', 404);

    const openedAt = new Date();
    if (openedAt > addDays(new Date(action.created_at), moderationAppealWindowDays)) {
      throw new ModerationPolicyError('moderation_appeal_window_closed');
    }

    const appeal = await trx.insertInto('moderation_appeals').values({
      moderation_action_id: action.id,
      appellant_user_id: input.appellantUserId,
      status: 'open',
      reason: input.reason.trim(),
      opened_at: openedAt,
      updated_at: openedAt
    }).returning(['id', 'opened_at']).executeTakeFirstOrThrow();
    return { appealId: String(appeal.id), openedAt: appeal.opened_at };
  });
}

export async function decideModerationAppeal(input: {
  appealId: string;
  reviewerUserId: string;
  decision: 'uphold' | 'overturn' | 'dismiss';
  note: string;
}) {
  return db.transaction().execute(async (trx) => {
    const appeal = await trx.selectFrom('moderation_appeals')
      .innerJoin('moderation_actions', 'moderation_actions.id', 'moderation_appeals.moderation_action_id')
      .select([
        'moderation_appeals.id as appeal_id', 'moderation_appeals.status as appeal_status',
        'moderation_actions.id as action_id', 'moderation_actions.listing_id as listing_id',
        'moderation_actions.user_id as user_id', 'moderation_actions.action_type as action_type',
        'moderation_actions.status as action_status', 'moderation_actions.metadata as metadata'
      ])
      .where('moderation_appeals.id', '=', input.appealId)
      .forUpdate()
      .executeTakeFirst();
    if (!appeal) throw new ModerationPolicyError('moderation_appeal_not_found', 404);
    if (appeal.appeal_status !== 'open') throw new ModerationPolicyError('moderation_appeal_already_decided');

    const now = new Date();
    if (input.decision === 'overturn' && appeal.action_status === 'active') {
      const metadata = (appeal.metadata ?? {}) as Record<string, unknown>;
      const previousStatus = typeof metadata.previousStatus === 'string' ? metadata.previousStatus : null;
      if (appeal.listing_id && appeal.action_type === 'listing_takedown') {
        const restore = ['draft', 'active', 'expired'].includes(previousStatus ?? '') ? previousStatus : 'draft';
        await trx.updateTable('listings').set({ status: restore, updated_at: now }).where('id', '=', appeal.listing_id).execute();
      } else if (appeal.user_id && ['account_suspend', 'account_close'].includes(String(appeal.action_type))) {
        const restore = ['pending', 'active', 'suspended'].includes(previousStatus ?? '') ? previousStatus : 'active';
        await trx.updateTable('users').set({ status: restore, updated_at: now }).where('id', '=', appeal.user_id).execute();
      }
      await trx.updateTable('moderation_actions').set({
        status: 'reversed', reversed_by: input.reviewerUserId, reversed_at: now,
        reversal_reason: input.note.trim(), updated_at: now
      }).where('id', '=', appeal.action_id).execute();
    }

    const status = input.decision === 'uphold' ? 'upheld' : input.decision === 'overturn' ? 'overturned' : 'dismissed';
    await trx.updateTable('moderation_appeals').set({
      status,
      reviewed_by: input.reviewerUserId,
      decision: input.decision,
      decision_note: input.note.trim(),
      decided_at: now,
      updated_at: now
    }).where('id', '=', appeal.appeal_id).execute();

    await trx.insertInto('audit_logs').values({
      actor_user_id: input.reviewerUserId,
      action: 'moderation.appeal_decision',
      entity_type: 'moderation_appeal',
      entity_id: appeal.appeal_id,
      metadata: { moderationActionId: appeal.action_id, decision: input.decision },
      created_at: now
    }).execute();

    return { appealId: String(appeal.appeal_id), status };
  });
}

export async function reconcileModerationEvidenceRetention(now = new Date()) {
  const candidates = await db.selectFrom('moderation_actions')
    .select(['id'])
    .where('evidence_retain_until', '<=', now)
    .where('evidence_purged_at', 'is', null)
    .where('evidence_snapshot', 'is not', null)
    .limit(500)
    .execute();
  if (candidates.length === 0) return { purged: 0 };

  const ids = candidates.map((row) => String(row.id));
  const blocked = await db.selectFrom('moderation_appeals')
    .select(['moderation_action_id'])
    .where('moderation_action_id', 'in', ids)
    .where('status', '=', 'open')
    .execute();
  const blockedIds = new Set(blocked.map((row) => String(row.moderation_action_id)));
  const purgeIds = ids.filter((id) => !blockedIds.has(id));
  if (purgeIds.length === 0) return { purged: 0 };

  const result = await db.updateTable('moderation_actions').set({
    evidence_snapshot: null,
    evidence_purged_at: now,
    updated_at: now
  }).where('id', 'in', purgeIds).executeTakeFirst();
  return { purged: Number(result.numUpdatedRows ?? purgeIds.length) };
}
