import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAccessToken } from '../auth/access.js';
import { daysFromNow, newSessionToken, sessionTokenHash } from '../auth/session-token.js';
import { db } from '../db/index.js';
import { NoopChallengeVerifier } from '../security/challenge-verifier.js';
import {
  checkHumanProtectionWithChallenge,
  humanProtectionResponse
} from '../security/human-protection.js';
import { hashPassword, verifyPassword } from '../security/password.js';
import { checkRateLimit, rateLimitResponse } from '../security/rate-limit.js';

const challengeVerifier = new NoopChallengeVerifier();
const blockedUserStates = new Set(['suspended', 'closed']);

const registerBody = z.object({
  email: z.string().email().optional(),
  phone: z.string().min(8).max(20).optional(),
  displayName: z.string().trim().min(2).max(80),
  password: z.string().min(10).max(200)
}).refine((value) => value.email || value.phone, 'Email or phone is required');

const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200)
});

const refreshBody = z.object({
  refreshToken: z.string().min(40).max(200)
});

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function canIssueSession(status: string | null | undefined): boolean {
  return !blockedUserStates.has(status ?? '');
}

function authPayload(user: { id: string; email?: string | null; display_name?: string; status?: string }, session: unknown) {
  return {
    user: {
      id: user.id,
      email: user.email ?? null,
      displayName: user.display_name,
      status: user.status
    },
    accessToken: createAccessToken({ userId: user.id, email: user.email ?? null, status: user.status }),
    session
  };
}

