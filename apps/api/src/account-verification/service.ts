import { randomUUID } from 'node:crypto';
import { db } from '../db/index.js';
import {
  contactFingerprint,
  generateVerificationCode,
  normalizeVerificationCode,
  verificationCodeHash,
  verificationCodeMatches
} from './code.js';
import {
  maskVerificationDestination,
  type VerificationChannel,
  type VerificationDeliveryProvider
} from './provider.js';

const codeLifetimeMs = 10 * 60 * 1000;
const resendCooldownMs = 60 * 1000;
const hourlyRequestLimit = 5;
const dailyRequestLimit = 10;
const maximumAttempts = 5;

export interface VerificationStateChannel {
  channel: VerificationChannel;
  available: boolean;
  destination: string | null;
  verifiedAt: Date | null;
}

export interface VerificationState {
  status: string;
  channels: VerificationStateChannel[];
}

export type VerificationRequestResult =
  | { outcome: 'sent'; expiresAt: Date; resendAfterSeconds: number }
  | { outcome: 'missing_contact' }
  | { outcome: 'already_verified'; verifiedAt: Date }
  | { outcome: 'rate_limited'; retryAfterSeconds: number };

export type VerificationConfirmResult =
  | { outcome: 'verified'; verifiedAt: Date; status: string }
  | { outcome: 'already_verified'; verifiedAt: Date; status: string }
  | { outcome: 'missing_contact' }
  | { outcome: 'not_found' }
  | { outcome: 'expired' }
  | { outcome: 'contact_changed' }
  | { outcome: 'invalid_code'; attemptsRemaining: number }
  | { outcome: 'attempts_exhausted' };

export class VerificationDeliveryError extends Error {
  constructor() {
    super('Verification delivery failed');
    this.name = 'VerificationDeliveryError';
  }
}

function contactForChannel(
  user: { email?: string | null; phone_e164?: string | null },
  channel: VerificationChannel
): string | null {
  return channel === 'email'
    ? user.email?.trim().toLowerCase() || null
    : user.phone_e164?.trim() || null;
}

function verifiedAtForChannel(
  user: { email_verified_at?: Date | null; phone_verified_at?: Date | null },
  channel: VerificationChannel
): Date | null {
  return channel === 'email'
    ? user.email_verified_at ?? null
    : user.phone_verified_at ?? null;
}

export async function loadVerificationState(userId: string): Promise<VerificationState | null> {
  const user = await db.selectFrom('users')
    .select([
      'status',
      'email',
      'phone_e164',
      'email_verified_at',
      'phone_verified_at'
    ])
    .where('id', '=', userId)
    .executeTakeFirst();

  if (!user) {
    return null;
  }

  return {
    status: user.status,
    channels: (['email', 'phone'] as const).map((channel) => {
      const destination = contactForChannel(user, channel);
      return {
        channel,
        available: Boolean(destination),
        destination: destination ? maskVerificationDestination(channel, destination) : null,
        verifiedAt: verifiedAtForChannel(user, channel)
      };
    })
  };
}

function positiveRetryAfter(milliseconds: number): number {
  return Math.max(1, Math.ceil(milliseconds / 1000));
}

