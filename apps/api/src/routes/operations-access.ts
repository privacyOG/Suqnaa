import type { FastifyInstance } from 'fastify';
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
import { checkRateLimit, rateLimitResponse } from '../security/rate-limit.js';

const targetParams = z.object({ userId: z.string().uuid() });
const roleBody = z.object({
  roleKey: z.string().trim().regex(/^[a-z][a-z0-9_-]{2,49}$/),
  reason: z.string().trim().max(500).optional()
}).strict();

function roleMutationAllowed(request: AuthorizedOperationsRequest) {
  return checkRateLimit({
    group: 'operations.roles.mutate',
    identifiers: [`account:${request.operationsUserId}`],
    limit: 30,
    windowMs: 60 * 60 * 1000
  });
}

export async function operationsAccessRoutes(app: FastifyInstance): Promise<void> {
  app.get('/operations/access/me', { preHandler: requirePermission('operations.access') }, async (request, reply) => {
    const authRequest = request as AuthorizedOperationsRequest;
    const access = await readAdministrativeAccess(authRequest.operationsUserId);
    return reply.send({ userId: authRequest.operationsUserId, ...access });
  });

  app.get('/operations/access/roles', { preHandler: requirePermission('roles.read') }, async (_request, reply) => {
    return reply.send({ roles: await listAdministrativeRoles() });
  });

  app.get('/operations/access/assignments', { preHandler: requirePermission('roles.read') }, async (_request, reply) => {
    return reply.send({ assignments: await listAdministrativeAssignments() });
  });

  app.post('/operations/access/users/:userId/grant', { preHandler: requirePermission('roles.manage') }, async (request, reply) => {
    const authRequest = request as AuthorizedOperationsRequest;
    const limit = roleMutationAllowed(authRequest);
    if (!limit.allowed) {
      reply.header('Retry-After', String(limit.retryAfterSeconds));
      return reply.code(429).send(rateLimitResponse(limit));
    }

    const params = targetParams.parse(request.params);
    const body = roleBody.parse(request.body);
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
    const limit = roleMutationAllowed(authRequest);
    if (!limit.allowed) {
      reply.header('Retry-After', String(limit.retryAfterSeconds));
      return reply.code(429).send(rateLimitResponse(limit));
    }

    const params = targetParams.parse(request.params);
    const body = roleBody.parse(request.body);
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
