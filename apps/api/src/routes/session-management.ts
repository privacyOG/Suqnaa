import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sessionTokenHash } from '../auth/session-token.js';
import { db } from '../db/index.js';
import { checkRateLimit, rateLimitResponse } from '../security/rate-limit.js';
import { writeSecurityAudit } from '../security/security-audit.js';

const logoutBody = z.object({
  refreshToken: z.string().min(40).max(200)
});

export async function sessionManagementRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/logout', async (request, reply) => {
    const body = logoutBody.parse(request.body);
    const tokenHash = sessionTokenHash(body.refreshToken);
    const limit = checkRateLimit({
      group: 'auth.logout',
      identifiers: [
        `ip:${request.ip}`,
        `session:${tokenHash.slice(0, 16)}`
      ],
      limit: 20,
      windowMs: 15 * 60 * 1000
    });

    if (!limit.allowed) {
      reply.header('Retry-After', String(limit.retryAfterSeconds));
      return reply.code(429).send(rateLimitResponse(limit));
    }

    const existing = await db.selectFrom('refresh_sessions')
      .select(['id', 'user_id', 'revoked_at'])
      .where('token_hash', '=', tokenHash)
      .executeTakeFirst();

    let revokedSessions = 0;
    if (existing && !existing.revoked_at) {
      const revoked = await db.updateTable('refresh_sessions')
        .set({ revoked_at: new Date() })
        .where('id', '=', existing.id)
        .where('revoked_at', 'is', null)
        .returning(['id'])
        .execute();
      revokedSessions = revoked.length;
    }

    writeSecurityAudit(app.log, {
      action: 'session.logout',
      decision: 'allow',
      actorId: existing?.user_id,
      ip: request.ip,
      metadata: {
        revokedSessions
      }
    });

    return reply.code(204).send();
  });
}