async function createRefreshSession(userId: string, userAgent: string | undefined, ipAddress: string | undefined) {
  const refreshToken = newSessionToken();
  const session = await db.insertInto('refresh_sessions')
    .values({
      user_id: userId,
      token_hash: sessionTokenHash(refreshToken),
      user_agent: userAgent ?? null,
      ip_address: ipAddress ?? null,
      expires_at: daysFromNow(30),
      revoked_at: null
    })
    .returning(['id', 'expires_at'])
    .executeTakeFirstOrThrow();

  return {
    refreshToken,
    sessionId: session.id,
    expiresAt: session.expires_at
  };
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/register', async (request, reply) => {
    const body = registerBody.parse(request.body);
    const accountIdentifier = body.email
      ? `email:${body.email.toLowerCase()}`
      : `phone:${body.phone}`;
    const limit = checkRateLimit({
      group: 'auth.register',
      identifiers: [`ip:${request.ip}`, accountIdentifier],
      limit: 5,
      windowMs: 15 * 60 * 1000
    });

    if (!limit.allowed) {
      reply.header('Retry-After', String(limit.retryAfterSeconds));
      return reply.code(429).send(rateLimitResponse(limit));
    }

    const protection = await checkHumanProtectionWithChallenge(
      {
        action: 'account.register',
        ip: request.ip,
        userAgent: firstHeader(request.headers['user-agent']),
        challengeResponse: firstHeader(request.headers['x-suqnaa-human-check'])
      },
      challengeVerifier
    );

    if (protection.decision !== 'allow') {
      return reply.code(403).send(humanProtectionResponse(protection));
    }

    const passwordHash = await hashPassword(body.password);

    const existing = body.email
      ? await db.selectFrom('users').select(['id']).where('email', '=', body.email.toLowerCase()).executeTakeFirst()
      : undefined;

    if (existing) {
      return reply.code(409).send({ error: 'Account already exists' });
    }

    const user = await db.insertInto('users')
      .values({
        email: body.email?.toLowerCase() ?? null,
        phone_e164: body.phone ?? null,
        display_name: body.displayName,
        password_hash: passwordHash,
        status: 'pending'
      })
      .returning(['id', 'email', 'phone_e164', 'display_name', 'status'])
      .executeTakeFirstOrThrow();

    const session = await createRefreshSession(user.id, firstHeader(request.headers['user-agent']), request.ip);

    return reply.code(201).send(authPayload(user, session));
  });

  app.post('/auth/login', async (request, reply) => {
    const body = loginBody.parse(request.body);
    const normalizedEmail = body.email.toLowerCase();
    const limit = checkRateLimit({
      group: 'auth.login',
      identifiers: [`ip:${request.ip}`, `email:${normalizedEmail}`],
      limit: 10,
      windowMs: 15 * 60 * 1000
    });

    if (!limit.allowed) {
      reply.header('Retry-After', String(limit.retryAfterSeconds));
      return reply.code(429).send(rateLimitResponse(limit));
    }

    const protection = await checkHumanProtectionWithChallenge(
      {
        action: 'account.login',
        ip: request.ip,
        userAgent: firstHeader(request.headers['user-agent']),
        challengeResponse: firstHeader(request.headers['x-suqnaa-human-check'])
      },
      challengeVerifier
    );

    if (protection.decision !== 'allow') {
      return reply.code(403).send(humanProtectionResponse(protection));
    }

    const user = await db.selectFrom('users')
      .select(['id', 'email', 'display_name', 'password_hash', 'status'])
      .where('email', '=', normalizedEmail)
      .executeTakeFirst();

    if (!user?.password_hash) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    const valid = await verifyPassword(user.password_hash, body.password);
    if (!valid || !canIssueSession(user.status)) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    const session = await createRefreshSession(user.id, firstHeader(request.headers['user-agent']), request.ip);

    return reply.send(authPayload(user, session));
  });

  app.post('/auth/refresh', async (request, reply) => {
    const body = refreshBody.parse(request.body);
    const storedHash = sessionTokenHash(body.refreshToken);
    const sessionLimit = checkRateLimit({
      group: 'auth.refresh.session',
      identifiers: [`session:${storedHash.slice(0, 16)}`],
      limit: 30,
      windowMs: 15 * 60 * 1000
    });
    const ipLimit = checkRateLimit({
      group: 'auth.refresh.ip',
      identifiers: [`ip:${request.ip}`],
      limit: 600,
      windowMs: 15 * 60 * 1000
    });
    const limited = !sessionLimit.allowed
      ? sessionLimit
      : !ipLimit.allowed
        ? ipLimit
        : undefined;

    if (limited) {
      reply.header('Retry-After', String(limited.retryAfterSeconds));
      return reply.code(429).send(rateLimitResponse(limited));
    }

    const rotated = await db.transaction().execute(async (transaction) => {
      const existing = await transaction.selectFrom('refresh_sessions')
        .select(['id', 'user_id', 'expires_at', 'revoked_at'])
        .where('token_hash', '=', storedHash)
        .executeTakeFirst();

      if (!existing || existing.revoked_at || existing.expires_at < new Date()) {
        return null;
      }

      const revoked = await transaction.updateTable('refresh_sessions')
        .set({ revoked_at: new Date() })
        .where('id', '=', existing.id)
        .where('revoked_at', 'is', null)
        .returning(['id'])
        .executeTakeFirst();

      if (!revoked) {
        return null;
      }

      const user = await transaction.selectFrom('users')
        .select(['id', 'email', 'display_name', 'status'])
        .where('id', '=', existing.user_id)
        .executeTakeFirst();

      if (!user || !canIssueSession(user.status)) {
        return null;
      }

      const refreshToken = newSessionToken();
      const session = await transaction.insertInto('refresh_sessions')
        .values({
          user_id: existing.user_id,
          token_hash: sessionTokenHash(refreshToken),
          user_agent: firstHeader(request.headers['user-agent']) ?? null,
          ip_address: request.ip ?? null,
          expires_at: daysFromNow(30),
          revoked_at: null
        })
        .returning(['id', 'expires_at'])
        .executeTakeFirstOrThrow();

      return {
        user,
        session: {
          refreshToken,
          sessionId: session.id,
          expiresAt: session.expires_at
        }
      };
    });

    if (!rotated) {
      return reply.code(401).send({ error: 'Invalid session' });
    }

    return reply.send(authPayload(rotated.user, rotated.session));
  });
}
