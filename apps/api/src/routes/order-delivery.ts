import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireUser, type AuthenticatedRequest } from '../auth/require-user.js';
import { db } from '../db/index.js';
import { checkRateLimit, rateLimitResponse } from '../security/rate-limit.js';
import { writeSecurityAudit } from '../security/security-audit.js';

const orderParams = z.object({ orderId: z.string().uuid() });
const auAddress = z.object({
  line1: z.string().trim().min(3).max(160),
  line2: z.string().trim().min(1).max(160).optional(),
  locality: z.string().trim().min(2).max(100),
  region: z.string().trim().min(2).max(80),
  postalCode: z.string().trim().regex(/^\d{4}$/),
  countryCode: z.literal('AU')
}).strict();
const deliveryBody = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('shipping'),
    shippingOptionId: z.string().uuid(),
    recipientName: z.string().trim().min(2).max(120),
    address: auAddress
  }).strict(),
  z.object({ mode: z.literal('pickup') }).strict()
]);
const pickupDetailsBody = z.object({
  address: auAddress,
  instructions: z.string().trim().max(1000).optional()
}).strict();
const pickupProofBody = z.object({ code: z.string().trim().min(8).max(32) }).strict();
const deliveryEvidenceBody = z.object({
  note: z.string().trim().min(3).max(2000),
  evidenceUrl: z.string().trim().url().max(1000).optional()
}).strict();

class OrderDeliveryError extends Error {
  constructor(
    readonly statusCode: 400 | 403 | 404 | 409 | 422,
    readonly code: string
  ) {
    super(code);
  }
}

function enforceLimit(
  request: FastifyRequest,
  reply: FastifyReply,
  accountId: string,
  group: string,
  limit: number
): boolean {
  const result = checkRateLimit({
    group,
    identifiers: [`account:${accountId}`, `ip:${request.ip}`],
    limit,
    windowMs: 60 * 60 * 1000
  });
  if (result.allowed) return true;
  reply.header('Retry-After', String(result.retryAfterSeconds));
  reply.code(429).send(rateLimitResponse(result));
  return false;
}

function safeHttpsUrl(value: string | undefined): string | null {
  if (!value) return null;
  const parsed = new URL(value);
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    !parsed.hostname
  ) {
    throw new OrderDeliveryError(400, 'delivery_evidence_url_invalid');
  }
  return parsed.toString();
}

function pickupCode(): string {
  const raw = randomBytes(8).toString('hex').toUpperCase();
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
}

function pickupHash(code: string): Buffer {
  return createHash('sha256')
    .update(code.replaceAll('-', '').trim().toUpperCase())
    .digest();
}

function storedHash(value: string): Buffer {
  return Buffer.from(value, 'hex');
}

async function appendTimeline(executor: any, input: {
  orderId: string;
  actorId?: string | null;
  eventType: string;
  eventKey?: string;
  details?: Record<string, unknown>;
  occurredAt?: Date;
}) {
  await executor.insertInto('order_timeline_events').values({
    order_id: input.orderId,
    actor_id: input.actorId ?? null,
    event_key: input.eventKey ?? `${input.eventType}:${randomUUID()}`,
    event_type: input.eventType,
    details: JSON.stringify(input.details ?? {}),
    occurred_at: input.occurredAt ?? new Date(),
    created_at: new Date()
  }).onConflict((conflict: any) =>
    conflict.columns(['order_id', 'event_key']).doNothing()
  ).execute();
}

async function participantOrder(executor: any, orderId: string, accountId: string) {
  const order = await executor.selectFrom('transactions')
    .select([
      'id',
      'listing_id',
      'buyer_id',
      'seller_id',
      'status',
      'amount',
      'item_amount',
      'shipping_amount',
      'currency_code'
    ])
    .where('id', '=', orderId)
    .executeTakeFirst();

  if (!order || (order.buyer_id !== accountId && order.seller_id !== accountId)) {
    throw new OrderDeliveryError(404, 'order_not_found');
  }

  return {
    order,
    role: order.buyer_id === accountId ? 'buyer' as const : 'seller' as const
  };
}

