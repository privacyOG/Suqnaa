import { normalizePhoneE164 } from '../auth/phone.js';
import { db } from '../db/index.js';
import type { PasswordResetDeliveryProvider } from './delivery.js';
import { newPasswordResetToken, passwordResetTokenHash } from './token.js';

const resetLifetimeMs = 20 * 60 * 1000;
const resendCooldownMs = 60 * 1000;
const hourlyResetLimit = 5;
const dailyResetLimit = 10;

function retryWindowReached(recent: Array<{ created_at: Date }>, now: Date): boolean {
  const latest = recent[0]?.created_at;
  if (latest && now.getTime() - latest.getTime() < resendCooldownMs) return true;

  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  if (recent.filter((entry) => entry.created_at >= hourAgo).length >= hourlyResetLimit) return true;
  return recent.length >= dailyResetLimit;
}

export async function requestPhonePasswordReset(input: {
  phone: string;
  ipAddress?: string;
  pepper: string;
  provider: PasswordResetDeliveryProvider;
  now?: Date;
}): Promise<void> {
  const now = input.now ?? new Date();
  const normalizedPhone = normalizePhoneE164(input.phone);
  const user = await db.selectFrom('users')
    .select(['id', 'phone_e164', 'password_hash', 'status'])
    .where('phone_e164', '=', normalizedPhone)
    .executeTakeFirst();

  if (!user?.phone_e164 || !user.password_hash || user.status === 'closed') return;

  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const recent = await db.selectFrom('password_reset_tokens')
    .select(['created_at'])
    .where('user_id', '=', user.id)
    .where('created_at', '>=', oneDayAgo)
    .orderBy('created_at', 'desc')
    .execute() as Array<{ created_at: Date }>;

  if (retryWindowReached(recent, now)) return;

  const token = newPasswordResetToken();
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
        token_hash: passwordResetTokenHash(input.pepper, token),
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
      channel: 'phone',
      destination: user.phone_e164,
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
        metadata: { channel: 'phone' },
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
        metadata: { channel: 'phone' },
        created_at: now
      })
      .execute();
  }
}
