import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireUser, type AuthenticatedRequest } from '../auth/require-user.js';
import {
  detectProfileAvatarMime,
  maximumProfileAvatarBytes,
  normalizeProfileAvatarMime,
  profileAvatarObjectKey,
  supportedProfileAvatarMimeTypes
} from '../account-profile/avatar.js';
import { saveAccountProfile } from '../account-profile/mutation.js';
import {
  buildAccountExport,
  closeAccount,
  readAccountProfile,
  readPublicProfile,
  type AccountClosureMode,
  type AccountProfileInput
} from '../account-profile/service.js';
import { db } from '../db/index.js';
import { getListingMediaStorage, type MediaDelivery } from '../media/listing-media-storage.js';
import { checkRateLimit, rateLimitResponse } from '../security/rate-limit.js';

const publicProfileParams = z.object({ userId: z.string().uuid() });
const optionalText = (max: number) => z.string().trim().max(max).nullable();
const optionalCountry = z.string().trim().regex(/^[A-Za-z]{2}$/).transform((value) => value.toUpperCase()).nullable();
const optionalWebsite = z.string().trim().max(300).url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === 'https:' || protocol === 'http:';
}, 'Business website must use HTTP or HTTPS').nullable();

const profileBody = z.object({
  displayName: z.string().trim().min(2).max(80),
  bio: optionalText(1000),
  city: optionalText(120),
  countryCode: optionalCountry,
  isBusiness: z.boolean(),
  businessName: optionalText(120),
  businessDescription: optionalText(1000),
  businessWebsite: optionalWebsite,
  profileVisibility: z.enum(['public', 'private']),
  showCity: z.boolean(),
  showCountry: z.boolean(),
  showBusinessDetails: z.boolean(),
  showAvatar: z.boolean()
}).superRefine((value, context) => {
  if (value.isBusiness && (!value.businessName || value.businessName.length < 2)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['businessName'],
      message: 'Business name is required for a business profile'
    });
  }
});

const closureBody = z.object({
  currentPassword: z.string().min(1).max(200),
  mode: z.enum(['close', 'delete']),
  acknowledgement: z.string().trim().max(20)
}).superRefine((value, context) => {
  const expected = value.mode === 'delete' ? 'DELETE' : 'CLOSE';
  if (value.acknowledgement !== expected) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['acknowledgement'],
      message: `Type ${expected} to confirm`
    });
  }
});

function accountId(request: AuthenticatedRequest): string {
  return request.user.sub;
}

function applyLimit(
  request: FastifyRequest,
  reply: FastifyReply,
  group: string,
  account: string,
  limit: number,
  windowMs: number
): boolean {
  const accountLimit = checkRateLimit({
    group: `${group}.account`,
    identifiers: [`account:${account}`],
    limit,
    windowMs
  });
  const ipLimit = checkRateLimit({
    group: `${group}.ip`,
    identifiers: [`ip:${request.ip}`],
    limit: limit * 4,
    windowMs
  });
  const limited = !accountLimit.allowed ? accountLimit : !ipLimit.allowed ? ipLimit : undefined;
  if (!limited) return true;
  reply.header('Retry-After', String(limited.retryAfterSeconds));
  reply.code(429).send(rateLimitResponse(limited));
  return false;
}

function applyPublicLimit(request: FastifyRequest, reply: FastifyReply): boolean {
  const limited = checkRateLimit({
    group: 'profile.public.ip',
    identifiers: [`ip:${request.ip}`],
    limit: 300,
    windowMs: 5 * 60 * 1000
  });
  if (limited.allowed) return true;
  reply.header('Retry-After', String(limited.retryAfterSeconds));
  reply.code(429).send(rateLimitResponse(limited));
  return false;
}

async function sendMedia(reply: FastifyReply, delivery: MediaDelivery) {
  reply.header('X-Content-Type-Options', 'nosniff');
  if (delivery.type === 'redirect') {
    reply.header('Location', delivery.url);
    return reply.code(302).send();
  }
  reply.header('Content-Type', delivery.mimeType);
  reply.header('Content-Length', String(delivery.buffer.length));
  return reply.send(delivery.buffer);
}

