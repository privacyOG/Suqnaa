import type { FastifyInstance } from 'fastify';
import { buildPublicChallengeConfiguration } from '../security/challenge-config.js';

export async function challengeRoutes(app: FastifyInstance): Promise<void> {
  app.get('/challenge/config', async (_request, reply) => {
    const challenge = buildPublicChallengeConfiguration({
      provider: process.env.CHALLENGE_PROVIDER === 'turnstile' ? 'turnstile' : 'none',
      siteKey: process.env.TURNSTILE_SITE_KEY,
      secretKey: process.env.TURNSTILE_SECRET_KEY
    });

    reply.header('Cache-Control', 'public, max-age=300');
    return reply.send({ challenge });
  });
}
