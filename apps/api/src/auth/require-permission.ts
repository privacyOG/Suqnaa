import type { FastifyReply, FastifyRequest } from 'fastify';
import { db } from '../db/index.js';
import { requireUser, type AuthenticatedRequest } from './require-user.js';

export type AdministrativePermission =
  | 'operations.access'
  | 'moderation.queue.read'
  | 'moderation.queue.resolve'
  | 'moderation.listing.manage'
  | 'moderation.account.manage'
  | 'moderation.policy.manage'
  | 'moderation.appeal.review'
  | 'verification.read'
  | 'verification.review'
  | 'audit.read'
  | 'roles.read'
  | 'roles.manage'
  | 'payments.read'
  | 'payments.request'
  | 'payments.approve'
  | 'settlements.read'
  | 'settlements.run'
  | 'disputes.read'
  | 'disputes.review'
  | 'disputes.resolve';

export interface AuthorizedOperationsRequest extends AuthenticatedRequest {
  operationsUserId: string;
  administrativePermissions: ReadonlySet<string>;
}

export async function readAdministrativePermissions(userId: string): Promise<Set<string>> {
  const rows = await db.selectFrom('admin_role_assignments')
    .innerJoin('admin_roles', 'admin_roles.id', 'admin_role_assignments.role_id')
    .innerJoin('admin_role_permissions', 'admin_role_permissions.role_id', 'admin_roles.id')
    .select(['admin_role_permissions.permission_key as permission_key'])
    .where('admin_role_assignments.user_id', '=', userId)
    .where('admin_role_assignments.revoked_at', 'is', null)
    .execute();

  return new Set(rows.map((row) => String(row.permission_key)));
}

export function requirePermission(permission: AdministrativePermission) {
  return async function administrativePermissionGuard(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    await requireUser(request, reply);
    if (reply.sent) return;

    const authRequest = request as AuthenticatedRequest;
    const permissions = await readAdministrativePermissions(authRequest.user.sub);
    if (!permissions.has(permission)) {
      reply.code(403).send({ error: 'Administrative permission required', permission });
      return;
    }

    Object.assign(request, {
      operationsUserId: authRequest.user.sub,
      administrativePermissions: permissions
    });
  };
}