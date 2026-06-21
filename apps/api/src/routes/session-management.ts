import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser, type AuthenticatedRequest } from '../auth/require-user.js';
import { sessionTokenHash } from '../auth/session-token.js';
import { db } from '../db/index.js';
import { checkRateLimit, rateLimitResponse } from '../security/rate-limit.js';
import { writeSecurityAudit } from '../security/security-audit.js';

const logoutBody = z.object({
  refreshToken: z.string().min(40).max(200)
});

export async function sessionManagementRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/logout', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const body = logoutBody.parse(request.body);
    const userId = authRequest.user.sub;
    const limit = checkRateLimit({
      group: 'auth.logout',
      identifiers: [`account:${userId}`, `ip:${request.ip}`],
      limit: 20,
      windowMs: 15 * 60 * 1000
    });

    if (!limit.allowed) {
      reply.header('Retry-After', String(limit.retryAfterSeconds));
      return reply.code(429).send(rateLimitResponse(limit));
    }

    const revokedAt = new Date();
    const revoked = await db.updateTable('refresh_sessions')
      .set({ revoked_at: revokedAt })
      .where('user_id', '=', userId)
      .where('token_hash', '=', sessionTokenHash(body.refreshToken))
      .where('revoked_at', 'is', null)
      .returning(['id'])
      .execute();

    writeSecurityAudit(app.log, {
      action: 'session.logout',
      decision: 'allow',
      actorId: userId,
      ip: request.ip,
      metadata: {
        revokedSessions: revoked.length
      }
    });

    return reply.code(204).send();
  });
}
