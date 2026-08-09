import type { FastifyReply, FastifyRequest } from 'fastify';
import { requireUser, type AuthenticatedRequest } from '../auth/require-user.js';
import { db } from '../db/index.js';
import {
  createPolicyListingReview,
  evaluateListingModerationPolicy
} from './moderation-policy-service.js';

const sellerStatusPath = /^\/v1\/listings\/([0-9a-fA-F-]{36})\/status(?:\?.*)?$/;

export async function enforceSellerListingPublicationPolicy(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (request.method !== 'POST') return;
  const match = sellerStatusPath.exec(request.url);
  if (!match) return;

  const body = request.body as { status?: unknown } | undefined;
  if (body?.status !== 'active') return;

  await requireUser(request, reply);
  if (reply.sent) return;

  const auth = request as AuthenticatedRequest;
  const listingId = match[1];
  const listing = await db.selectFrom('listings')
    .select(['id', 'seller_id', 'category_id', 'title', 'description', 'status'])
    .where('id', '=', listingId)
    .executeTakeFirst();

  // Preserve the seller route's non-disclosure behaviour for unknown or foreign listings.
  if (!listing || listing.seller_id !== auth.user.sub) return;
  if (listing.status === 'active') return;

  const policy = await evaluateListingModerationPolicy({
    categoryId: listing.category_id ? String(listing.category_id) : null,
    title: String(listing.title),
    description: String(listing.description)
  });

  if (policy.decision === 'allow') return;

  if (policy.decision === 'block') {
    reply.code(409).send({
      error: 'Listing publication is blocked by marketplace policy',
      code: 'listing_policy_blocked',
      reasonCodes: [...new Set(policy.matches.map((item) => item.reasonCode))]
    });
    return;
  }

  const review = await createPolicyListingReview({
    listingId: String(listing.id),
    matches: policy.matches
  });
  reply.code(202).send({
    listing: {
      id: listing.id,
      status: listing.status,
      unchanged: true
    },
    moderation: {
      status: 'manual_review',
      actionId: review.actionId,
      duplicate: review.duplicate,
      reasonCodes: [...new Set(policy.matches.map((item) => item.reasonCode))]
    }
  });
}
