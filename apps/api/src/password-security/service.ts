import { db } from '../db/index.js';
import { hashPassword, verifyPassword } from '../security/password.js';
import type { PasswordResetDeliveryProvider } from './delivery.js';
import {
  newPasswordResetToken,
  passwordResetTokenHash
} from './token.js';

const resetLifetimeMs = 20 * 60 * 1000;
const resendCooldownMs = 60 * 1000;
const hourlyResetLimit = 5;
const dailyResetLimit = 10;

export interface SecuritySession {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
  expiresAt: Date;
}

export type ResetPasswordResult =
  | { outcome: 'reset'; revokedSessions: number }
  | { outcome: 'invalid_token' }
  | { outcome: 'same_password' };

export type ChangePasswordResult =
  | { outcome: 'changed'; revokedSessions: number }
  | { outcome: 'invalid_current_password' }
  | { outcome: 'same_password' }
  | { outcome: 'conflict' }
  | { outcome: 'not_found' };

function retryWindowReached(
  recent: Array<{ created_at: Date }>,
  now: Date
): boolean {
  const latest = recent[0]?.created_at;
  if (latest && now.getTime() - latest.getTime() < resendCooldownMs) {
    return true;
  }

  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  if (recent.filter((entry) => entry.created_at >= hourAgo).length >= hourlyResetLimit) {
    return true;
  }

  return recent.length >= dailyResetLimit;
}

export async function requestPasswordReset(input: {
  email: string;
  ipAddress?: string;
  pepper: string;
  provider: PasswordResetDeliveryProvider;
  now?: Date;
}): Promise<void> {
  const now = input.now ?? new Date();
  const normalizedEmail = input.email.trim().toLowerCase();
  const user = await db.selectFrom('users')
    .select(['id', 'email', 'password_hash', 'status'])
    .where('email', '=', normalizedEmail)
    .executeTakeFirst();

  if (!user?.email || !user.password_hash || user.status === 'closed') {
    return;
  }

  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const recent = await db.selectFrom('password_reset_tokens')
    .select(['created_at'])
    .where('user_id', '=', user.id)
    .where('created_at', '>=', oneDayAgo)
    .orderBy('created_at', 'desc')
    .execute() as Array<{ created_at: Date }>;

  if (retryWindowReached(recent, now)) {
    return;
  }

  const token = newPasswordResetToken();
  const tokenHash = passwordResetTokenHash(input.pepper, token);
  const expiresAt = new Date(now.getTime() + resetLifetimeMs);

  const resetRecord = await db.transaction().execute(async (transaction) => {
    await transaction.updateTable('password_reset_tokens')
      .set({ invalidated_at: now })
      .where('user_id', '=', user.id)
      .where('consumed_at', 'is', null)
      .where('invalidated_at', 'is', null)
      .execute();

    return transaction.insertInto('password_reset_tokens')
      .values({
        user_id: user.id,
        token_hash: tokenHash,
        requested_ip: input.ipAddress ?? null,
        expires_at: expiresAt,
        consumed_at: null,
        invalidated_at: null,
        created_at: now
      })
      .returning(['id'])
      .executeTakeFirstOrThrow();
  });

  try {
    await input.provider.deliver({
      destination: user.email,
      token,
      expiresAt
    });

    await db.insertInto('audit_logs')
      .values({
        actor_user_id: user.id,
        action: 'account.password_reset.requested',
        entity_type: 'user',
        entity_id: user.id,
        ip_address: input.ipAddress ?? null,
        metadata: {},
        created_at: now
      })
      .execute();
  } catch {
    await db.updateTable('password_reset_tokens')
      .set({ invalidated_at: new Date() })
      .where('id', '=', resetRecord.id)
      .where('consumed_at', 'is', null)
      .execute();

    await db.insertInto('audit_logs')
      .values({
        actor_user_id: user.id,
        action: 'account.password_reset.delivery_failed',
        entity_type: 'user',
        entity_id: user.id,
        ip_address: input.ipAddress ?? null,
        metadata: {},
        created_at: now
      })
      .execute();
  }
}

export async function resetPasswordWithToken(input: {
  token: string;
  newPassword: string;
  pepper: string;
  ipAddress?: string;
  now?: Date;
}): Promise<ResetPasswordResult> {
  const now = input.now ?? new Date();
  let tokenHash: string;
  try {
    tokenHash = passwordResetTokenHash(input.pepper, input.token);
  } catch {
    return { outcome: 'invalid_token' };
  }

  return db.transaction().execute(async (transaction) => {
    const reset = await transaction.selectFrom('password_reset_tokens')
      .select(['id', 'user_id', 'expires_at', 'consumed_at', 'invalidated_at'])
      .where('token_hash', '=', tokenHash)
      .forUpdate()
      .executeTakeFirst();

    if (
      !reset ||
      reset.consumed_at ||
      reset.invalidated_at ||
      (reset.expires_at as Date) <= now
    ) {
      return { outcome: 'invalid_token' } as ResetPasswordResult;
    }

    const user = await transaction.selectFrom('users')
      .select(['id', 'password_hash', 'status'])
      .where('id', '=', reset.user_id)
      .forUpdate()
      .executeTakeFirst();

    if (!user?.password_hash || user.status === 'closed') {
      await transaction.updateTable('password_reset_tokens')
        .set({ invalidated_at: now })
        .where('id', '=', reset.id)
        .execute();
      return { outcome: 'invalid_token' } as ResetPasswordResult;
    }

    if (await verifyPassword(user.password_hash, input.newPassword)) {
      return { outcome: 'same_password' } as ResetPasswordResult;
    }

    const passwordHash = await hashPassword(input.newPassword);
    await transaction.updateTable('users')
      .set({ password_hash: passwordHash, updated_at: now })
      .where('id', '=', user.id)
      .execute();

    await transaction.updateTable('password_reset_tokens')
      .set({ consumed_at: now })
      .where('id', '=', reset.id)
      .execute();

    await transaction.updateTable('password_reset_tokens')
      .set({ invalidated_at: now })
      .where('user_id', '=', user.id)
      .where('id', '!=', reset.id)
      .where('consumed_at', 'is', null)
      .where('invalidated_at', 'is', null)
      .execute();

    const revoked = await transaction.updateTable('refresh_sessions')
      .set({ revoked_at: now })
      .where('user_id', '=', user.id)
      .where('revoked_at', 'is', null)
      .returning(['id'])
      .execute();

    await transaction.insertInto('audit_logs')
      .values({
        actor_user_id: user.id,
        action: 'account.password_reset.completed',
        entity_type: 'user',
        entity_id: user.id,
        ip_address: input.ipAddress ?? null,
        metadata: { revokedSessions: revoked.length },
        created_at: now
      })
      .execute();

    return {
      outcome: 'reset',
      revokedSessions: revoked.length
    } as ResetPasswordResult;
  });
}

