import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';

const startVerificationBody = z.object({
  userId: z.string().uuid(),
  level: z.enum(['basic', 'seller', 'high_value_seller', 'business']),
  countryCode: z.string().length(2)
});

export async function verificationRoutes(app: FastifyInstance): Promise<void> {
  app.post('/verification/start', async (request, reply) => {
    const body = startVerificationBody.parse(request.body);

    const user = await db.selectFrom('users')
      .select(['id', 'status'])
      .where('id', '=', body.userId)
      .executeTakeFirst();

    if (!user) {
      return reply.code(404).send({ error: 'User not found' });
    }

    const check = await db.insertInto('verification_checks')
      .values({
        user_id: body.userId,
        level: body.level,
        country_code: body.countryCode.toUpperCase(),
        status: 'pending',
        provider: null,
        reference: null,
        risk_score: null,
        reviewed_at: null,
        expires_at: null
      })
      .returning(['id', 'user_id', 'level', 'status', 'country_code', 'created_at'])
      .executeTakeFirstOrThrow();

    return reply.code(202).send({
      accepted: true,
      verification: check,
      status: 'provider_configuration_required'
    });
  });

  app.get('/users/:userId/verification', async (request, reply) => {
    const params = z.object({ userId: z.string().uuid() }).parse(request.params);
    const checks = await db.selectFrom('verification_checks')
      .select(['id', 'level', 'status', 'country_code', 'risk_score', 'reviewed_at', 'expires_at', 'created_at'])
      .where('user_id', '=', params.userId)
      .orderBy('created_at', 'desc')
      .execute();

    return reply.send({ checks });
  });
}