export async function requestContactVerification(input: {
  userId: string;
  channel: VerificationChannel;
  ipAddress?: string;
  pepper: string;
  provider: VerificationDeliveryProvider;
  now?: Date;
}): Promise<VerificationRequestResult> {
  const now = input.now ?? new Date();
  const user = await db.selectFrom('users')
    .select([
      'id',
      'email',
      'phone_e164',
      'email_verified_at',
      'phone_verified_at'
    ])
    .where('id', '=', input.userId)
    .executeTakeFirst();

  if (!user) {
    return { outcome: 'missing_contact' };
  }

  const destination = contactForChannel(user, input.channel);
  if (!destination) {
    return { outcome: 'missing_contact' };
  }

  const verifiedAt = verifiedAtForChannel(user, input.channel);
  if (verifiedAt) {
    return { outcome: 'already_verified', verifiedAt };
  }

  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const recent = await db.selectFrom('account_contact_verifications')
    .select(['created_at'])
    .where('user_id', '=', input.userId)
    .where('channel', '=', input.channel)
    .where('created_at', '>=', oneDayAgo)
    .orderBy('created_at', 'desc')
    .execute();

  const latestCreatedAt = recent[0]?.created_at as Date | undefined;
  if (latestCreatedAt) {
    const cooldownRemaining = resendCooldownMs - (now.getTime() - latestCreatedAt.getTime());
    if (cooldownRemaining > 0) {
      return {
        outcome: 'rate_limited',
        retryAfterSeconds: positiveRetryAfter(cooldownRemaining)
      };
    }
  }

  const hourlyCount = recent.filter(
    (entry) => (entry.created_at as Date) >= oneHourAgo
  ).length;
  if (hourlyCount >= hourlyRequestLimit) {
    const earliest = recent
      .map((entry) => entry.created_at as Date)
      .filter((createdAt) => createdAt >= oneHourAgo)
      .at(-1) ?? oneHourAgo;
    return {
      outcome: 'rate_limited',
      retryAfterSeconds: positiveRetryAfter(
        earliest.getTime() + 60 * 60 * 1000 - now.getTime()
      )
    };
  }

  if (recent.length >= dailyRequestLimit) {
    const earliest = recent.at(-1)?.created_at as Date | undefined;
    return {
      outcome: 'rate_limited',
      retryAfterSeconds: positiveRetryAfter(
        (earliest?.getTime() ?? oneDayAgo.getTime()) + 24 * 60 * 60 * 1000 - now.getTime()
      )
    };
  }

  const verificationId = randomUUID();
  const code = generateVerificationCode();
  const expiresAt = new Date(now.getTime() + codeLifetimeMs);
  const fingerprint = contactFingerprint(input.pepper, input.channel, destination);
  const codeHash = verificationCodeHash({
    pepper: input.pepper,
    verificationId,
    userId: input.userId,
    channel: input.channel,
    code
  });

  await db.transaction().execute(async (transaction) => {
    await transaction.updateTable('account_contact_verifications')
      .set({ invalidated_at: now })
      .where('user_id', '=', input.userId)
      .where('channel', '=', input.channel)
      .where('consumed_at', 'is', null)
      .where('invalidated_at', 'is', null)
      .execute();

    await transaction.insertInto('account_contact_verifications')
      .values({
        id: verificationId,
        user_id: input.userId,
        channel: input.channel,
        contact_fingerprint: fingerprint,
        code_hash: codeHash,
        attempt_count: 0,
        max_attempts: maximumAttempts,
        expires_at: expiresAt,
        consumed_at: null,
        invalidated_at: null,
        requested_ip: input.ipAddress ?? null,
        created_at: now
      })
      .execute();
  });

  try {
    await input.provider.deliver({
      channel: input.channel,
      destination,
      code,
      expiresAt
    });
  } catch {
    await db.updateTable('account_contact_verifications')
      .set({ invalidated_at: new Date() })
      .where('id', '=', verificationId)
      .where('consumed_at', 'is', null)
      .execute();
    throw new VerificationDeliveryError();
  }

  await db.insertInto('audit_logs')
    .values({
      actor_user_id: input.userId,
      action: 'account.contact_verification.requested',
      entity_type: 'user',
      entity_id: input.userId,
      ip_address: input.ipAddress ?? null,
      metadata: { channel: input.channel },
      created_at: now
    })
    .execute();

  return {
    outcome: 'sent',
    expiresAt,
    resendAfterSeconds: Math.ceil(resendCooldownMs / 1000)
  };
}

