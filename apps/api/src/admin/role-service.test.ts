import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { closeDb, db } from '../db/index.js';
import {
  AdministrativeRoleError,
  bootstrapPlatformAdministrator,
  grantAdministrativeRole,
  listAdministrativeAssignments,
  readAdministrativeAccess,
  revokeAdministrativeRole
} from './role-service.js';

const adminId = randomUUID();
const secondAdminId = randomUUID();
const reviewerId = randomUUID();
const now = new Date();

try {
  await db.insertInto('users').values([
    { id: adminId, email: 'rbac-admin@example.test', display_name: 'RBAC Admin', status: 'active', email_verified_at: now, created_at: now, updated_at: now },
    { id: secondAdminId, email: 'rbac-admin-2@example.test', display_name: 'RBAC Admin Two', status: 'active', email_verified_at: now, created_at: now, updated_at: now },
    { id: reviewerId, email: 'rbac-reviewer@example.test', display_name: 'RBAC Reviewer', status: 'active', email_verified_at: now, created_at: now, updated_at: now }
  ]).execute();

  const bootstrapId = await bootstrapPlatformAdministrator(adminId);
  assert.ok(bootstrapId);
  const adminAccess = await readAdministrativeAccess(adminId);
  assert.ok(adminAccess.permissions.includes('roles.manage'));
  assert.ok(adminAccess.permissions.includes('moderation.account.manage'));

  await assert.rejects(
    () => bootstrapPlatformAdministrator(secondAdminId),
    (error: unknown) => error instanceof AdministrativeRoleError && error.code === 'bootstrap_closed'
  );

  await grantAdministrativeRole({ actorId: adminId, targetUserId: secondAdminId, roleKey: 'platform_admin' });
  await grantAdministrativeRole({ actorId: adminId, targetUserId: reviewerId, roleKey: 'trust_reviewer' });

  const reviewerAccess = await readAdministrativeAccess(reviewerId);
  assert.ok(reviewerAccess.permissions.includes('verification.read'));
  assert.ok(reviewerAccess.permissions.includes('verification.review'));
  assert.equal(reviewerAccess.permissions.includes('moderation.account.manage'), false);
  assert.equal(reviewerAccess.permissions.includes('roles.manage'), false);

  await assert.rejects(
    () => grantAdministrativeRole({ actorId: reviewerId, targetUserId: secondAdminId, roleKey: 'audit_reviewer' }),
    (error: unknown) => error instanceof AdministrativeRoleError && error.code === 'privilege_escalation'
  );

  await assert.rejects(
    () => grantAdministrativeRole({ actorId: adminId, targetUserId: adminId, roleKey: 'audit_reviewer' }),
    (error: unknown) => error instanceof AdministrativeRoleError && error.code === 'self_role_change'
  );

  const revoked = await revokeAdministrativeRole({
    actorId: adminId,
    targetUserId: reviewerId,
    roleKey: 'trust_reviewer',
    reason: 'Test role removal'
  });
  assert.ok(revoked.revokedAt);
  assert.equal((await readAdministrativeAccess(reviewerId)).roles.length, 0);

  const historical = await db.selectFrom('admin_role_assignments')
    .select(['revoked_by', 'revoked_at', 'revoke_reason'])
    .where('id', '=', revoked.assignmentId)
    .executeTakeFirstOrThrow();
  assert.equal(historical.revoked_by, adminId);
  assert.ok(historical.revoked_at);
  assert.equal(historical.revoke_reason, 'Test role removal');

  const activeAssignments = await listAdministrativeAssignments();
  assert.ok(activeAssignments.some((entry) => entry.userId === adminId && entry.roleKey === 'platform_admin'));
  assert.ok(activeAssignments.some((entry) => entry.userId === secondAdminId && entry.roleKey === 'platform_admin'));
  assert.equal(activeAssignments.some((entry) => entry.userId === reviewerId), false);

  const audits = await db.selectFrom('audit_logs')
    .select(['action'])
    .where('action', 'in', ['operations.roles.bootstrap', 'operations.roles.grant', 'operations.roles.revoke'])
    .where('actor_user_id', '=', adminId)
    .execute();
  assert.ok(audits.some((entry) => entry.action === 'operations.roles.bootstrap'));
  assert.ok(audits.some((entry) => entry.action === 'operations.roles.grant'));
  assert.ok(audits.some((entry) => entry.action === 'operations.roles.revoke'));

  console.log('Administrative role lifecycle service tests passed.');
} finally {
  await db.deleteFrom('admin_role_assignments').where('user_id', 'in', [adminId, secondAdminId, reviewerId]).execute();
  await db.deleteFrom('users').where('id', 'in', [adminId, secondAdminId, reviewerId]).execute();
  await closeDb();
}