export async function accountProfileRoutes(app: FastifyInstance): Promise<void> {
  app.addContentTypeParser(
    [...supportedProfileAvatarMimeTypes],
    { parseAs: 'buffer' },
    (_request, body, done) => done(null, body)
  );

  app.get('/account/profile', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    if (!applyLimit(request, reply, 'account.profile.read', accountId(authRequest), 120, 5 * 60 * 1000)) return;
    const profile = await readAccountProfile(accountId(authRequest));
    if (!profile) return reply.code(404).send({ error: 'Account not found' });
    return reply.send(profile);
  });

  app.post('/account/profile', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    if (!applyLimit(request, reply, 'account.profile.update', accountId(authRequest), 30, 60 * 60 * 1000)) return;
    const body = profileBody.parse(request.body) as AccountProfileInput;
    const saved = await saveAccountProfile(accountId(authRequest), body);
    if (!saved) return reply.code(409).send({ error: 'Account is not available for profile changes' });
    const profile = await readAccountProfile(accountId(authRequest));
    return reply.send(profile);
  });

  app.get('/profiles/:userId', async (request, reply) => {
    if (!applyPublicLimit(request, reply)) return;
    const params = publicProfileParams.parse(request.params);
    const profile = await readPublicProfile(params.userId);
    if (!profile) return reply.code(404).send({ error: 'Profile not found' });
    return reply.send({ profile });
  });

  app.get('/account/profile/avatar', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    if (!applyLimit(request, reply, 'account.avatar.read', accountId(authRequest), 600, 5 * 60 * 1000)) return;
    const profile = await db.selectFrom('user_profiles')
      .select(['avatar_object_key', 'avatar_mime_type'])
      .where('user_id', '=', accountId(authRequest))
      .executeTakeFirst();
    if (!profile?.avatar_object_key || !profile.avatar_mime_type) {
      return reply.code(404).send({ error: 'Avatar not found' });
    }
    try {
      const delivery = await getListingMediaStorage().deliver(
        String(profile.avatar_object_key),
        String(profile.avatar_mime_type)
      );
      reply.header('Cache-Control', 'private, max-age=60');
      return sendMedia(reply, delivery);
    } catch {
      return reply.code(404).send({ error: 'Avatar not found' });
    }
  });

  app.get('/profiles/:userId/avatar', async (request, reply) => {
    if (!applyPublicLimit(request, reply)) return;
    const params = publicProfileParams.parse(request.params);
    const user = await db.selectFrom('users')
      .select(['id', 'status'])
      .where('id', '=', params.userId)
      .executeTakeFirst();
    const profile = await db.selectFrom('user_profiles')
      .select(['avatar_object_key', 'avatar_mime_type', 'profile_visibility', 'show_avatar'])
      .where('user_id', '=', params.userId)
      .executeTakeFirst();
    if (
      !user || user.status !== 'active' || !profile?.avatar_object_key || !profile.avatar_mime_type ||
      profile.profile_visibility === 'private' || profile.show_avatar === false
    ) {
      return reply.code(404).send({ error: 'Avatar not found' });
    }
    try {
      const delivery = await getListingMediaStorage().deliver(
        String(profile.avatar_object_key),
        String(profile.avatar_mime_type)
      );
      reply.header('Cache-Control', 'public, max-age=3600');
      return sendMedia(reply, delivery);
    } catch {
      return reply.code(404).send({ error: 'Avatar not found' });
    }
  });

  app.post(
    '/account/profile/avatar/upload',
    { preHandler: requireUser, bodyLimit: maximumProfileAvatarBytes },
    async (request, reply) => {
      const authRequest = request as AuthenticatedRequest;
      const userId = accountId(authRequest);
      if (!applyLimit(request, reply, 'account.avatar.upload', userId, 20, 60 * 60 * 1000)) return;

      const user = await db.selectFrom('users').select(['status']).where('id', '=', userId).executeTakeFirst();
      if (!user || user.status === 'closed') {
        return reply.code(409).send({ error: 'Account is not available for avatar changes' });
      }

      const declared = normalizeProfileAvatarMime(request.headers['content-type']);
      const buffer = Buffer.isBuffer(request.body) ? request.body : null;
      if (!declared || !buffer || buffer.length === 0) {
        return reply.code(400).send({ error: 'A supported image body is required' });
      }
      if (buffer.length > maximumProfileAvatarBytes) {
        return reply.code(413).send({ error: 'Avatar is too large' });
      }
      const detected = detectProfileAvatarMime(buffer);
      if (!detected || detected !== declared) {
        return reply.code(400).send({ error: 'Unsupported or mismatched image type' });
      }

      const existing = await db.selectFrom('user_profiles')
        .select(['avatar_object_key'])
        .where('user_id', '=', userId)
        .executeTakeFirst();
      const storage = getListingMediaStorage();
      const objectKey = profileAvatarObjectKey(userId, detected);
      let stored;
      try {
        stored = await storage.put({ objectKey, buffer, mimeType: detected });
      } catch {
        return reply.code(503).send({ error: 'Avatar storage unavailable' });
      }

      const now = new Date();
      try {
        const avatarValues = {
          avatar_object_key: stored.objectKey,
          avatar_mime_type: detected,
          avatar_size_bytes: buffer.length,
          avatar_sha256: stored.sha256,
          updated_at: now
        };
        await db.transaction().execute(async (transaction) => {
          await transaction.insertInto('user_profiles')
            .values({ user_id: userId, ...avatarValues, created_at: now })
            .onConflict((conflict) => conflict.column('user_id').doUpdateSet(avatarValues))
            .execute();
          await transaction.insertInto('audit_logs').values({
            actor_user_id: userId,
            action: 'account.avatar.updated',
            entity_type: 'user',
            entity_id: userId,
            ip_address: request.ip,
            metadata: { mimeType: detected, sizeBytes: buffer.length, storageDriver: storage.driver },
            created_at: now
          }).execute();
        });
      } catch (error) {
        try { await storage.remove(stored.objectKey); } catch {}
        request.log.error({ error }, 'avatar database write failed');
        return reply.code(500).send({ error: 'Avatar could not be saved' });
      }

      if (existing?.avatar_object_key && existing.avatar_object_key !== stored.objectKey) {
        try { await storage.remove(String(existing.avatar_object_key)); } catch (error) {
          request.log.warn({ error }, 'previous avatar cleanup failed');
        }
      }

      return reply.code(201).send({
        avatar: {
          url: '/v1/account/profile/avatar',
          mimeType: detected,
          sizeBytes: buffer.length
        }
      });
    }
  );

  app.post('/account/profile/avatar/delete', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const userId = accountId(authRequest);
    if (!applyLimit(request, reply, 'account.avatar.delete', userId, 20, 60 * 60 * 1000)) return;
    const profile = await db.selectFrom('user_profiles')
      .select(['avatar_object_key'])
      .where('user_id', '=', userId)
      .executeTakeFirst();
    if (!profile?.avatar_object_key) return reply.send({ deleted: false });

    const storage = getListingMediaStorage();
    try {
      await storage.remove(String(profile.avatar_object_key));
    } catch {
      return reply.code(503).send({ error: 'Avatar storage unavailable' });
    }

    const now = new Date();
    await db.transaction().execute(async (transaction) => {
      await transaction.updateTable('user_profiles')
        .set({
          avatar_object_key: null,
          avatar_mime_type: null,
          avatar_size_bytes: null,
          avatar_sha256: null,
          updated_at: now
        })
        .where('user_id', '=', userId)
        .execute();
      await transaction.insertInto('audit_logs').values({
        actor_user_id: userId,
        action: 'account.avatar.deleted',
        entity_type: 'user',
        entity_id: userId,
        ip_address: request.ip,
        metadata: { storageDriver: storage.driver },
        created_at: now
      }).execute();
    });
    return reply.send({ deleted: true });
  });

  app.get('/account/export', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const userId = accountId(authRequest);
    if (!applyLimit(request, reply, 'account.export', userId, 5, 60 * 60 * 1000)) return;
    const exported = await buildAccountExport(userId);
    if (!exported) return reply.code(404).send({ error: 'Account not found' });
    reply.header('Content-Disposition', 'attachment; filename="suqnaa-account-export.json"');
    return reply.send(exported);
  });

  app.post('/account/closure', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const userId = accountId(authRequest);
    if (!applyLimit(request, reply, 'account.closure', userId, 3, 24 * 60 * 60 * 1000)) return;
    const body = closureBody.parse(request.body);
    let result;
    try {
      result = await closeAccount({
        userId,
        currentPassword: body.currentPassword,
        mode: body.mode as AccountClosureMode,
        ipAddress: request.ip,
        storage: getListingMediaStorage()
      });
    } catch (error) {
      request.log.warn({ error }, 'account closure storage operation failed');
      return reply.code(503).send({ error: 'Account closure could not complete safely' });
    }
    if (result.outcome === 'invalid_password') {
      return reply.code(400).send({ error: 'Current password is incorrect' });
    }
    if (result.outcome === 'not_available') {
      return reply.code(409).send({ error: 'Account is not available for closure' });
    }
    return reply.send(result);
  });
}