function addressResponse(
  prefix: '' | 'pickup_',
  row: Record<string, any> | undefined | null
) {
  if (!row) return null;
  const line1 = row[`${prefix}address_line1`];
  const locality = row[`${prefix}locality`];
  const region = row[`${prefix}region`];
  const postalCode = row[`${prefix}postal_code`];
  const countryCode = row[`${prefix}country_code`];
  if (!line1 || !locality || !region || !postalCode || !countryCode) return null;
  return {
    line1,
    line2: row[`${prefix}address_line2`] ?? null,
    locality,
    region,
    postalCode,
    countryCode
  };
}

async function fulfilmentForOrder(executor: any, orderId: string) {
  return executor.selectFrom('fulfilments')
    .innerJoin('payment_intents', 'payment_intents.id', 'fulfilments.payment_intent_id')
    .selectAll('fulfilments')
    .where('payment_intents.transaction_id', '=', orderId)
    .executeTakeFirst();
}

export async function orderDeliveryRoutes(app: FastifyInstance): Promise<void> {
  app.get('/market/orders/:orderId/delivery', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const params = orderParams.parse(request.params);
    try {
      const { order, role } = await participantOrder(db, params.orderId, authRequest.user.sub);
      const fulfilment = await fulfilmentForOrder(db, order.id);
      const details = await db.selectFrom('order_fulfilment_details')
        .selectAll()
        .where('order_id', '=', order.id)
        .executeTakeFirst();
      const proof = await db.selectFrom('pickup_proofs')
        .select(['id', 'expires_at', 'verified_at', 'revoked_at'])
        .where('order_id', '=', order.id)
        .orderBy('issued_at', 'desc')
        .executeTakeFirst();
      const evidence = await db.selectFrom('order_fulfilment_evidence')
        .select([
          'id',
          'actor_id',
          'evidence_type',
          'reference',
          'evidence_url',
          'note',
          'occurred_at'
        ])
        .where('order_id', '=', order.id)
        .orderBy('occurred_at', 'asc')
        .orderBy('id', 'asc')
        .execute();

      const paymentPassed = order.status !== 'pending';
      const maySeeShippingAddress = role === 'buyer' || paymentPassed;
      const maySeePickupAddress = role === 'seller' || paymentPassed;

      return reply.send({
        orderId: order.id,
        role,
        pricing: {
          itemAmount: order.item_amount,
          shippingAmount: order.shipping_amount,
          totalAmount: order.amount,
          currencyCode: order.currency_code
        },
        delivery: details ? {
          mode: details.mode,
          shippingOptionId: details.shipping_option_id,
          shippingMethodLabel: details.shipping_method_label,
          shippingCarrier: details.shipping_carrier,
          shippingServiceCode: details.shipping_service_code,
          shippingAmount: details.shipping_amount,
          recipientName: maySeeShippingAddress ? details.recipient_name : null,
          shippingAddress: maySeeShippingAddress ? addressResponse('', details) : null,
          pickupAddress: maySeePickupAddress ? addressResponse('pickup_', details) : null,
          pickupInstructions: maySeePickupAddress ? details.pickup_instructions : null,
          updatedAt: details.updated_at
        } : null,
        fulfilment: fulfilment ? {
          status: fulfilment.status,
          carrier: fulfilment.carrier,
          trackingReference: fulfilment.tracking_reference,
          trackingUrl: fulfilment.tracking_url,
          shippedAt: fulfilment.shipped_at,
          deliveredAt: fulfilment.delivered_at,
          buyerConfirmedAt: fulfilment.buyer_confirmed_at
        } : null,
        pickupProof: proof ? {
          active:
            proof.verified_at === null &&
            proof.revoked_at === null &&
            new Date(proof.expires_at) > new Date(),
          expiresAt: proof.expires_at,
          verifiedAt: proof.verified_at
        } : null,
        evidence: evidence.map((row) => ({
          id: row.id,
          actorId: row.actor_id,
          type: row.evidence_type,
          reference: row.reference,
          url: row.evidence_url,
          note: row.note,
          occurredAt: row.occurred_at
        }))
      });
    } catch (error) {
      if (error instanceof OrderDeliveryError) {
        return reply.code(error.statusCode).send({ error: error.code });
      }
      throw error;
    }
  });

  app.post('/market/orders/:orderId/delivery', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const accountId = authRequest.user.sub;
    const params = orderParams.parse(request.params);
    const body = deliveryBody.parse(request.body);
    if (!enforceLimit(request, reply, accountId, 'order.delivery.configure', 30)) return;

    try {
      const result = await db.transaction().execute(async (transaction) => {
        const { order, role } = await participantOrder(transaction, params.orderId, accountId);
        if (role !== 'buyer') throw new OrderDeliveryError(403, 'buyer_required');
        if (order.status !== 'pending') {
          throw new OrderDeliveryError(409, 'delivery_locked_after_payment');
        }

        const intent = await transaction.selectFrom('payment_intents')
          .select(['id', 'status'])
          .where('transaction_id', '=', order.id)
          .executeTakeFirst();
        if (!intent || intent.status !== 'created') {
          throw new OrderDeliveryError(409, 'payment_collection_already_started');
        }
        const session = await transaction.selectFrom('payment_collection_sessions')
          .select(['id'])
          .where('payment_intent_id', '=', intent.id)
          .executeTakeFirst();
        if (session) {
          throw new OrderDeliveryError(409, 'payment_collection_already_started');
        }

        const listing = await transaction.selectFrom('listings')
          .select(['id', 'allow_pickup', 'allow_delivery', 'currency_code'])
          .where('id', '=', order.listing_id)
          .executeTakeFirst();
        if (!listing) throw new OrderDeliveryError(404, 'listing_not_found');

        const fulfilment = await fulfilmentForOrder(transaction, order.id);
        if (!fulfilment) {
          throw new OrderDeliveryError(409, 'fulfilment_context_unavailable');
        }

        const existing = await transaction.selectFrom('order_fulfilment_details')
          .selectAll()
          .where('order_id', '=', order.id)
          .executeTakeFirst();
        const now = new Date();
        let values: Record<string, any>;
        let shippingAmount = 0;
        let eventType: 'delivery_selected' | 'pickup_selected';
        let eventDetails: Record<string, unknown>;

        if (body.mode === 'shipping') {
          if (!listing.allow_delivery) {
            throw new OrderDeliveryError(422, 'delivery_not_allowed');
          }
          const option = await transaction.selectFrom('listing_shipping_options')
            .selectAll()
            .where('id', '=', body.shippingOptionId)
            .where('listing_id', '=', listing.id)
            .where('is_active', '=', true)
            .executeTakeFirst();
          if (!option) {
            throw new OrderDeliveryError(422, 'shipping_option_unavailable');
          }
          if (
            String(option.currency_code).toUpperCase() !==
            String(order.currency_code).toUpperCase()
          ) {
            throw new OrderDeliveryError(409, 'shipping_currency_mismatch');
          }
          shippingAmount = Number(option.amount);
          values = {
            order_id: order.id,
            fulfilment_id: fulfilment.id,
            mode: 'shipping',
            shipping_option_id: option.id,
            shipping_method_label: option.label,
            shipping_carrier: option.carrier,
            shipping_service_code: option.service_code,
            shipping_amount: shippingAmount.toFixed(2),
            currency_code: order.currency_code,
            recipient_name: body.recipientName,
            address_line1: body.address.line1,
            address_line2: body.address.line2 ?? null,
            locality: body.address.locality,
            region: body.address.region,
            postal_code: body.address.postalCode,
            country_code: body.address.countryCode,
            pickup_address_line1: null,
            pickup_address_line2: null,
            pickup_locality: null,
            pickup_region: null,
            pickup_postal_code: null,
            pickup_country_code: null,
            pickup_instructions: null,
            updated_by: accountId,
            updated_at: now
          };
          eventType = 'delivery_selected';
          eventDetails = {
            mode: 'shipping',
            shippingMethodLabel: option.label,
            shippingAmount: option.amount
          };
        } else {
          if (!listing.allow_pickup) {
            throw new OrderDeliveryError(422, 'pickup_not_allowed');
          }
          values = {
            order_id: order.id,
            fulfilment_id: fulfilment.id,
            mode: 'pickup',
            shipping_option_id: null,
            shipping_method_label: null,
            shipping_carrier: null,
            shipping_service_code: null,
            shipping_amount: '0.00',
            currency_code: order.currency_code,
            recipient_name: null,
            address_line1: null,
            address_line2: null,
            locality: null,
            region: null,
            postal_code: null,
            country_code: null,
            pickup_address_line1: null,
            pickup_address_line2: null,
            pickup_locality: null,
            pickup_region: null,
            pickup_postal_code: null,
            pickup_country_code: null,
            pickup_instructions: null,
            updated_by: accountId,
            updated_at: now
          };
          eventType = 'pickup_selected';
          eventDetails = { mode: 'pickup' };
        }

        const existingComparable = existing ? JSON.stringify({
          mode: existing.mode,
          shipping_option_id: existing.shipping_option_id,
          shipping_amount: String(existing.shipping_amount),
          recipient_name: existing.recipient_name,
          address_line1: existing.address_line1,
          address_line2: existing.address_line2,
          locality: existing.locality,
          region: existing.region,
          postal_code: existing.postal_code,
          country_code: existing.country_code
        }) : null;
        const nextComparable = JSON.stringify({
          mode: values.mode,
          shipping_option_id: values.shipping_option_id,
          shipping_amount: String(values.shipping_amount),
          recipient_name: values.recipient_name,
          address_line1: values.address_line1,
          address_line2: values.address_line2,
          locality: values.locality,
          region: values.region,
          postal_code: values.postal_code,
          country_code: values.country_code
        });

        if (existingComparable === nextComparable) {
          return {
            unchanged: true,
            totalAmount: order.amount,
            shippingAmount: order.shipping_amount,
            mode: existing!.mode
          };
        }

        const totalAmount = Number(order.item_amount) + shippingAmount;
        await transaction.updateTable('transactions').set({
          shipping_amount: shippingAmount.toFixed(2),
          amount: totalAmount.toFixed(2),
          updated_at: now
        }).where('id', '=', order.id).execute();

        if (existing) {
          await transaction.updateTable('order_fulfilment_details')
            .set(values)
            .where('id', '=', existing.id)
            .execute();
        } else {
          await transaction.insertInto('order_fulfilment_details')
            .values({ ...values, created_at: now })
            .execute();
        }

        await appendTimeline(transaction, {
          orderId: order.id,
          actorId: accountId,
          eventType,
          details: eventDetails,
          occurredAt: now
        });

        return {
          unchanged: false,
          totalAmount: totalAmount.toFixed(2),
          shippingAmount: shippingAmount.toFixed(2),
          mode: body.mode
        };
      });

      writeSecurityAudit(app.log, {
        action: 'order.delivery.configure',
        decision: 'allow',
        actorId: accountId,
        targetId: params.orderId,
        ip: request.ip,
        reasonCodes: [result.unchanged ? 'idempotent' : 'buyer_selected_fulfilment'],
        metadata: {
          mode: result.mode,
          shippingAmount: result.shippingAmount,
          unchanged: result.unchanged
        }
      });
      return reply.send({ accepted: true, orderId: params.orderId, ...result });
    } catch (error) {
      if (error instanceof OrderDeliveryError) {
        return reply.code(error.statusCode).send({ error: error.code });
      }
      throw error;
    }
  });

  app.post('/market/orders/:orderId/pickup-details', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const accountId = authRequest.user.sub;
    const params = orderParams.parse(request.params);
    const body = pickupDetailsBody.parse(request.body);
    if (!enforceLimit(request, reply, accountId, 'order.pickup.details', 30)) return;

    try {
      await db.transaction().execute(async (transaction) => {
        const { order, role } = await participantOrder(transaction, params.orderId, accountId);
        if (role !== 'seller') throw new OrderDeliveryError(403, 'seller_required');
        if (order.status !== 'paid') throw new OrderDeliveryError(409, 'paid_order_required');

        const details = await transaction.selectFrom('order_fulfilment_details')
          .selectAll()
          .where('order_id', '=', order.id)
          .executeTakeFirst();
        if (!details || details.mode !== 'pickup') {
          throw new OrderDeliveryError(409, 'pickup_not_selected');
        }
        const fulfilment = await transaction.selectFrom('fulfilments')
          .select(['id', 'status'])
          .where('id', '=', details.fulfilment_id)
          .executeTakeFirstOrThrow();
        if (fulfilment.status !== 'not_started') {
          throw new OrderDeliveryError(409, 'pickup_details_locked');
        }

        const now = new Date();
        await transaction.updateTable('order_fulfilment_details').set({
          pickup_address_line1: body.address.line1,
          pickup_address_line2: body.address.line2 ?? null,
          pickup_locality: body.address.locality,
          pickup_region: body.address.region,
          pickup_postal_code: body.address.postalCode,
          pickup_country_code: body.address.countryCode,
          pickup_instructions: body.instructions ?? null,
          updated_by: accountId,
          updated_at: now
        }).where('id', '=', details.id).execute();

        await appendTimeline(transaction, {
          orderId: order.id,
          actorId: accountId,
          eventType: 'pickup_details_set',
          details: {
            locality: body.address.locality,
            region: body.address.region
          },
          occurredAt: now
        });
      });

      writeSecurityAudit(app.log, {
        action: 'order.pickup.details',
        decision: 'allow',
        actorId: accountId,
        targetId: params.orderId,
        ip: request.ip,
        reasonCodes: ['seller_disclosed_after_payment']
      });
      return reply.send({ accepted: true, orderId: params.orderId });
    } catch (error) {
      if (error instanceof OrderDeliveryError) {
        return reply.code(error.statusCode).send({ error: error.code });
      }
      throw error;
    }
  });

  app.post('/market/orders/:orderId/pickup-proof', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const accountId = authRequest.user.sub;
    const params = orderParams.parse(request.params);
    if (!enforceLimit(request, reply, accountId, 'order.pickup.proof.issue', 10)) return;

    try {
      const result = await db.transaction().execute(async (transaction) => {
        const { order, role } = await participantOrder(transaction, params.orderId, accountId);
        if (role !== 'buyer') throw new OrderDeliveryError(403, 'buyer_required');
        if (order.status !== 'paid') throw new OrderDeliveryError(409, 'paid_order_required');

        const details = await transaction.selectFrom('order_fulfilment_details')
          .selectAll()
          .where('order_id', '=', order.id)
          .executeTakeFirst();
        if (!details || details.mode !== 'pickup') {
          throw new OrderDeliveryError(409, 'pickup_not_selected');
        }
        const fulfilment = await transaction.selectFrom('fulfilments')
          .select(['id', 'status'])
          .where('id', '=', details.fulfilment_id)
          .executeTakeFirstOrThrow();
        if (fulfilment.status !== 'ready_for_pickup') {
          throw new OrderDeliveryError(409, 'pickup_not_ready');
        }

        const code = pickupCode();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
        await transaction.updateTable('pickup_proofs')
          .set({ revoked_at: now })
          .where('order_id', '=', order.id)
          .where('verified_at', 'is', null)
          .where('revoked_at', 'is', null)
          .execute();
        await transaction.insertInto('pickup_proofs').values({
          order_id: order.id,
          fulfilment_id: fulfilment.id,
          code_hash: pickupHash(code).toString('hex'),
          issued_by: accountId,
          issued_at: now,
          expires_at: expiresAt,
          attempt_count: 0
        }).execute();
        await appendTimeline(transaction, {
          orderId: order.id,
          actorId: accountId,
          eventType: 'pickup_proof_issued',
          details: { expiresAt: expiresAt.toISOString() },
          occurredAt: now
        });
        return { code, expiresAt };
      });

      return reply.send({
        accepted: true,
        orderId: params.orderId,
        pickupProof: {
          code: result.code,
          expiresAt: result.expiresAt
        }
      });
    } catch (error) {
      if (error instanceof OrderDeliveryError) {
        return reply.code(error.statusCode).send({ error: error.code });
      }
      throw error;
    }
  });

  app.post('/market/orders/:orderId/pickup-proof/verify', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const accountId = authRequest.user.sub;
    const params = orderParams.parse(request.params);
    const body = pickupProofBody.parse(request.body);
    if (!enforceLimit(request, reply, accountId, 'order.pickup.proof.verify', 20)) return;

    try {
      const result = await db.transaction().execute(async (transaction) => {
        const { order, role } = await participantOrder(transaction, params.orderId, accountId);
        if (role !== 'seller') throw new OrderDeliveryError(403, 'seller_required');
        if (order.status !== 'paid') throw new OrderDeliveryError(409, 'paid_order_required');

        const details = await transaction.selectFrom('order_fulfilment_details')
          .selectAll()
          .where('order_id', '=', order.id)
          .executeTakeFirst();
        if (!details || details.mode !== 'pickup') {
          throw new OrderDeliveryError(409, 'pickup_not_selected');
        }
        const fulfilment = await transaction.selectFrom('fulfilments')
          .select(['id', 'status'])
          .where('id', '=', details.fulfilment_id)
          .executeTakeFirstOrThrow();

        if (
          fulfilment.status === 'delivered' ||
          fulfilment.status === 'received_confirmed'
        ) {
          return {
            unchanged: true,
            status: fulfilment.status,
            invalid: false
          };
        }
        if (fulfilment.status !== 'ready_for_pickup') {
          throw new OrderDeliveryError(409, 'pickup_not_ready');
        }

        const proof = await transaction.selectFrom('pickup_proofs')
          .selectAll()
          .where('order_id', '=', order.id)
          .where('verified_at', 'is', null)
          .where('revoked_at', 'is', null)
          .orderBy('issued_at', 'desc')
          .executeTakeFirst();
        if (!proof || new Date(proof.expires_at) <= new Date()) {
          throw new OrderDeliveryError(409, 'pickup_proof_unavailable');
        }
        if (Number(proof.attempt_count) >= 10) {
          throw new OrderDeliveryError(409, 'pickup_proof_locked');
        }

        const candidate = pickupHash(body.code);
        const expected = storedHash(String(proof.code_hash));
        if (
          candidate.length !== expected.length ||
          !timingSafeEqual(candidate, expected)
        ) {
          const attemptCount = Number(proof.attempt_count) + 1;
          await transaction.updateTable('pickup_proofs')
            .set({ attempt_count: attemptCount })
            .where('id', '=', proof.id)
            .execute();
          return {
            unchanged: true,
            status: fulfilment.status,
            invalid: true,
            attemptCount
          };
        }

        const now = new Date();
        await transaction.updateTable('pickup_proofs')
          .set({ verified_at: now, verified_by: accountId })
          .where('id', '=', proof.id)
          .execute();
        await transaction.updateTable('fulfilments')
          .set({
            status: 'delivered',
            delivered_at: now,
            updated_at: now
          })
          .where('id', '=', fulfilment.id)
          .where('status', '=', 'ready_for_pickup')
          .execute();
        await transaction.insertInto('order_fulfilment_evidence').values({
          order_id: order.id,
          fulfilment_id: fulfilment.id,
          actor_id: accountId,
          evidence_type: 'pickup_proof_verified',
          reference: String(proof.id),
          evidence_url: null,
          note: null,
          occurred_at: now,
          created_at: now
        }).execute();
        await appendTimeline(transaction, {
          orderId: order.id,
          actorId: accountId,
          eventType: 'pickup_completed',
          details: { proofVerified: true },
          occurredAt: now
        });

        return {
          unchanged: false,
          status: 'delivered',
          invalid: false
        };
      });

      if (result.invalid) {
        const attemptCount = result.attemptCount ?? 10;
        writeSecurityAudit(app.log, {
          action: 'order.pickup.proof.verify',
          decision: 'reject',
          actorId: accountId,
          targetId: params.orderId,
          ip: request.ip,
          reasonCodes: [
            attemptCount >= 10
              ? 'pickup_proof_locked'
              : 'pickup_proof_invalid'
          ],
          metadata: { attemptCount }
        });
        return reply.code(403).send({
          error: attemptCount >= 10
            ? 'pickup_proof_locked'
            : 'pickup_proof_invalid'
        });
      }

      writeSecurityAudit(app.log, {
        action: 'order.pickup.proof.verify',
        decision: 'allow',
        actorId: accountId,
        targetId: params.orderId,
        ip: request.ip,
        reasonCodes: [result.unchanged ? 'idempotent' : 'pickup_proof_verified']
      });
      return reply.send({
        accepted: true,
        orderId: params.orderId,
        unchanged: result.unchanged,
        status: result.status
      });
    } catch (error) {
      if (error instanceof OrderDeliveryError) {
        return reply.code(error.statusCode).send({ error: error.code });
      }
      throw error;
    }
  });

  app.post('/market/orders/:orderId/delivery-evidence', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const accountId = authRequest.user.sub;
    const params = orderParams.parse(request.params);
    const body = deliveryEvidenceBody.parse(request.body);
    const evidenceUrl = safeHttpsUrl(body.evidenceUrl);
    if (!enforceLimit(request, reply, accountId, 'order.delivery.evidence', 30)) return;

    try {
      const result = await db.transaction().execute(async (transaction) => {
        const { order, role } = await participantOrder(transaction, params.orderId, accountId);
        if (role !== 'seller') throw new OrderDeliveryError(403, 'seller_required');
        if (order.status !== 'paid') throw new OrderDeliveryError(409, 'paid_order_required');

        const details = await transaction.selectFrom('order_fulfilment_details')
          .selectAll()
          .where('order_id', '=', order.id)
          .executeTakeFirst();
        if (!details || details.mode !== 'shipping') {
          throw new OrderDeliveryError(409, 'shipping_not_selected');
        }
        const fulfilment = await transaction.selectFrom('fulfilments')
          .selectAll()
          .where('id', '=', details.fulfilment_id)
          .executeTakeFirstOrThrow();
        if (
          fulfilment.status === 'delivered' ||
          fulfilment.status === 'received_confirmed'
        ) {
          return { unchanged: true, status: fulfilment.status };
        }
        if (fulfilment.status !== 'shipped') {
          throw new OrderDeliveryError(409, 'shipment_not_started');
        }

        const now = new Date();
        await transaction.updateTable('fulfilments')
          .set({
            status: 'delivered',
            delivered_at: now,
            updated_at: now
          })
          .where('id', '=', fulfilment.id)
          .where('status', '=', 'shipped')
          .execute();
        await transaction.insertInto('order_fulfilment_evidence').values({
          order_id: order.id,
          fulfilment_id: fulfilment.id,
          actor_id: accountId,
          evidence_type: 'delivery_confirmation',
          reference: fulfilment.tracking_reference,
          evidence_url: evidenceUrl,
          note: body.note,
          occurred_at: now,
          created_at: now
        }).execute();
        await appendTimeline(transaction, {
          orderId: order.id,
          actorId: accountId,
          eventType: 'delivered',
          details: {
            evidenceRecorded: true,
            carrier: fulfilment.carrier ?? null
          },
          occurredAt: now
        });

        return { unchanged: false, status: 'delivered' };
      });

      writeSecurityAudit(app.log, {
        action: 'order.delivery.evidence',
        decision: 'allow',
        actorId: accountId,
        targetId: params.orderId,
        ip: request.ip,
        reasonCodes: [result.unchanged ? 'idempotent' : 'seller_delivery_evidence']
      });
      return reply.send({ accepted: true, orderId: params.orderId, ...result });
    } catch (error) {
      if (error instanceof OrderDeliveryError) {
        return reply.code(error.statusCode).send({ error: error.code });
      }
      throw error;
    }
  });

  app.get('/market/orders/:orderId/timeline', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const params = orderParams.parse(request.params);
    try {
      const { order } = await participantOrder(db, params.orderId, authRequest.user.sub);
      const events = await db.selectFrom('order_timeline_events')
        .select(['id', 'actor_id', 'event_type', 'details', 'occurred_at'])
        .where('order_id', '=', order.id)
        .orderBy('occurred_at', 'asc')
        .orderBy('id', 'asc')
        .execute();
      return reply.send({
        orderId: order.id,
        events: events.map((event) => ({
          id: event.id,
          actorId: event.actor_id,
          type: event.event_type,
          details: event.details,
          occurredAt: event.occurred_at
        }))
      });
    } catch (error) {
      if (error instanceof OrderDeliveryError) {
        return reply.code(error.statusCode).send({ error: error.code });
      }
      throw error;
    }
  });
}
