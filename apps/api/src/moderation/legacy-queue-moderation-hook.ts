import type { FastifyReply, FastifyRequest } from 'fastify';
import { requireOperationsUser, type OperationsRequest } from '../auth/require-operations-user.js';
import { db } from '../db/index.js';
import { recordQueueAudit } from '../operations/queue-audit.js';
import {
  ModerationPolicyError,
  applyAccountModerationAction,
  applyListingModerationAction
} from './moderation-policy-service.js';

const uuid = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const listingQueuePath = new RegExp(`^/v1/operations/queue/(${uuid})/listing-status(?:\\?.*)?$`);
const accountQueuePath = new RegExp(`^/v1/operations/queue/(${uuid})/account-status(?:\\?.*)?$`);

function noteFromBody(request: FastifyRequest): string | null {
  const value = (request.body as { note?: unknown } | undefined)?.note;
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 1200) : null;
}

async function closeQueueItem(input: {
  reportId: string;
  actorId: string;
  action: 'changed_listing' | 'changed_account';
  note: string | null;
  ip: string;
  targetType: 'listing' | 'user';
  targetId: string;
  resultingStatus: string;
}) {
  const now = new Date();
  return db.transaction().execute(async (trx) => {
    const report = await trx.updateTable('reports').set({
      resolved_at: now,
      reviewed_by: input.actorId,
      review_action: input.action,
      review_note: input.note,
      updated_at: now
    }).where('id', '=', input.reportId)
      .where('resolved_at', 'is', null)
      .returning(['id', 'resolved_at', 'review_action'])
      .executeTakeFirst();
    if (!report) return undefined;

    await recordQueueAudit(trx, {
      actorId: input.actorId,
      action: input.action === 'changed_listing'
        ? 'operations.listing_status'
        : 'operations.account_status',
      entityType: input.targetType,
      entityId: input.targetId,
      ipAddress: input.ip,
      metadata: {
        queueItemId: input.reportId,
        status: input.resultingStatus,
        durableModeration: true,
        noteProvided: Boolean(input.note)
      },
      createdAt: now
    });
    return report;
  });
}

export async function interceptLegacyQueueModeration(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (request.method !== 'POST') return;
  const listingMatch = listingQueuePath.exec(request.url);
  const accountMatch = accountQueuePath.exec(request.url);
  if (!listingMatch && !accountMatch) return;

  await requireOperationsUser(request, reply);
  if (reply.sent) return;
  const auth = request as OperationsRequest;
  const reportId = (listingMatch ?? accountMatch)![1];
  const note = noteFromBody(request);

  const report = await db.selectFrom('reports')
    .select(['id', 'listing_id', 'reported_user_id', 'reason', 'resolved_at'])
    .where('id', '=', reportId)
    .executeTakeFirst();
  if (!report) {
    reply.code(404).send({ error: 'Open queue item not found' });
    return;
  }
  if (report.resolved_at) {
    reply.code(409).send({ error: 'Queue item is already closed' });
    return;
  }

  const bodyStatus = (request.body as { status?: unknown } | undefined)?.status;
  const reason = `Moderation action from report ${report.id}: ${String(report.reason ?? 'marketplace report')}${note ? `. ${note}` : ''}`;

  try {
    if (listingMatch) {
      if (!report.listing_id) {
        reply.code(404).send({ error: 'Linked listing not found' });
        return;
      }
      if (bodyStatus !== 'active' && bodyStatus !== 'removed') {
        reply.code(409).send({
          error: 'Legacy listing state change retired; use the moderation workflow',
          code: 'legacy_listing_state_retired',
          allowedStatuses: ['active', 'removed']
        });
        return;
      }

      const action = bodyStatus === 'active' ? 'approve' : 'takedown';
      const result = await applyListingModerationAction({
        listingId: String(report.listing_id),
        actorId: auth.operationsUserId,
        action,
        reasonCode: 'report.queue_action',
        reason,
        reportId: report.id
      });
      const review = await closeQueueItem({
        reportId: report.id,
        actorId: auth.operationsUserId,
        action: 'changed_listing',
        note,
        ip: request.ip,
        targetType: 'listing',
        targetId: result.listingId,
        resultingStatus: result.status
      });
      if (!review) {
        reply.code(409).send({ error: 'Queue item changed while moderation action was applied' });
        return;
      }
      reply.send({
        item: { id: report.id, status: 'closed', resolvedAt: review.resolved_at, reviewAction: review.review_action },
        listing: { id: result.listingId, status: result.status },
        moderationActionId: result.actionId
      });
      return;
    }

    if (!report.reported_user_id) {
      reply.code(404).send({ error: 'Linked account not found' });
      return;
    }
    if (bodyStatus !== 'suspended') {
      reply.code(409).send({
        error: 'Direct legacy account reactivation is retired; use moderation appeal/review',
        code: 'legacy_account_reactivation_retired',
        allowedStatuses: ['suspended']
      });
      return;
    }

    const result = await applyAccountModerationAction({
      userId: String(report.reported_user_id),
      actorId: auth.operationsUserId,
      action: 'suspend',
      reasonCode: 'report.queue_action',
      reason,
      reportId: report.id
    });
    const review = await closeQueueItem({
      reportId: report.id,
      actorId: auth.operationsUserId,
      action: 'changed_account',
      note,
      ip: request.ip,
      targetType: 'user',
      targetId: result.userId,
      resultingStatus: result.status
    });
    if (!review) {
      reply.code(409).send({ error: 'Queue item changed while moderation action was applied' });
      return;
    }
    reply.send({
      item: { id: report.id, status: 'closed', resolvedAt: review.resolved_at, reviewAction: review.review_action },
      account: { id: result.userId, status: result.status },
      moderationActionId: result.actionId
    });
  } catch (error) {
    if (error instanceof ModerationPolicyError) {
      reply.code(error.statusCode).send({ error: error.message });
      return;
    }
    throw error;
  }
}
