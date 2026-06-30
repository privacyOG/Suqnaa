import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireOperationsUser, type OperationsRequest } from '../auth/require-operations-user.js';
import { db } from '../db/index.js';
import { recordQueueAudit } from '../operations/queue-audit.js';
import { checkRateLimit, rateLimitResponse } from '../security/rate-limit.js';
import { writeSecurityAudit } from '../security/security-audit.js';

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

const listingStatusBody = z.object({
  status: z.enum(['draft', 'active', 'reserved', 'sold', 'expired', 'removed']),
  note: z.string().trim().max(1200).optional()
});

const accountStatusBody = z.object({
  status: z.enum(['active', 'suspended']),
  note: z.string().trim().max(1200).optional()
});

function limitedOperation(request: FastifyRequest, accountId: string, group: string) {
  const accountLimit = checkRateLimit({
    group,
    identifiers: [`account:${accountId}`],
    limit: 60,
    windowMs: 60 * 60 * 1000
  });
  const ipLimit = checkRateLimit({
    group: `${group}.ip`,
    identifiers: [`ip:${request.ip}`],
    limit: 180,
    windowMs: 60 * 60 * 1000
  });

  return !accountLimit.allowed ? accountLimit : !ipLimit.allowed ? ipLimit : undefined;
}

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

    const updated = await db.transaction().execute(async (trx) => {
      const item = await trx.updateTable('reports')
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

      if (!item) {
        return undefined;
      }

      await recordQueueAudit(trx, {
        actorId: authRequest.operationsUserId,
        action: 'operations.queue.complete',
        entityType: 'report',
        entityId: item.id,
        ipAddress: request.ip,
        metadata: {
          queueItemId: item.id,
          result: body.result,
          noteProvided: Boolean(body.note)
        },
        createdAt: now
      });

      return item;
    });

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

  app.post('/operations/queue/:id/listing-status', { preHandler: requireOperationsUser }, async (request, reply) => {
    const authRequest = request as OperationsRequest;
    const params = itemParams.parse(request.params);
    const body = listingStatusBody.parse(request.body);
    const limited = limitedOperation(request, authRequest.operationsUserId, 'operations.listing_status');

    if (limited) {
      reply.header('Retry-After', String(limited.retryAfterSeconds));
      return reply.code(429).send(rateLimitResponse(limited));
    }

    const now = new Date();
    const result = await db.transaction().execute(async (trx) => {
      const item = await trx.selectFrom('reports')
        .select(['id', 'listing_id', 'resolved_at', 'reason'])
        .where('id', '=', params.id)
        .executeTakeFirst();

      if (!item || !item.listing_id) {
        return { code: 404 as const, error: 'Open queue item not found' };
      }
      if (item.resolved_at) {
        return { code: 409 as const, error: 'Queue item is already closed' };
      }

      const listing = await trx.updateTable('listings')
        .set({
          status: body.status,
          updated_at: now
        })
        .where('id', '=', item.listing_id)
        .returning(['id', 'status'])
        .executeTakeFirst();

      if (!listing) {
        return { code: 404 as const, error: 'Linked listing not found' };
      }

      const review = await trx.updateTable('reports')
        .set({
          resolved_at: now,
          reviewed_by: authRequest.operationsUserId,
          review_action: 'changed_listing',
          review_note: body.note ?? null,
          updated_at: now
        })
        .where('id', '=', item.id)
        .where('resolved_at', 'is', null)
        .returning(['id', 'resolved_at', 'review_action'])
        .executeTakeFirst();

      return { code: 200 as const, listing, review };
    });

    if (result.code !== 200) {
      return reply.code(result.code).send({ error: result.error });
    }

    writeSecurityAudit(app.log, {
      action: 'operations.listing_status',
      decision: 'allow',
      actorId: authRequest.operationsUserId,
      targetId: result.listing.id,
      ip: request.ip,
      metadata: {
        queueItemId: params.id,
        status: result.listing.status,
        noteProvided: Boolean(body.note)
      }
    });

    return reply.send({
      item: {
        id: params.id,
        status: 'closed',
        resolvedAt: result.review?.resolved_at ?? now,
        reviewAction: result.review?.review_action ?? 'changed_listing'
      },
      listing: {
        id: result.listing.id,
        status: result.listing.status
      }
    });
  });

  app.post('/operations/queue/:id/account-status', { preHandler: requireOperationsUser }, async (request, reply) => {
    const authRequest = request as OperationsRequest;
    const params = itemParams.parse(request.params);
    const body = accountStatusBody.parse(request.body);
    const limited = limitedOperation(request, authRequest.operationsUserId, 'operations.account_status');

    if (limited) {
      reply.header('Retry-After', String(limited.retryAfterSeconds));
      return reply.code(429).send(rateLimitResponse(limited));
    }

    const now = new Date();
    const result = await db.transaction().execute(async (trx) => {
      const item = await trx.selectFrom('reports')
        .select(['id', 'reported_user_id', 'resolved_at', 'reason'])
        .where('id', '=', params.id)
        .executeTakeFirst();

      if (!item || !item.reported_user_id) {
        return { code: 404 as const, error: 'Open queue item not found' };
      }
      if (item.resolved_at) {
        return { code: 409 as const, error: 'Queue item is already closed' };
      }
      if (item.reported_user_id === authRequest.operationsUserId) {
        return { code: 409 as const, error: 'Cannot change own account status' };
      }

      const account = await trx.updateTable('users')
        .set({
          status: body.status,
          updated_at: now
        })
        .where('id', '=', item.reported_user_id)
        .where('status', '!=', 'closed')
        .returning(['id', 'status'])
        .executeTakeFirst();

      if (!account) {
        return { code: 404 as const, error: 'Linked account not found' };
      }

      const review = await trx.updateTable('reports')
        .set({
          resolved_at: now,
          reviewed_by: authRequest.operationsUserId,
          review_action: 'changed_account',
          review_note: body.note ?? null,
          updated_at: now
        })
        .where('id', '=', item.id)
        .where('resolved_at', 'is', null)
        .returning(['id', 'resolved_at', 'review_action'])
        .executeTakeFirst();

      return { code: 200 as const, account, review };
    });

    if (result.code !== 200) {
      return reply.code(result.code).send({ error: result.error });
    }

    writeSecurityAudit(app.log, {
      action: 'operations.account_status',
      decision: 'allow',
      actorId: authRequest.operationsUserId,
      targetId: result.account.id,
      ip: request.ip,
      metadata: {
        queueItemId: params.id,
        status: result.account.status,
        noteProvided: Boolean(body.note)
      }
    });

    return reply.send({
      item: {
        id: params.id,
        status: 'closed',
        resolvedAt: result.review?.resolved_at ?? now,
        reviewAction: result.review?.review_action ?? 'changed_account'
      },
      account: {
        id: result.account.id,
        status: result.account.status
      }
    });
  });
}