export async function changePassword(input: {
  userId: string;
  currentPassword: string;
  newPassword: string;
  ipAddress?: string;
  now?: Date;
}): Promise<ChangePasswordResult> {
  const now = input.now ?? new Date();
  const user = await db.selectFrom('users')
    .select(['id', 'password_hash'])
    .where('id', '=', input.userId)
    .executeTakeFirst();

  if (!user?.password_hash) {
    return { outcome: 'not_found' };
  }

  if (!(await verifyPassword(user.password_hash, input.currentPassword))) {
    return { outcome: 'invalid_current_password' };
  }

  if (await verifyPassword(user.password_hash, input.newPassword)) {
    return { outcome: 'same_password' };
  }

  const nextHash = await hashPassword(input.newPassword);

  return db.transaction().execute(async (transaction) => {
    const changed = await transaction.updateTable('users')
      .set({ password_hash: nextHash, updated_at: now })
      .where('id', '=', input.userId)
      .where('password_hash', '=', user.password_hash)
      .returning(['id'])
      .executeTakeFirst();

    if (!changed) {
      return { outcome: 'conflict' } as ChangePasswordResult;
    }

    const revoked = await transaction.updateTable('refresh_sessions')
      .set({ revoked_at: now })
      .where('user_id', '=', input.userId)
      .where('revoked_at', 'is', null)
      .returning(['id'])
      .execute();

    await transaction.updateTable('password_reset_tokens')
      .set({ invalidated_at: now })
      .where('user_id', '=', input.userId)
      .where('consumed_at', 'is', null)
      .where('invalidated_at', 'is', null)
      .execute();

    await transaction.insertInto('audit_logs')
      .values({
        actor_user_id: input.userId,
        action: 'account.password.changed',
        entity_type: 'user',
        entity_id: input.userId,
        ip_address: input.ipAddress ?? null,
        metadata: { revokedSessions: revoked.length },
        created_at: now
      })
      .execute();

    return {
      outcome: 'changed',
      revokedSessions: revoked.length
    } as ChangePasswordResult;
  });
}

export async function listSecuritySessions(userId: string, now = new Date()): Promise<SecuritySession[]> {
  const rows = await db.selectFrom('refresh_sessions')
    .select(['id', 'user_agent', 'ip_address', 'created_at', 'expires_at'])
    .where('user_id', '=', userId)
    .where('revoked_at', 'is', null)
    .where('expires_at', '>', now)
    .orderBy('created_at', 'desc')
    .limit(50)
    .execute();

  return rows.map((row) => ({
    id: row.id,
    userAgent: row.user_agent ?? null,
    ipAddress: row.ip_address?.toString?.() ?? row.ip_address ?? null,
    createdAt: row.created_at,
    expiresAt: row.expires_at
  }));
}

export async function revokeSecuritySession(input: {
  userId: string;
  sessionId: string;
  ipAddress?: string;
  now?: Date;
}): Promise<boolean> {
  const now = input.now ?? new Date();
  return db.transaction().execute(async (transaction) => {
    const revoked = await transaction.updateTable('refresh_sessions')
      .set({ revoked_at: now })
      .where('id', '=', input.sessionId)
      .where('user_id', '=', input.userId)
      .where('revoked_at', 'is', null)
      .returning(['id'])
      .executeTakeFirst();

    if (!revoked) {
      return false;
    }

    await transaction.insertInto('audit_logs')
      .values({
        actor_user_id: input.userId,
        action: 'account.session.revoked',
        entity_type: 'refresh_session',
        entity_id: input.sessionId,
        ip_address: input.ipAddress ?? null,
        metadata: {},
        created_at: now
      })
      .execute();

    return true;
  });
}

export async function revokeAllSecuritySessions(input: {
  userId: string;
  ipAddress?: string;
  now?: Date;
}): Promise<number> {
  const now = input.now ?? new Date();
  return db.transaction().execute(async (transaction) => {
    const revoked = await transaction.updateTable('refresh_sessions')
      .set({ revoked_at: now })
      .where('user_id', '=', input.userId)
      .where('revoked_at', 'is', null)
      .returning(['id'])
      .execute();

    await transaction.insertInto('audit_logs')
      .values({
        actor_user_id: input.userId,
        action: 'account.sessions.revoked_all',
        entity_type: 'user',
        entity_id: input.userId,
        ip_address: input.ipAddress ?? null,
        metadata: { revokedSessions: revoked.length },
        created_at: now
      })
      .execute();

    return revoked.length;
  });
}
