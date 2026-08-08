import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireUser, type AuthenticatedRequest } from '../auth/require-user.js';
import { db } from '../db/index.js';
import { checkRateLimit, rateLimitResponse } from '../security/rate-limit.js';
import { writeSecurityAudit } from '../security/security-audit.js';

const listingParams = z.object({ listingId: z.string().uuid() });
const shippingOption = z.object({
  label: z.string().trim().min(2).max(80),
  carrier: z.string().trim().min(2).max(80).optional(),
  serviceCode: z.string().trim().min(1).max(80).optional(),
  amount: z.number().min(0).max(9999.99),
  etaMinDays: z.number().int().min(0).max(60).optional(),
  etaMaxDays: z.number().int().min(0).max(90).optional()
}).strict().superRefine((value, context) => {
  if ((value.etaMinDays === undefined) !== (value.etaMaxDays === undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Both ETA bounds are required together' });
  }
  if (value.etaMinDays !== undefined && value.etaMaxDays !== undefined && value.etaMaxDays < value.etaMinDays) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Maximum ETA must be at least minimum ETA' });
  }
});
const replaceBody = z.object({ options: z.array(shippingOption).max(8) }).strict();

function enforceLimit(request: FastifyRequest, reply: FastifyReply, sellerId: string): boolean {
  const result = checkRateLimit({
    group: 'listing.shipping_options.account',
    identifiers: [`account:${sellerId}`],
    limit: 60,
    windowMs: 60 * 60 * 1000
  });
  if (result.allowed) return true;
  reply.header('Retry-After', String(result.retryAfterSeconds));
  reply.code(429).send(rateLimitResponse(result));
  return false;
}

function responseOption(row: Record<string, any>) {
  return {
    id: row.id,
    label: row.label,
    carrier: row.carrier,
    serviceCode: row.service_code,
    amount: row.amount,
    currencyCode: row.currency_code,
    etaMinDays: row.eta_min_days,
    etaMaxDays: row.eta_max_days
  };
}

async function activeOptions(listingId: string) {
  return db.selectFrom('listing_shipping_options')
    .selectAll()
    .where('listing_id', '=', listingId)
    .where('is_active', '=', true)
    .orderBy('amount', 'asc')
    .orderBy('label', 'asc')
    .execute();
}

export async function listingShippingOptionRoutes(app: FastifyInstance): Promise<void> {
  app.get('/listings/:listingId/shipping-options', async (request, reply) => {
    const params = listingParams.parse(request.params);
    const listing = await db.selectFrom('listings')
      .select(['id', 'status', 'allow_delivery'])
      .where('id', '=', params.listingId)
      .executeTakeFirst();
    if (!listing || listing.status !== 'active' || !listing.allow_delivery) {
      return reply.code(404).send({ error: 'Shipping options are unavailable' });
    }
    const options = await activeOptions(listing.id);
    return reply.send({ listingId: listing.id, options: options.map(responseOption) });
  });

  app.get('/market/listings/:listingId/shipping-options', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const sellerId = authRequest.user.sub;
    const params = listingParams.parse(request.params);
    const listing = await db.selectFrom('listings')
      .select(['id', 'seller_id', 'status', 'allow_delivery', 'currency_code'])
      .where('id', '=', params.listingId)
      .executeTakeFirst();
    if (!listing || listing.seller_id !== sellerId) {
      return reply.code(404).send({ error: 'Listing not found' });
    }
    const options = await activeOptions(listing.id);
    return reply.send({
      listingId: listing.id,
      listingStatus: listing.status,
      allowDelivery: listing.allow_delivery,
      currencyCode: listing.currency_code,
      editable: ['draft', 'active'].includes(String(listing.status)),
      options: options.map(responseOption)
    });
  });

  app.post('/market/listings/:listingId/shipping-options', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const sellerId = authRequest.user.sub;
    const params = listingParams.parse(request.params);
    const body = replaceBody.parse(request.body);
    if (!enforceLimit(request, reply, sellerId)) return;

    const normalizedLabels = new Set(body.options.map((option) => option.label.trim().toLowerCase()));
    if (normalizedLabels.size !== body.options.length) {
      return reply.code(400).send({ error: 'Shipping option labels must be unique' });
    }

    const result = await db.transaction().execute(async (transaction) => {
      const listing = await transaction.selectFrom('listings')
        .select(['id', 'seller_id', 'status', 'allow_delivery', 'currency_code'])
        .where('id', '=', params.listingId)
        .executeTakeFirst();
      if (!listing || listing.seller_id !== sellerId) return { status: 404 as const };
      if (!['draft', 'active'].includes(String(listing.status))) return { status: 409 as const };
      if (!listing.allow_delivery && body.options.length > 0) return { status: 422 as const };

      const now = new Date();
      await transaction.updateTable('listing_shipping_options')
        .set({ is_active: false, updated_at: now })
        .where('listing_id', '=', listing.id)
        .execute();

      const rows = [];
      for (const option of body.options) {
        const row = await transaction.insertInto('listing_shipping_options')
          .values({
            listing_id: listing.id,
            label: option.label.trim(),
            carrier: option.carrier?.trim() ?? null,
            service_code: option.serviceCode?.trim() ?? null,
            amount: option.amount.toFixed(2),
            currency_code: String(listing.currency_code).toUpperCase(),
            eta_min_days: option.etaMinDays ?? null,
            eta_max_days: option.etaMaxDays ?? null,
            is_active: true,
            created_at: now,
            updated_at: now
          })
          .onConflict((conflict) => conflict.columns(['listing_id', 'label']).doUpdateSet({
            carrier: option.carrier?.trim() ?? null,
            service_code: option.serviceCode?.trim() ?? null,
            amount: option.amount.toFixed(2),
            currency_code: String(listing.currency_code).toUpperCase(),
            eta_min_days: option.etaMinDays ?? null,
            eta_max_days: option.etaMaxDays ?? null,
            is_active: true,
            updated_at: now
          }))
          .returningAll()
          .executeTakeFirstOrThrow();
        rows.push(row);
      }
      return { status: 200 as const, rows };
    });

    if (result.status === 404) return reply.code(404).send({ error: 'Listing not found' });
    if (result.status === 409) return reply.code(409).send({ error: 'Shipping options cannot change after listing reservation' });
    if (result.status === 422) return reply.code(422).send({ error: 'Delivery is disabled for this listing' });

    writeSecurityAudit(app.log, {
      action: 'listing.shipping_options.update',
      decision: 'allow',
      actorId: sellerId,
      targetId: params.listingId,
      ip: request.ip,
      reasonCodes: ['seller_owned_listing'],
      metadata: { optionCount: result.rows.length }
    });

    return reply.send({ listingId: params.listingId, options: result.rows.map(responseOption) });
  });
}
