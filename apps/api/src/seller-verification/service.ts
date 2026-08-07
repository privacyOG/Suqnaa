import type { SellerVerificationConfiguration } from '../config/seller-verification-config.js';
import { db } from '../db/index.js';
import type { SellerVerificationLevel, SellerVerificationProvider } from './provider.js';

export class SellerVerificationError extends Error {
  constructor(
    readonly statusCode: 400 | 404 | 409 | 503,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

interface SubjectSnapshot {
  countryCode: string;
  businessName?: string;
}

function normalizeCountryCode(value: string): string {
  const country = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) {
    throw new SellerVerificationError(400, 'invalid_country', 'Country code is invalid');
  }
  return country;
}

function snapshotMatches(
  level: SellerVerificationLevel,
  snapshot: Record<string, unknown> | null | undefined,
  profile: { is_business?: boolean | null; business_name?: string | null }
): boolean {
  if (level !== 'business') return true;
  if (!profile.is_business) return false;
  const currentName = profile.business_name?.trim() ?? '';
  return currentName.length > 0 && snapshot?.businessName === currentName;
}

function publicCheck(row: Record<string, any> | undefined) {
  if (!row) return null;
  return {
    id: String(row.id),
    level: String(row.level),
    status: String(row.status),
    providerResult: String(row.provider_result ?? 'pending'),
    countryCode: row.country_code ? String(row.country_code) : null,
    reasonCode: row.reason_code ? String(row.reason_code) : null,
    submittedAt: row.submitted_at ?? row.created_at,
    providerCompletedAt: row.provider_completed_at ?? null,
    reviewedAt: row.reviewed_at ?? null,
    verifiedAt: row.verified_at ?? null,
    expiresAt: row.expires_at ?? null,
    sessionExpiresAt: row.session_expires_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function expireStaleChecks(userId: string, now = new Date()): Promise<void> {
  await db.transaction().execute(async (transaction) => {
    const profile = await transaction.selectFrom('user_profiles')
      .select(['is_business', 'business_name'])
      .where('user_id', '=', userId)
      .executeTakeFirst();

    const rows = await transaction.selectFrom('verification_checks')
      .select([
        'id', 'level', 'status', 'provider_result', 'expires_at',
        'session_expires_at', 'subject_snapshot'
      ])
      .where('user_id', '=', userId)
      .where('level', 'in', ['seller', 'business'])
      .where('status', 'in', ['pending', 'verified'])
      .forUpdate()
      .execute();

    for (const row of rows) {
      const level = row.level as SellerVerificationLevel;
      let reason: string | null = null;
      if (
        row.status === 'pending' &&
        row.provider_result === 'pending' &&
        row.session_expires_at &&
        new Date(row.session_expires_at).getTime() <= now.getTime()
      ) {
        reason = 'provider_session_expired';
      } else if (
        row.status === 'verified' &&
        row.expires_at &&
        new Date(row.expires_at).getTime() <= now.getTime()
      ) {
        reason = 'verification_expired';
      } else if (
        row.status === 'verified' &&
        !snapshotMatches(level, row.subject_snapshot as Record<string, unknown>, profile ?? {})
      ) {
        reason = 'verified_subject_changed';
      }

      if (!reason) continue;
      await transaction.updateTable('verification_checks')
        .set({
          status: 'expired',
          provider_result: row.status === 'pending' ? 'expired' : row.provider_result,
          reason_code: reason,
          updated_at: now
        })
        .where('id', '=', row.id)
        .where('status', '=', row.status)
        .execute();
      await transaction.insertInto('audit_logs').values({
        actor_user_id: userId,
        action: 'seller_verification.expired',
        entity_type: 'verification_check',
        entity_id: row.id,
        metadata: { reason, level },
        created_at: now
      }).execute();
    }
  });
}

export async function readSellerVerificationStatus(
  userId: string,
  configuration: SellerVerificationConfiguration
) {
  await expireStaleChecks(userId);
  const user = await db.selectFrom('users')
    .select(['id', 'status'])
    .where('id', '=', userId)
    .executeTakeFirst();
  if (!user) return null;

  const profile = await db.selectFrom('user_profiles')
    .select(['is_business', 'business_name', 'country_code'])
    .where('user_id', '=', userId)
    .executeTakeFirst();
  const eligibleLevel: SellerVerificationLevel = profile?.is_business ? 'business' : 'seller';
  const history = await db.selectFrom('verification_checks')
    .select([
      'id', 'level', 'status', 'provider_result', 'country_code', 'reason_code',
      'submitted_at', 'provider_completed_at', 'reviewed_at', 'verified_at',
      'expires_at', 'session_expires_at', 'created_at', 'updated_at'
    ])
    .where('user_id', '=', userId)
    .where('level', 'in', ['seller', 'business'])
    .orderBy('created_at', 'desc')
    .limit(10)
    .execute();
  const current = history.find((row) => row.level === eligibleLevel);

  return {
    providerEnabled: configuration.enabled,
    eligibleLevel,
    profile: {
      isBusiness: Boolean(profile?.is_business),
      businessName: profile?.business_name ?? null,
      countryCode: profile?.country_code ?? null
    },
    current: publicCheck(current),
    history: history.map(publicCheck)
  };
}

async function prepareSession(input: {
  userId: string;
  level: SellerVerificationLevel;
  countryCode: string;
  configuration: SellerVerificationConfiguration;
}) {
  if (!input.configuration.enabled) {
    throw new SellerVerificationError(503, 'provider_unavailable', 'Seller verification is unavailable');
  }
  const countryCode = normalizeCountryCode(input.countryCode);
  const now = new Date();

  return db.transaction().execute(async (transaction) => {
    const user = await transaction.selectFrom('users')
      .select(['id', 'status'])
      .where('id', '=', input.userId)
      .forUpdate()
      .executeTakeFirst();
    if (!user || user.status !== 'active') {
      throw new SellerVerificationError(409, 'account_ineligible', 'Account is not eligible for seller verification');
    }

    const profile = await transaction.selectFrom('user_profiles')
      .select(['is_business', 'business_name'])
      .where('user_id', '=', input.userId)
      .executeTakeFirst();
    const eligibleLevel: SellerVerificationLevel = profile?.is_business ? 'business' : 'seller';
    if (input.level !== eligibleLevel) {
      throw new SellerVerificationError(409, 'level_mismatch', 'Verification level does not match the current profile');
    }
    if (input.level === 'business' && !profile?.business_name?.trim()) {
      throw new SellerVerificationError(409, 'business_profile_incomplete', 'Business name is required before verification');
    }

    const current = await transaction.selectFrom('verification_checks')
      .select([
        'id', 'status', 'provider_result', 'provider', 'reference', 'level',
        'country_code', 'session_expires_at', 'expires_at', 'subject_snapshot'
      ])
      .where('user_id', '=', input.userId)
      .where('level', '=', input.level)
      .orderBy('created_at', 'desc')
      .limit(1)
      .executeTakeFirst();

    if (current?.status === 'verified' && current.expires_at && new Date(current.expires_at).getTime() > now.getTime() && snapshotMatches(input.level, current.subject_snapshot, profile ?? {})) {
      throw new SellerVerificationError(409, 'already_verified', 'Seller verification is already current');
    }

    if (current?.status === 'pending') {
      if (current.provider_result !== 'pending') {
        throw new SellerVerificationError(409, 'awaiting_review', 'Verification is awaiting operations review');
      }
      if (current.session_expires_at && new Date(current.session_expires_at).getTime() <= now.getTime()) {
        await transaction.updateTable('verification_checks')
          .set({ status: 'expired', provider_result: 'expired', reason_code: 'provider_session_expired', updated_at: now })
          .where('id', '=', current.id)
          .execute();
      } else if (current.reference && current.provider === input.configuration.provider) {
        return {
          action: 'resume' as const,
          checkId: String(current.id),
          reference: String(current.reference),
          level: input.level,
          countryCode: String(current.country_code ?? countryCode),
          businessName: profile?.business_name ?? null
        };
      } else {
        throw new SellerVerificationError(409, 'verification_in_progress', 'Seller verification is already in progress');
      }
    }

    const snapshot: SubjectSnapshot = {
      countryCode,
      ...(input.level === 'business' ? { businessName: profile?.business_name?.trim() } : {})
    };
    const inserted = await transaction.insertInto('verification_checks')
      .values({
        user_id: input.userId,
        status: 'pending',
        level: input.level,
        provider: input.configuration.provider,
        reference: null,
        country_code: countryCode,
        provider_result: 'pending',
        reason_code: null,
        reviewed_by: null,
        review_note: null,
        submitted_at: now,
        provider_completed_at: null,
        verified_at: null,
        session_expires_at: null,
        expires_at: null,
        subject_snapshot: snapshot,
        created_at: now,
        updated_at: now
      })
      .returning(['id'])
      .executeTakeFirstOrThrow();
    await transaction.insertInto('audit_logs').values({
      actor_user_id: input.userId,
      action: 'seller_verification.submitted',
      entity_type: 'verification_check',
      entity_id: inserted.id,
      metadata: { level: input.level, countryCode },
      created_at: now
    }).execute();

    return {
      action: 'create' as const,
      checkId: String(inserted.id),
      reference: null,
      level: input.level,
      countryCode,
      businessName: profile?.business_name ?? null
    };
  });
}

export async function startSellerVerification(input: {
  userId: string;
  level: SellerVerificationLevel;
  countryCode: string;
  configuration: SellerVerificationConfiguration;
  provider: SellerVerificationProvider | null;
}) {
  if (!input.provider) {
    throw new SellerVerificationError(503, 'provider_unavailable', 'Seller verification is unavailable');
  }
  const prepared = await prepareSession(input);
  let providerSession;
  try {
    providerSession = await input.provider.createSession({
      action: prepared.action,
      checkId: prepared.checkId,
      accountId: input.userId,
      level: prepared.level,
      countryCode: prepared.countryCode,
      businessName: prepared.businessName,
      reference: prepared.reference
    });
    if (prepared.action === 'resume' && providerSession.reference !== prepared.reference) {
      throw new Error('Verification provider changed the session reference');
    }
  } catch {
    if (prepared.action === 'create') {
      const now = new Date();
      await db.transaction().execute(async (transaction) => {
        await transaction.updateTable('verification_checks')
          .set({
            status: 'expired',
            provider_result: 'failed',
            reason_code: 'provider_session_failed',
            updated_at: now
          })
          .where('id', '=', prepared.checkId)
          .where('status', '=', 'pending')
          .execute();
        await transaction.insertInto('audit_logs').values({
          actor_user_id: input.userId,
          action: 'seller_verification.session_failed',
          entity_type: 'verification_check',
          entity_id: prepared.checkId,
          metadata: { level: prepared.level },
          created_at: now
        }).execute();
      });
    }
    throw new SellerVerificationError(503, 'provider_unavailable', 'Seller verification provider is unavailable');
  }

  const now = new Date();
  await db.transaction().execute(async (transaction) => {
    await transaction.updateTable('verification_checks')
      .set({
        provider: input.configuration.provider,
        reference: providerSession.reference,
        session_expires_at: providerSession.expiresAt,
        reason_code: null,
        updated_at: now
      })
      .where('id', '=', prepared.checkId)
      .where('user_id', '=', input.userId)
      .where('status', '=', 'pending')
      .execute();
    await transaction.insertInto('audit_logs').values({
      actor_user_id: input.userId,
      action: prepared.action === 'create' ? 'seller_verification.session_created' : 'seller_verification.session_resumed',
      entity_type: 'verification_check',
      entity_id: prepared.checkId,
      metadata: { provider: input.configuration.provider, level: prepared.level },
      created_at: now
    }).execute();
  });

  return {
    checkId: prepared.checkId,
    action: prepared.action,
    hostedUrl: providerSession.hostedUrl,
    sessionExpiresAt: providerSession.expiresAt
  };
}

export async function reviewSellerVerification(input: {
  checkId: string;
  reviewerId: string;
  decision: 'approve' | 'reject';
  reasonCode?: string | null;
  note?: string | null;
  validityDays: number;
  ipAddress?: string;
}) {
  const now = new Date();
  return db.transaction().execute(async (transaction) => {
    const check = await transaction.selectFrom('verification_checks')
      .select(['id', 'user_id', 'status', 'provider_result', 'level'])
      .where('id', '=', input.checkId)
      .forUpdate()
      .executeTakeFirst();
    if (!check || !['seller', 'business'].includes(String(check.level))) {
      throw new SellerVerificationError(404, 'not_found', 'Seller verification not found');
    }
    if (check.status !== 'pending' || check.provider_result === 'pending') {
      throw new SellerVerificationError(409, 'not_reviewable', 'Seller verification is not ready for review');
    }
    if (input.decision === 'approve' && !['passed', 'review_required'].includes(String(check.provider_result))) {
      throw new SellerVerificationError(409, 'provider_result_blocks_approval', 'Provider result does not allow approval');
    }
    if (input.decision === 'approve' && check.provider_result === 'review_required' && !input.note?.trim()) {
      throw new SellerVerificationError(400, 'review_note_required', 'A review note is required for manual approval');
    }
    if (input.decision === 'reject' && !input.reasonCode?.trim()) {
      throw new SellerVerificationError(400, 'reason_required', 'A rejection reason is required');
    }

    const expiresAt = input.decision === 'approve'
      ? new Date(now.getTime() + input.validityDays * 24 * 60 * 60 * 1000)
      : null;
    const updated = await transaction.updateTable('verification_checks')
      .set({
        status: input.decision === 'approve' ? 'verified' : 'rejected',
        reason_code: input.decision === 'approve' ? null : input.reasonCode!.trim(),
        review_note: input.note?.trim() || null,
        reviewed_by: input.reviewerId,
        reviewed_at: now,
        verified_at: input.decision === 'approve' ? now : null,
        expires_at: expiresAt,
        updated_at: now
      })
      .where('id', '=', input.checkId)
      .where('status', '=', 'pending')
      .returning(['id', 'user_id', 'status', 'reviewed_at', 'verified_at', 'expires_at'])
      .executeTakeFirst();
    if (!updated) {
      throw new SellerVerificationError(409, 'concurrent_review', 'Seller verification was reviewed concurrently');
    }

    await transaction.insertInto('audit_logs').values({
      actor_user_id: input.reviewerId,
      action: input.decision === 'approve' ? 'seller_verification.approved' : 'seller_verification.rejected',
      entity_type: 'verification_check',
      entity_id: updated.id,
      ip_address: input.ipAddress ?? null,
      metadata: {
        subjectUserId: updated.user_id,
        level: check.level,
        providerResult: check.provider_result,
        reasonCode: input.decision === 'reject' ? input.reasonCode : null,
        noteProvided: Boolean(input.note?.trim())
      },
      created_at: now
    }).execute();

    return {
      id: String(updated.id),
      userId: String(updated.user_id),
      status: String(updated.status),
      reviewedAt: updated.reviewed_at,
      verifiedAt: updated.verified_at ?? null,
      expiresAt: updated.expires_at ?? null
    };
  });
}
