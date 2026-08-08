import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser, type AuthenticatedRequest } from '../auth/require-user.js';
import {
  getNotificationPreferences,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationEventFamilies,
  NotificationConflictError,
  NotificationNotFoundError,
  registerPushTarget,
  revokePushTarget,
  updateNotificationPreference
} from '../notifications/service.js';

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  unreadOnly: z.enum(['true', 'false']).optional(),
  before: z.string().datetime().optional()
});

const notificationParams = z.object({ notificationId: z.string().uuid() });
const targetParams = z.object({ targetId: z.string().uuid() });
const preferenceBody = z.object({
  eventFamily: z.enum(notificationEventFamilies),
  emailEnabled: z.boolean(),
  smsEnabled: z.boolean(),
  pushEnabled: z.boolean()
}).strict();
const pushTargetBody = z.object({
  provider: z.string().trim().min(1).max(80),
  platform: z.enum(['web', 'android', 'ios']),
  destination: z.string().trim().min(8).max(4096)
}).strict();

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  app.get('/notifications', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const query = listQuery.parse(request.query);
    return reply.send(await listNotifications({
      userId: authRequest.user.sub,
      limit: query.limit,
      unreadOnly: query.unreadOnly === 'true',
      before: query.before ? new Date(query.before) : undefined
    }));
  });

  app.post('/notifications/:notificationId/read', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const params = notificationParams.parse(request.params);
    try {
      return reply.send(await markNotificationRead(authRequest.user.sub, params.notificationId));
    } catch (error) {
      if (error instanceof NotificationNotFoundError) {
        return reply.code(404).send({ error: error.message });
      }
      throw error;
    }
  });

  app.post('/notifications/read-all', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    return reply.send(await markAllNotificationsRead(authRequest.user.sub));
  });

  app.get('/notifications/preferences', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    return reply.send({ preferences: await getNotificationPreferences(authRequest.user.sub) });
  });

  app.post('/notifications/preferences', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const body = preferenceBody.parse(request.body);
    return reply.send({
      preference: await updateNotificationPreference({
        userId: authRequest.user.sub,
        ...body
      })
    });
  });

  app.post('/notifications/push-targets', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const body = pushTargetBody.parse(request.body);
    try {
      const target = await registerPushTarget({
        userId: authRequest.user.sub,
        ...body
      });
      return reply.code(201).send({
        target: {
          id: target.id,
          provider: target.provider,
          platform: target.platform,
          createdAt: target.created_at,
          lastSeenAt: target.last_seen_at
        }
      });
    } catch (error) {
      if (error instanceof NotificationConflictError) {
        return reply.code(409).send({ error: error.message });
      }
      throw error;
    }
  });

  app.delete('/notifications/push-targets/:targetId', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const params = targetParams.parse(request.params);
    try {
      return reply.send(await revokePushTarget(authRequest.user.sub, params.targetId));
    } catch (error) {
      if (error instanceof NotificationNotFoundError) {
        return reply.code(404).send({ error: error.message });
      }
      throw error;
    }
  });
}