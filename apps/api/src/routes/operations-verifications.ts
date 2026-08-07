import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireOperationsUser, type OperationsRequest } from '../auth/require-operations-user.js';
import { env } from '../config/env.js';
import { resolveSellerVerificationConfiguration } from '../config/seller-verification-config.js';
import { db } from '../db/index.js';
import { checkRateLimit, rateLimitResponse } from '../security/rate-limit.js';
import { reviewSellerVerification, SellerVerificationError } from '../seller-verification/service.js';

const configuration = resolveSellerVerificationConfiguration({
  provider: env.SELLER_VERIFICATION_PROVIDER,
  endpoint: env.SELLER_VERIFICATION_URL,
  token: env.SELLER_VERIFICATION_TOKEN,
  signingSecret: env.SELLER_VERIFICATION_SIGNING_SECRET,
  timeoutMs: env.SELLER_VERIFICATION_TIMEOUT_MS,
  eventMaxAgeSeconds: env.SELLER_VERIFICATION_EVENT_MAX_AGE_SECONDS,
  verifiedValidityDays: env.SELLER_VERIFICATION_VALID_DAYS,
  nodeEnv: env.NODE_ENV
});

const queueQuery = z.object({
  status: z.enum(['pending', 'verified', 'rejected', 'expired', 'all']).default('pending'),
  providerResult: z.enum(['pending', 'passed', 'failed', 'review_required', 'expired']).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25),
  before: z.string().datetime().optional()
});

const itemParams = z.object({ id: z.string().uuid() });
const reviewBody = z.object({
  decision: z.enum(['approve', 'reject']),
  reasonCode: z.string().trim().regex(/^[a-z0-9][a-z0-9_.-]{0,119}$/).optional(),
  note: z.string().trim().max(2000).optional()
}).strict();

function enforceOperationsLimit(
  request: FastifyRequest,
  reply: FastifyReply,
  accountId: string,
  group: string,
  limit: number
): boolean {
  const account = checkRateLimit({
    group: `${group}.account`,
    identifiers: [`account:${accountId}`],
    limit,
    windowMs: 60 * 60 * 1000
  });
  const ip = checkRateLimit({
    group: `${group}.ip`,
    identifiers: [`ip:${request.ip}`],
    limit: limit * 3,
    windowMs: 60 * 60 * 1000
  });
  const limited = !account.allowed ? account : !ip.allowed ? ip : undefined;
  if (!limited) return true;
  reply.header('Retry-After', String(limited.retryAfterSeconds));
  reply.code(429).send(rateLimitResponse(limited));
  return false;
}

export async function operationsVerificationRoutes(app: FastifyInstance): Promise<void> {
  app.get('/operations/verifications', { preHandler: requireOperationsUser }, async (request, reply) => {
    const authRequest = request as OperationsRequest;
    if (!enforceOperationsLimit(request, reply, authRequest.operationsUserId, 'operations.verifications.read', 120)) return;
    const query = queueQuery.parse(request.query);
    let selection = db.selectFrom('verification_checks')
      .innerJoin('users', 'users.id', 'verification_checks.user_id')
      .leftJoin('user_profiles', 'user_profiles.user_id', 'users.id')
      .select([
        'verification_checks.id as id',
        'verification_checks.user_id as user_id',
        'verification_checks.status as status',
        'verification_checks.level as level',
        'verification_checks.provider as provider',
        'verification_checks.provider_result as provider_result',
        'verification_checks.country_code as country_code',
        'verification_checks.reason_code as reason_code',
        'verification_checks.review_note as review_note',
        'verification_checks.submitted_at as submitted_at',
        'verification_checks.provider_completed_at as provider_completed_at',
        'verification_checks.reviewed_at as reviewed_at',
        'verification_checks.verified_at as verified_at',
        'verification_checks.expires_at as expires_at',
        'verification_checks.subject_snapshot as subject_snapshot',
        'verification_checks.created_at as created_at',
        'verification_checks.updated_at as updated_at',
        'users.display_name as display_name',
        'users.status as user_status',
        'users.email as email',
        'users.phone_e164 as phone_e164',
        'user_profiles.is_business as is_business',
        'user_profiles.business_name as business_name'
      ])
      .where('verification_checks.level', 'in', ['seller', 'business']);

    if (query.status !== 'all') selection = selection.where('verification_checks.status', '=', query.status);
    if (query.providerResult) selection = selection.where('verification_checks.provider_result', '=', query.providerResult);
    if (query.before) selection = selection.where('verification_checks.created_at', '<', new Date(query.before));

    const rows = await selection
      .orderBy('verification_checks.created_at', 'desc')
      .limit(query.limit + 1)
      .execute();
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);

    return reply.send({
      items: page.map((row) => ({
        id: row.id,
        userId: row.user_id,
        displayName: row.display_name,
        accountStatus: row.user_status,
        contact: { email: row.email ?? null, phoneE164: row.phone_e164 ?? null },
        profile: { isBusiness: Boolean(row.is_business), businessName: row.business_name ?? null },
        level: row.level,
        status: row.status,
        provider: row.provider,
        providerResult: row.provider_result,
        countryCode: row.country_code,
        reasonCode: row.reason_code,
        reviewNote: row.review_note,
        subjectSnapshot: row.subject_snapshot,
        submittedAt: row.submitted_at ?? row.created_at,
        providerCompletedAt: row.provider_completed_at,
        reviewedAt: row.reviewed_at,
        verifiedAt: row.verified_at,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      })),
      pagination: {
        hasMore: rows.length > query.limit,
        nextCursor: rows.length > query.limit && last ? new Date(last.created_at).toISOString() : null
      }
    });
  });

  app.post('/operations/verifications/:id/review', { preHandler: requireOperationsUser }, async (request, reply) => {
    const authRequest = request as OperationsRequest;
    if (!enforceOperationsLimit(request, reply, authRequest.operationsUserId, 'operations.verifications.review', 60)) return;
    const params = itemParams.parse(request.params);
    const body = reviewBody.parse(request.body);
    try {
      const reviewed = await reviewSellerVerification({
        checkId: params.id,
        reviewerId: authRequest.operationsUserId,
        decision: body.decision,
        reasonCode: body.reasonCode,
        note: body.note,
        validityDays: configuration.verifiedValidityDays,
        ipAddress: request.ip
      });
      return reply.send({ verification: reviewed });
    } catch (error) {
      if (error instanceof SellerVerificationError) {
        return reply.code(error.statusCode).send({ error: error.message, code: error.code });
      }
      throw error;
    }
  });
}
