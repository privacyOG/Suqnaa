import { db } from '../db/index.js';

export const platformAdministratorRole = 'platform_admin';

export class AdministrativeRoleError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
  }
}

export async function readAdministrativeAccess(userId: string) {
  const assignments = await db.selectFrom('admin_role_assignments')
    .innerJoin('admin_roles', 'admin_roles.id', 'admin_role_assignments.role_id')
    .select([
      'admin_role_assignments.id as assignment_id',
      'admin_roles.role_key as role_key',
      'admin_roles.display_name as display_name',
      'admin_role_assignments.granted_at as granted_at'
    ])
    .where('admin_role_assignments.user_id', '=', userId)
    .where('admin_role_assignments.revoked_at', 'is', null)
    .orderBy('admin_roles.role_key')
    .execute();

  const permissionRows = await db.selectFrom('admin_role_assignments')
    .innerJoin('admin_role_permissions', 'admin_role_permissions.role_id', 'admin_role_assignments.role_id')
    .select(['admin_role_permissions.permission_key as permission_key'])
    .where('admin_role_assignments.user_id', '=', userId)
    .where('admin_role_assignments.revoked_at', 'is', null)
    .orderBy('admin_role_permissions.permission_key')
    .execute();

  return {
    roles: assignments.map((row) => ({
      assignmentId: row.assignment_id,
      key: row.role_key,
      name: row.display_name,
      grantedAt: row.granted_at
    })),
    permissions: [...new Set(permissionRows.map((row) => String(row.permission_key)))]
  };
}

export async function listAdministrativeRoles() {
  const roles = await db.selectFrom('admin_roles')
    .select(['id', 'role_key', 'display_name', 'description', 'is_system'])
    .orderBy('role_key')
    .execute();
  const permissions = await db.selectFrom('admin_role_permissions')
    .select(['role_id', 'permission_key'])
    .orderBy('permission_key')
    .execute();

  return roles.map((role) => ({
    key: role.role_key,
    name: role.display_name,
    description: role.description,
    system: Boolean(role.is_system),
    permissions: permissions
      .filter((entry) => entry.role_id === role.id)
      .map((entry) => String(entry.permission_key))
  }));
}

export async function listAdministrativeAssignments() {
  const rows = await db.selectFrom('admin_role_assignments')
    .innerJoin('admin_roles', 'admin_roles.id', 'admin_role_assignments.role_id')
    .innerJoin('users', 'users.id', 'admin_role_assignments.user_id')
    .select([
      'admin_role_assignments.id as id',
      'admin_role_assignments.user_id as user_id',
      'admin_roles.role_key as role_key',
      'admin_roles.display_name as role_name',
      'users.display_name as display_name',
      'users.email as email',
      'users.phone_e164 as phone_e164',
      'users.status as user_status',
      'admin_role_assignments.granted_by as granted_by',
      'admin_role_assignments.granted_at as granted_at'
    ])
    .where('admin_role_assignments.revoked_at', 'is', null)
    .orderBy('admin_role_assignments.granted_at', 'desc')
    .execute();

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    displayName: row.display_name,
    email: row.email ?? null,
    phoneE164: row.phone_e164 ?? null,
    accountStatus: row.user_status,
    roleKey: row.role_key,
    roleName: row.role_name,
    grantedBy: row.granted_by,
    grantedAt: row.granted_at
  }));
}

async function rolePermissionKeys(executor: any, roleId: string): Promise<Set<string>> {
  const rows = await executor.selectFrom('admin_role_permissions')
    .select(['permission_key'])
    .where('role_id', '=', roleId)
    .execute();
  return new Set(rows.map((row: any) => String(row.permission_key)));
}

async function actorPermissionKeys(executor: any, actorId: string): Promise<Set<string>> {
  const rows = await executor.selectFrom('admin_role_assignments')
    .innerJoin('admin_role_permissions', 'admin_role_permissions.role_id', 'admin_role_assignments.role_id')
    .select(['admin_role_permissions.permission_key as permission_key'])
    .where('admin_role_assignments.user_id', '=', actorId)
    .where('admin_role_assignments.revoked_at', 'is', null)
    .execute();
  return new Set(rows.map((row: any) => String(row.permission_key)));
}

export async function grantAdministrativeRole(input: {
  actorId: string;
  targetUserId: string;
  roleKey: string;
  ipAddress?: string;
}) {
  if (input.actorId === input.targetUserId) {
    throw new AdministrativeRoleError('self_role_change', 409, 'Administrators cannot change their own roles');
  }

  return db.transaction().execute(async (trx) => {
    const target = await trx.selectFrom('users')
      .select(['id', 'status'])
      .where('id', '=', input.targetUserId)
      .forUpdate()
      .executeTakeFirst();
    if (!target || target.status !== 'active') {
      throw new AdministrativeRoleError('target_unavailable', 404, 'Active target account not found');
    }

    const role = await trx.selectFrom('admin_roles')
      .select(['id', 'role_key'])
      .where('role_key', '=', input.roleKey)
      .executeTakeFirst();
    if (!role) {
      throw new AdministrativeRoleError('role_not_found', 404, 'Administrative role not found');
    }

    const actorPermissions = await actorPermissionKeys(trx, input.actorId);
    const rolePermissions = await rolePermissionKeys(trx, role.id);
    for (const permission of rolePermissions) {
      if (!actorPermissions.has(permission)) {
        throw new AdministrativeRoleError('privilege_escalation', 403, 'Cannot grant permissions the actor does not hold');
      }
    }

    const existing = await trx.selectFrom('admin_role_assignments')
      .select(['id'])
      .where('user_id', '=', input.targetUserId)
      .where('role_id', '=', role.id)
      .where('revoked_at', 'is', null)
      .executeTakeFirst();
    if (existing) {
      throw new AdministrativeRoleError('already_assigned', 409, 'Administrative role is already assigned');
    }

    const now = new Date();
    const assignment = await trx.insertInto('admin_role_assignments')
      .values({
        user_id: input.targetUserId,
        role_id: role.id,
        granted_by: input.actorId,
        granted_at: now
      })
      .returning(['id', 'granted_at'])
      .executeTakeFirstOrThrow();

    await trx.insertInto('audit_logs').values({
      actor_user_id: input.actorId,
      action: 'operations.roles.grant',
      entity_type: 'user',
      entity_id: input.targetUserId,
      ip_address: input.ipAddress ?? null,
      metadata: { roleKey: role.role_key, assignmentId: assignment.id },
      created_at: now
    }).execute();

    return { assignmentId: assignment.id, roleKey: role.role_key, grantedAt: assignment.granted_at };
  });
}

