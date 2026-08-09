import type { FastifyReply, FastifyRequest } from 'fastify';
import { requireOperationsUser } from '../auth/require-operations-user.js';
import { db } from '../db/index.js';
import { evaluateListingModerationPolicy } from './moderation-policy-service.js';

const uuid = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const moderationListingActionPath = new RegExp(`^/v1/operations/moderation/listings/(${uuid})/action(?:\\?.*)?$`);

export async function enforceModeratorListingApprovalPolicy(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (request.method !== 'POST') return;
  const match = moderationListingActionPath.exec(request.url);
  if (!match) return;
  const body = request.body as { action?: unknown } | undefined;
  if (body?.action !== 'approve') return;

  await requireOperationsUser(request, reply);
  if (reply.sent) return;

  const listing = await db.selectFrom('listings')
    .select(['id', 'category_id', 'title', 'description'])
    .where('id', '=', match[1])
    .executeTakeFirst();
  if (!listing) return;

  const policy = await evaluateListingModerationPolicy({
    categoryId: listing.category_id ? String(listing.category_id) : null,
    title: String(listing.title),
    description: String(listing.description)
  });
  if (policy.decision !== 'block') return;

  reply.code(409).send({
    error: 'Listing cannot be approved while a hard moderation policy block is active',
    code: 'listing_policy_blocked'
  });
}
