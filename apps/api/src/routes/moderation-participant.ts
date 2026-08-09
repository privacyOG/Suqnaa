import type { FastifyInstance } from 'fastify';
import { requireUser, type AuthenticatedRequest } from '../auth/require-user.js';
import { db } from '../db/index.js';
import { moderationAppealWindowDays } from '../moderation/moderation-policy-service.js';

function appealDeadline(createdAt: Date | string): Date {
  const value = new Date(createdAt);
  return new Date(value.getTime() + moderationAppealWindowDays * 24 * 60 * 60 * 1000);
}

export async function moderationParticipantRoutes(app: FastifyInstance): Promise<void> {
  app.get('/market/moderation/actions', { preHandler: requireUser }, async (request, reply) => {
    const auth = request as AuthenticatedRequest;
    const rows = await db.selectFrom('moderation_actions')
      .leftJoin('listings', 'listings.id', 'moderation_actions.listing_id')
      .leftJoin('moderation_appeals', (join) => join
        .onRef('moderation_appeals.moderation_action_id', '=', 'moderation_actions.id')
        .on('moderation_appeals.appellant_user_id', '=', auth.user.sub))
      .select([
        'moderation_actions.id as id',
        'moderation_actions.listing_id as listing_id',
        'moderation_actions.user_id as user_id',
        'moderation_actions.action_type as action_type',
        'moderation_actions.reason_code as reason_code',
        'moderation_actions.reason as reason',
        'moderation_actions.status as status',
        'moderation_actions.created_at as created_at',
        'listings.seller_id as listing_seller_id',
        'listings.title as listing_title',
        'moderation_appeals.id as appeal_id',
        'moderation_appeals.status as appeal_status'
      ])
      .where((expression) => expression.or([
        expression('moderation_actions.user_id', '=', auth.user.sub),
        expression('listings.seller_id', '=', auth.user.sub)
      ]))
      .where('moderation_actions.action_type', 'in', ['listing_takedown', 'account_suspend', 'account_close'])
      .orderBy('moderation_actions.created_at', 'desc')
      .limit(100)
      .execute();

    const now = new Date();
    return reply.send({ actions: rows.map((row) => {
      const deadline = appealDeadline(row.created_at);
      return {
        id: row.id,
        actionType: row.action_type,
        listingId: row.listing_id,
        listingTitle: row.listing_title,
        accountAction: Boolean(row.user_id),
        reasonCode: row.reason_code,
        reason: row.reason,
        status: row.status,
        createdAt: row.created_at,
        appealDeadline: deadline,
        appealable: row.status === 'active' && !row.appeal_id && now <= deadline,
        appeal: row.appeal_id ? { id: row.appeal_id, status: row.appeal_status } : null
      };
    }) });
  });
}