export async function revokeAdministrativeRole(input: {
  actorId: string;
  targetUserId: string;
  roleKey: string;
  reason?: string;
  ipAddress?: string;
}) {
  if (input.actorId === input.targetUserId) {
    throw new AdministrativeRoleError('self_role_change', 409, 'Administrators cannot change their own roles');
  }

  return db.transaction().execute(async (trx) => {
    const role = await trx.selectFrom('admin_roles')
      .select(['id', 'role_key'])
      .where('role_key', '=', input.roleKey)
      .executeTakeFirst();
    if (!role) {
      throw new AdministrativeRoleError('role_not_found', 404, 'Administrative role not found');
    }

    const actorPermissions = await actorPermissionKeys(trx, input.actorId);
    const rolePermissions = await rolePermissionKeys(trx, role.id);
    for (const permission of rolePermissions) {
      if (!actorPermissions.has(permission)) {
        throw new AdministrativeRoleError('privilege_escalation', 403, 'Cannot revoke permissions the actor does not hold');
      }
    }

    const assignment = await trx.selectFrom('admin_role_assignments')
      .select(['id'])
      .where('user_id', '=', input.targetUserId)
      .where('role_id', '=', role.id)
      .where('revoked_at', 'is', null)
      .forUpdate()
      .executeTakeFirst();
    if (!assignment) {
      throw new AdministrativeRoleError('assignment_not_found', 404, 'Active administrative role assignment not found');
    }

    if (role.role_key === platformAdministratorRole) {
      const administrators = await trx.selectFrom('admin_role_assignments')
        .select(({ fn }: any) => fn.countAll().as('count'))
        .where('role_id', '=', role.id)
        .where('revoked_at', 'is', null)
        .executeTakeFirstOrThrow();
      if (Number(administrators.count) <= 1) {
        throw new AdministrativeRoleError('last_platform_admin', 409, 'Cannot revoke the last platform administrator');
      }
    }

    const now = new Date();
    await trx.updateTable('admin_role_assignments')
      .set({
        revoked_by: input.actorId,
        revoked_at: now,
        revoke_reason: input.reason ?? null
      })
      .where('id', '=', assignment.id)
      .where('revoked_at', 'is', null)
      .execute();

    await trx.insertInto('audit_logs').values({
      actor_user_id: input.actorId,
      action: 'operations.roles.revoke',
      entity_type: 'user',
      entity_id: input.targetUserId,
      ip_address: input.ipAddress ?? null,
      metadata: {
        roleKey: role.role_key,
        assignmentId: assignment.id,
        reasonProvided: Boolean(input.reason)
      },
      created_at: now
    }).execute();

    return { assignmentId: assignment.id, roleKey: role.role_key, revokedAt: now };
  });
}

export async function bootstrapPlatformAdministrator(userId: string) {
  return db.transaction().execute(async (trx) => {
    const user = await trx.selectFrom('users')
      .select(['id', 'status'])
      .where('id', '=', userId)
      .forUpdate()
      .executeTakeFirst();
    if (!user || user.status !== 'active') {
      throw new AdministrativeRoleError('target_unavailable', 404, 'Active bootstrap account not found');
    }

    const role = await trx.selectFrom('admin_roles')
      .select(['id'])
      .where('role_key', '=', platformAdministratorRole)
      .executeTakeFirstOrThrow();
    const existingAdministrator = await trx.selectFrom('admin_role_assignments')
      .select(['id'])
      .where('role_id', '=', role.id)
      .where('revoked_at', 'is', null)
      .forUpdate()
      .executeTakeFirst();
    if (existingAdministrator) {
      throw new AdministrativeRoleError('bootstrap_closed', 409, 'A platform administrator already exists');
    }

    const now = new Date();
    const assignment = await trx.insertInto('admin_role_assignments')
      .values({ user_id: userId, role_id: role.id, granted_by: userId, granted_at: now })
      .returning(['id'])
      .executeTakeFirstOrThrow();
    await trx.insertInto('audit_logs').values({
      actor_user_id: userId,
      action: 'operations.roles.bootstrap',
      entity_type: 'user',
      entity_id: userId,
      metadata: { roleKey: platformAdministratorRole, assignmentId: assignment.id },
      created_at: now
    }).execute();
    return assignment.id;
  });
}
