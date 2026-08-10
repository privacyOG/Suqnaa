import { sql } from 'kysely';
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { checkDatabaseReadiness } from '../deployment/readiness.js';

const healthPayload = {
  ok: true,
  service: 'suqnaa-api'
} as const;

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_request, reply) => {
    reply.header('Cache-Control', 'private, no-cache');
    return healthPayload;
  });

  app.get('/health/live', async (_request, reply) => {
    reply.header('Cache-Control', 'private, no-cache');
    return {
      ...healthPayload,
      status: 'live'
    };
  });

  app.get('/health/ready', async (_request, reply) => {
    reply.header('Cache-Control', 'private, no-cache');
    const readiness = await checkDatabaseReadiness({
      probe: async () => {
        await sql`select 1`.execute(db);
      }
    });

    if (!readiness.ready) {
      return reply.code(503).send({
        ok: false,
        service: 'suqnaa-api',
        status: 'not_ready',
        dependency: readiness.dependency,
        reason: readiness.reason
      });
    }

    return {
      ...healthPayload,
      status: 'ready'
    };
  });
}