export async function confirmContactVerification(input: {
  userId: string;
  channel: VerificationChannel;
  code: string;
  pepper: string;
  ipAddress?: string;
  now?: Date;
}): Promise<VerificationConfirmResult> {
  const now = input.now ?? new Date();
  let normalizedCode: string;
  try {
    normalizedCode = normalizeVerificationCode(input.code);
  } catch {
    return { outcome: 'invalid_code', attemptsRemaining: maximumAttempts };
  }

  return db.transaction().execute(async (transaction) => {
    const user = await transaction.selectFrom('users')
      .select([
        'id',
        'status',
        'email',
        'phone_e164',
        'email_verified_at',
        'phone_verified_at'
      ])
      .where('id', '=', input.userId)
      .forUpdate()
      .executeTakeFirst();

    if (!user) {
      return { outcome: 'missing_contact' } as VerificationConfirmResult;
    }

    const destination = contactForChannel(user, input.channel);
    if (!destination) {
      return { outcome: 'missing_contact' } as VerificationConfirmResult;
    }

    const existingVerifiedAt = verifiedAtForChannel(user, input.channel);
    if (existingVerifiedAt) {
      return {
        outcome: 'already_verified',
        verifiedAt: existingVerifiedAt,
        status: user.status
      } as VerificationConfirmResult;
    }

    const verification = await transaction.selectFrom('account_contact_verifications')
      .select([
        'id',
        'contact_fingerprint',
        'code_hash',
        'attempt_count',
        'max_attempts',
        'expires_at'
      ])
      .where('user_id', '=', input.userId)
      .where('channel', '=', input.channel)
      .where('consumed_at', 'is', null)
      .where('invalidated_at', 'is', null)
      .orderBy('created_at', 'desc')
      .forUpdate()
      .executeTakeFirst();

    if (!verification) {
      return { outcome: 'not_found' } as VerificationConfirmResult;
    }

    const currentFingerprint = contactFingerprint(input.pepper, input.channel, destination);
    if (verification.contact_fingerprint !== currentFingerprint) {
      await transaction.updateTable('account_contact_verifications')
        .set({ invalidated_at: now })
        .where('id', '=', verification.id)
        .execute();
      return { outcome: 'contact_changed' } as VerificationConfirmResult;
    }

    if ((verification.expires_at as Date) <= now) {
      await transaction.updateTable('account_contact_verifications')
        .set({ invalidated_at: now })
        .where('id', '=', verification.id)
        .execute();
      return { outcome: 'expired' } as VerificationConfirmResult;
    }

    if (verification.attempt_count >= verification.max_attempts) {
      await transaction.updateTable('account_contact_verifications')
        .set({ invalidated_at: now })
        .where('id', '=', verification.id)
        .execute();
      return { outcome: 'attempts_exhausted' } as VerificationConfirmResult;
    }

    const actualHash = verificationCodeHash({
      pepper: input.pepper,
      verificationId: verification.id,
      userId: input.userId,
      channel: input.channel,
      code: normalizedCode
    });

    if (!verificationCodeMatches(verification.code_hash, actualHash)) {
      const nextAttemptCount = verification.attempt_count + 1;
      const exhausted = nextAttemptCount >= verification.max_attempts;
      await transaction.updateTable('account_contact_verifications')
        .set({
          attempt_count: nextAttemptCount,
          invalidated_at: exhausted ? now : null
        })
        .where('id', '=', verification.id)
        .execute();

      return exhausted
        ? { outcome: 'attempts_exhausted' }
        : {
            outcome: 'invalid_code',
            attemptsRemaining: verification.max_attempts - nextAttemptCount
          } as VerificationConfirmResult;
    }

    await transaction.updateTable('account_contact_verifications')
      .set({ consumed_at: now })
      .where('id', '=', verification.id)
      .execute();

    await transaction.updateTable('account_contact_verifications')
      .set({ invalidated_at: now })
      .where('user_id', '=', input.userId)
      .where('channel', '=', input.channel)
      .where('id', '!=', verification.id)
      .where('consumed_at', 'is', null)
      .where('invalidated_at', 'is', null)
      .execute();

    const nextStatus = user.status === 'pending' ? 'active' : user.status;
    const updatedUser = await transaction.updateTable('users')
      .set(input.channel === 'email'
        ? { email_verified_at: now, status: nextStatus, updated_at: now }
        : { phone_verified_at: now, status: nextStatus, updated_at: now })
      .where('id', '=', input.userId)
      .returning(['status', 'email_verified_at', 'phone_verified_at'])
      .executeTakeFirstOrThrow();

    await transaction.insertInto('audit_logs')
      .values({
        actor_user_id: input.userId,
        action: 'account.contact_verification.completed',
        entity_type: 'user',
        entity_id: input.userId,
        ip_address: input.ipAddress ?? null,
        metadata: { channel: input.channel },
        created_at: now
      })
      .execute();

    return {
      outcome: 'verified',
      verifiedAt: input.channel === 'email'
        ? updatedUser.email_verified_at
        : updatedUser.phone_verified_at,
      status: updatedUser.status
    } as VerificationConfirmResult;
  });
}
