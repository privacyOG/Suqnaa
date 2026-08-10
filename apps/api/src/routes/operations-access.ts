import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  grantAdministrativeRole,
  listAdministrativeAssignments,
  listAdministrativeRoles,
  readAdministrativeAccess,
  revokeAdministrativeRole,
  AdministrativeRoleError
} from '../admin/role-service.js';
import { requirePermission, type AuthorizedOperationsRequest } from '../auth/require-permission.js';
import { rateLimitResponse } from '../security/rate-limit.js';
import { checkSharedRateLimit } from '../security/shared-rate-limit.js';

const targetParams = z.object({ userId: z.string().uuid() });
const grantBody = z.object({
  roleKey: z.string().trim().regex(/^[a-z][a-z0-9_-]{2,49}$/)
}).strict();
const revokeBody = z.object({
  roleKey: z.string().trim().regex(/^[a-z][a-z0-9_-]{2,49}$/),
  reason: z.string().trim().max(500).optional()
}).strict();

async function enforceAdministrativeLimit(
  request: FastifyRequest,
  reply: FastifyReply,
  accountId: string,
  group: string,
  accountLimit: number
): Promise<boolean> {
  const account = await checkSharedRateLimit({
    group: `${group}.account`,
    identifiers: [`account:${accountId}`],
    limit: accountLimit,
    windowMs: 60 * 60 * 1000
  });
  const ip = await checkSharedRateLimit({
    group: `${group}.ip`,
    identifiers: [`ip:${request.ip}`],
    limit: accountLimit * 3,
    windowMs: 60 * 60 * 1000
  });
  const limited = !account.allowed ? account : !ip.allowed ? ip : undefined;
  if (!limited) return true;
  reply.header('Retry-After', String(limited.retryAfterSeconds));
  reply.code(429).send(rateLimitResponse(limited));
  return false;
}

export async function operationsAccessRoutes(app: FastifyInstance): Promise<void> {
  app.get('/operations/access/me', { preHandler: requirePermission('operations.access') }, async (request, reply) => {
    const authRequest = request as AuthorizedOperationsRequest;
    if (!await enforceAdministrativeLimit(request, reply, authRequest.operationsUserId, 'operations.access.self', 180)) return;
    const access = await readAdministrativeAccess(authRequest.operationsUserId);
    return reply.send({ userId: authRequest.operationsUserId, ...access });
  });

  app.get('/operations/access/roles', { preHandler: requirePermission('roles.read') }, async (request, reply) => {
    const authRequest = request as AuthorizedOperationsRequest;
    if (!await enforceAdministrativeLimit(request, reply, authRequest.operationsUserId, 'operations.roles.read', 120)) return;
    return reply.send({ roles: await listAdministrativeRoles() });
  });

  app.get('/operations/access/assignments', { preHandler: requirePermission('roles.read') }, async (request, reply) => {
    const authRequest = request as AuthorizedOperationsRequest;
    if (!await enforceAdministrativeLimit(request, reply, authRequest.operationsUserId, 'operations.assignments.read', 120)) return;
    return reply.send({ assignments: await listAdministrativeAssignments() });
  });

  app.post('/operations/access/users/:userId/grant', { preHandler: requirePermission('roles.manage') }, async (request, reply) => {
    const authRequest = request as AuthorizedOperationsRequest;
    if (!await enforceAdministrativeLimit(request, reply, authRequest.operationsUserId, 'operations.roles.grant', 30)) return;

    const params = targetParams.parse(request.params);
    const body = grantBody.parse(request.body);
    try {
      const assignment = await grantAdministrativeRole({
        actorId: authRequest.operationsUserId,
        targetUserId: params.userId,
        roleKey: body.roleKey,
        ipAddress: request.ip
      });
      return reply.code(201).send({ assignment });
    } catch (error) {
      if (error instanceof AdministrativeRoleError) {
        return reply.code(error.statusCode).send({ error: error.message, code: error.code });
      }
      throw error;
    }
  });

  app.post('/operations/access/users/:userId/revoke', { preHandler: requirePermission('roles.manage') }, async (request, reply) => {
    const authRequest = request as AuthorizedOperationsRequest;
    if (!await enforceAdministrativeLimit(request, reply, authRequest.operationsUserId, 'operations.roles.revoke', 30)) return;

    const params = targetParams.parse(request.params);
    const body = revokeBody.parse(request.body);
    try {
      const assignment = await revokeAdministrativeRole({
        actorId: authRequest.operationsUserId,
        targetUserId: params.userId,
        roleKey: body.roleKey,
        reason: body.reason,
        ipAddress: request.ip
      });
      return reply.send({ assignment });
    } catch (error) {
      if (error instanceof AdministrativeRoleError) {
        return reply.code(error.statusCode).send({ error: error.message, code: error.code });
      }
      throw error;
    }
  });
}
