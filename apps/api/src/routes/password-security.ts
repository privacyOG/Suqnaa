import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser, type AuthenticatedRequest } from '../auth/require-user.js';
import { env } from '../config/env.js';
import { createPasswordResetDeliveryProvider } from '../password-security/delivery.js';
import {
  changePassword,
  listSecuritySessions,
  requestPasswordReset,
  resetPasswordWithToken,
  revokeAllSecuritySessions,
  revokeSecuritySession
} from '../password-security/service.js';
import {
  passwordResetTargetFingerprint,
  passwordResetTokenHash
} from '../password-security/token.js';
import { NoopChallengeVerifier } from '../security/challenge-verifier.js';
import {
  checkHumanProtectionWithChallenge,
  humanProtectionResponse
} from '../security/human-protection.js';
import { checkRateLimit, rateLimitResponse } from '../security/rate-limit.js';

const forgotBody = z.object({
  email: z.string().email().max(254)
});
const resetBody = z.object({
  token: z.string().trim().min(40).max(120),
  newPassword: z.string().min(10).max(200)
});
const changeBody = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(10).max(200)
});
const sessionParams = z.object({
  sessionId: z.string().uuid()
});

const challengeVerifier = new NoopChallengeVerifier();
const resetDeliveryProvider = createPasswordResetDeliveryProvider({
  mode: env.VERIFICATION_DELIVERY_PROVIDER,
  nodeEnv: env.NODE_ENV,
  endpoint: env.VERIFICATION_DELIVERY_URL,
  token: env.VERIFICATION_DELIVERY_TOKEN,
  timeoutMs: env.VERIFICATION_DELIVERY_TIMEOUT_MS
});

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function accountId(request: AuthenticatedRequest): string {
  return request.user.sub;
}

function sendLimit(reply: any, result: ReturnType<typeof checkRateLimit>) {
  reply.header('Retry-After', String(result.retryAfterSeconds));
  return reply.code(429).send(rateLimitResponse(result));
}

export async function passwordSecurityRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/password/forgot', async (request, reply) => {
    const body = forgotBody.parse(request.body);
    const normalizedEmail = body.email.trim().toLowerCase();
    const fingerprint = passwordResetTargetFingerprint(env.PASSWORD_RESET_PEPPER, normalizedEmail);
    const targetLimit = checkRateLimit({
      group: 'auth.password.forgot.target',
      identifiers: [`target:${fingerprint.slice(0, 24)}`],
      limit: 5,
      windowMs: 15 * 60 * 1000
    });
    const ipLimit = checkRateLimit({
      group: 'auth.password.forgot.ip',
      identifiers: [`ip:${request.ip}`],
      limit: 20,
      windowMs: 15 * 60 * 1000
    });
    const limited = !targetLimit.allowed ? targetLimit : !ipLimit.allowed ? ipLimit : undefined;
    if (limited) {
      return sendLimit(reply, limited);
    }

    const protection = await checkHumanProtectionWithChallenge(
      {
        action: 'account.password_reset_request',
        ip: request.ip,
        userAgent: firstHeader(request.headers['user-agent']),
        challengeResponse: firstHeader(request.headers['x-suqnaa-human-check'])
      },
      challengeVerifier
    );

    if (protection.decision !== 'allow') {
      return reply.code(403).send(humanProtectionResponse(protection));
    }

    await requestPasswordReset({
      email: normalizedEmail,
      ipAddress: request.ip,
      pepper: env.PASSWORD_RESET_PEPPER,
      provider: resetDeliveryProvider
    });

    return reply.code(202).send({ accepted: true });
  });

  app.post('/auth/password/reset', async (request, reply) => {
    const body = resetBody.parse(request.body);
    let tokenIdentifier = 'invalid';
    try {
      tokenIdentifier = passwordResetTokenHash(env.PASSWORD_RESET_PEPPER, body.token).slice(0, 24);
    } catch {
      // Invalid token shape is handled by the reset service after rate limiting.
    }

    const tokenLimit = checkRateLimit({
      group: 'auth.password.reset.token',
      identifiers: [`token:${tokenIdentifier}`],
      limit: 10,
      windowMs: 15 * 60 * 1000
    });
    const ipLimit = checkRateLimit({
      group: 'auth.password.reset.ip',
      identifiers: [`ip:${request.ip}`],
      limit: 40,
      windowMs: 15 * 60 * 1000
    });
    const limited = !tokenLimit.allowed ? tokenLimit : !ipLimit.allowed ? ipLimit : undefined;
    if (limited) {
      return sendLimit(reply, limited);
    }

    const result = await resetPasswordWithToken({
      token: body.token,
      newPassword: body.newPassword,
      pepper: env.PASSWORD_RESET_PEPPER,
      ipAddress: request.ip
    });

    if (result.outcome === 'invalid_token') {
      return reply.code(400).send({ error: 'Invalid or expired password reset token' });
    }
    if (result.outcome === 'same_password') {
      return reply.code(409).send({ error: 'Choose a different password' });
    }

    return reply.send({ reset: true, revokedSessions: result.revokedSessions });
  });

  app.post('/account/security/password', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const body = changeBody.parse(request.body);
    const limit = checkRateLimit({
      group: 'account.security.password',
      identifiers: [`account:${accountId(authRequest)}`, `ip:${request.ip}`],
      limit: 10,
      windowMs: 15 * 60 * 1000
    });
    if (!limit.allowed) {
      return sendLimit(reply, limit);
    }

    const result = await changePassword({
      userId: accountId(authRequest),
      currentPassword: body.currentPassword,
      newPassword: body.newPassword,
      ipAddress: request.ip
    });

    if (result.outcome === 'invalid_current_password') {
      return reply.code(400).send({ error: 'Current password is incorrect' });
    }
    if (result.outcome === 'same_password') {
      return reply.code(409).send({ error: 'Choose a different password' });
    }
    if (result.outcome === 'conflict') {
      return reply.code(409).send({ error: 'Password changed concurrently; sign in again' });
    }
    if (result.outcome === 'not_found') {
      return reply.code(404).send({ error: 'Account password is not configured' });
    }

    return reply.send({ changed: true, revokedSessions: result.revokedSessions });
  });

  app.get('/account/security/sessions', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const sessions = await listSecuritySessions(accountId(authRequest));
    return reply.send({ sessions });
  });

  app.post('/account/security/sessions/:sessionId/revoke', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const params = sessionParams.parse(request.params);
    const limit = checkRateLimit({
      group: 'account.security.session_revoke',
      identifiers: [`account:${accountId(authRequest)}`, `ip:${request.ip}`],
      limit: 30,
      windowMs: 15 * 60 * 1000
    });
    if (!limit.allowed) {
      return sendLimit(reply, limit);
    }

    await revokeSecuritySession({
      userId: accountId(authRequest),
      sessionId: params.sessionId,
      ipAddress: request.ip
    });

    return reply.code(204).send();
  });

  app.post('/account/security/sessions/revoke-all', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const limit = checkRateLimit({
      group: 'account.security.sessions_revoke_all',
      identifiers: [`account:${accountId(authRequest)}`, `ip:${request.ip}`],
      limit: 5,
      windowMs: 15 * 60 * 1000
    });
    if (!limit.allowed) {
      return sendLimit(reply, limit);
    }

    const revokedSessions = await revokeAllSecuritySessions({
      userId: accountId(authRequest),
      ipAddress: request.ip
    });

    return reply.send({ revokedSessions });
  });
}
