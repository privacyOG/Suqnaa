import type { FastifyInstance } from 'fastify';
import { requireUser, type AuthenticatedRequest } from '../auth/require-user.js';
import { db } from '../db/index.js';

export async function accountRoutes(app: FastifyInstance): Promise<void> {
  app.get('/account/me', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const user = await db.selectFrom('users')
      .select(['id', 'email', 'phone_e164', 'display_name', 'status', 'email_verified_at', 'phone_verified_at'])
      .where('id', '=', authRequest.user.sub)
      .executeTakeFirst();

    if (!user) {
      return reply.code(404).send({ error: 'User not found' });
    }

    return reply.send({ user });
  });
}
