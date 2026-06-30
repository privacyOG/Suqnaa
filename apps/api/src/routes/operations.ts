import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireOperationsUser, type OperationsRequest } from '../auth/require-operations-user.js';
import { db } from '../db/index.js';

const queueQuery = z.object({
  status: z.enum(['open', 'closed', 'all']).default('open'),
  limit: z.coerce.number().int().min(1).max(50).default(25),
  before: z.string().datetime().optional()
});

const itemParams = z.object({
  id: z.string().uuid()
});

const completeBody = z.object({
  result: z.enum(['no_change', 'changed_listing', 'changed_account', 'other']),
  note: z.string().trim().max(1200).optional()
});

export async function operationsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/operations/health', { preHandler: requireOperationsUser }, async (_request, reply) => {
    return reply.send({ ok: true });
  });

  app.get('/operations/queue', { preHandler: requireOperationsUser }, async (request, reply) => {
    const query = queueQuery.parse(request.query);
    let queue = db.selectFrom('reports')
      .leftJoin('listings', 'listings.id', 'reports.listing_id')
      .leftJoin('users as reporter', 'reporter.id', 'reports.reporter_id')
      .leftJoin('users as subject_account', 'subject_account.id', 'reports.reported_user_id')
      .select([
        'reports.id as id',
        'reports.reporter_id as reporter_id',
        'reports.listing_id as listing_id',
        'reports.reported_user_id as reported_user_id',
        'reports.reason as reason',
        'reports.details as details',
        'reports.created_at as created_at',
        'reports.resolved_at as resolved_at',
        'reports.review_action as review_action',
        'reports.review_note as review_note',
        'listings.title as listing_title',
        'listings.status as listing_status',
        'reporter.display_name as reporter_name',
        'reporter.status as reporter_status',
        'subject_account.display_name as subject_name',
        'subject_account.status as subject_status'
      ]);

    if (query.status === 'open') {
      queue = queue.where('reports.resolved_at', 'is', null);
    } else if (query.status === 'closed') {
      queue = queue.where('reports.resolved_at', 'is not', null);
    }
    if (query.before) {
      queue = queue.where('reports.created_at', '<', new Date(query.before));
    }

    const rows = await queue
      .orderBy('reports.created_at', 'desc')
      .limit(query.limit + 1)
      .execute();
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);

    return reply.send({
      items: page.map((item) => ({
        id: item.id,
        status: item.resolved_at ? 'closed' : 'open',
        reporterId: item.reporter_id,
        reporterName: item.reporter_name,
        reporterStatus: item.reporter_status,
        listingId: item.listing_id,
        listingTitle: item.listing_title,
        listingStatus: item.listing_status,
        subjectUserId: item.reported_user_id,
        subjectUserName: item.subject_name,
        subjectUserStatus: item.subject_status,
        reason: item.reason,
        details: item.details,
        createdAt: item.created_at,
        resolvedAt: item.resolved_at,
        reviewAction: item.review_action,
        reviewNote: item.review_note
      })),
      pagination: {
        hasMore: rows.length > query.limit,
        nextCursor: rows.length > query.limit && last
          ? new Date(last.created_at).toISOString()
          : null
      }
    });
  });

  app.post('/operations/queue/:id/complete', { preHandler: requireOperationsUser }, async (request, reply) => {
    const authRequest = request as OperationsRequest;
    const params = itemParams.parse(request.params);
    const body = completeBody.parse(request.body);
    const now = new Date();

    const updated = await db.updateTable('reports')
      .set({
        resolved_at: now,
        reviewed_by: authRequest.operationsUserId,
        review_action: body.result,
        review_note: body.note ?? null,
        updated_at: now
      })
      .where('id', '=', params.id)
      .where('resolved_at', 'is', null)
      .returning(['id', 'resolved_at', 'review_action'])
      .executeTakeFirst();

    if (!updated) {
      return reply.code(404).send({ error: 'Open queue item not found' });
    }

    return reply.send({
      item: {
        id: updated.id,
        status: 'closed',
        resolvedAt: updated.resolved_at,
        reviewAction: updated.review_action
      }
    });
  });
}
