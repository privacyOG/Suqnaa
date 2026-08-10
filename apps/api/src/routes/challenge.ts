import type { FastifyInstance } from 'fastify';
import { resolveRuntimeSecret } from '../config/runtime-secret.js';
import { buildPublicChallengeConfiguration } from '../security/challenge-config.js';

export async function challengeRoutes(app: FastifyInstance): Promise<void> {
  app.get('/challenge/config', async (_request, reply) => {
    const secretKey = resolveRuntimeSecret({
      name: 'TURNSTILE_SECRET_KEY',
      value: process.env.TURNSTILE_SECRET_KEY,
      file: process.env.TURNSTILE_SECRET_KEY_FILE
    });
    const challenge = buildPublicChallengeConfiguration({
      provider: process.env.CHALLENGE_PROVIDER === 'turnstile' ? 'turnstile' : 'none',
      siteKey: process.env.TURNSTILE_SITE_KEY,
      secretKey,
      expectedHostname: process.env.TURNSTILE_EXPECTED_HOSTNAME,
      nodeEnv: process.env.NODE_ENV
    });

    reply.header('Cache-Control', 'public, max-age=300');
    return reply.send({ challenge });
  });
}
