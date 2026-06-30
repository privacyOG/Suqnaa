import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireOperationsUser } from '../auth/require-operations-user.js';
import { db } from '../db/index.js';

const recordsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(25),
  before: z.string().datetime().optional(),
  action: z.string().trim().max(120).optional(),
  entityType: z.string().trim().max(80).optional()
});

export async function operationRecordRoutes(app: FastifyInstance): Promise<void> {
  app.get('/operations/records', { preHandler: requireOperationsUser }, async (request, reply) => {
    const query = recordsQuery.parse(request.query);
    let records = db.selectFrom('audit_logs')
      .select([
        'id',
        'actor_user_id',
        'action',
        'entity_type',
        'entity_id',
        'metadata',
        'created_at'
      ])
      .where('action', 'like', 'operations.%');

    if (query.before) {
      records = records.where('created_at', '<', new Date(query.before));
    }
    if (query.action) {
      records = records.where('action', '=', query.action);
    }
    if (query.entityType) {
      records = records.where('entity_type', '=', query.entityType);
    }

    const rows = await records
      .orderBy('created_at', 'desc')
      .limit(query.limit + 1)
      .execute();
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);

    return reply.send({
      items: page.map((item) => ({
        id: item.id,
        actorId: item.actor_user_id,
        action: item.action,
        entityType: item.entity_type,
        entityId: item.entity_id,
        metadata: item.metadata,
        createdAt: item.created_at
      })),
      pagination: {
        hasMore: rows.length > query.limit,
        nextCursor: rows.length > query.limit && last
          ? new Date(last.created_at).toISOString()
          : null
      }
    });
  });
}
