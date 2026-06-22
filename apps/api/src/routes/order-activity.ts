import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireUser, type AuthenticatedRequest } from '../auth/require-user.js';
import { db } from '../db/index.js';
import type { TransactionStatus } from '../db/types.js';
import { getOrderProgress } from '../market/order-progress.js';
import { checkRateLimit, rateLimitResponse } from '../security/rate-limit.js';

const transactionStatus = z.enum([
  'pending',
  'paid',
  'released',
  'refunded',
  'disputed',
  'cancelled'
]);

const orderPageQuery = z.object({
  status: transactionStatus.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  before: z.string().datetime().optional()
});

const orderParams = z.object({
  orderId: z.string().uuid()
});

const orderColumns = [
  'id',
  'offer_id',
  'listing_id',
  'buyer_id',
  'seller_id',
  'amount',
  'currency_code',
  'status',
  'payment_method',
  'created_at',
  'updated_at'
] as const;

function enforceReadLimit(
  request: FastifyRequest,
  reply: FastifyReply,
  accountId: string
): boolean {
  const perAccount = checkRateLimit({
    group: 'market.orders.read.account',
    identifiers: [`account:${accountId}`],
    limit: 180,
    windowMs: 5 * 60 * 1000
  });
  const perIp = checkRateLimit({
    group: 'market.orders.read.ip',
    identifiers: [`ip:${request.ip}`],
    limit: 400,
    windowMs: 5 * 60 * 1000
  });
  const limited = !perAccount.allowed ? perAccount : !perIp.allowed ? perIp : undefined;

  if (!limited) {
    return true;
  }

  reply.header('Retry-After', String(limited.retryAfterSeconds));
  reply.code(429).send(rateLimitResponse(limited));
  return false;
}

function roleFor(order: Record<string, any>, accountId: string): 'buyer' | 'seller' {
  return order.buyer_id === accountId ? 'buyer' : 'seller';
}

async function enrichOrder(order: Record<string, any>, accountId: string) {
  const role = roleFor(order, accountId);
  const counterpartId = role === 'buyer' ? order.seller_id : order.buyer_id;
  const [listing, counterpart, offer] = await Promise.all([
    db.selectFrom('listings')
      .select(['id', 'title', 'status', 'price_amount', 'currency_code'])
      .where('id', '=', order.listing_id)
      .executeTakeFirst(),
    db.selectFrom('users')
      .select(['id', 'display_name', 'status'])
      .where('id', '=', counterpartId)
      .executeTakeFirst(),
    order.offer_id
      ? db.selectFrom('offers')
          .select(['id', 'status', 'message', 'created_at', 'updated_at'])
          .where('id', '=', order.offer_id)
          .executeTakeFirst()
      : Promise.resolve(undefined)
  ]);
  const status = transactionStatus.parse(order.status) as TransactionStatus;

  return {
    id: order.id,
    offerId: order.offer_id,
    listingId: order.listing_id,
    buyerId: order.buyer_id,
    sellerId: order.seller_id,
    amount: order.amount,
    currencyCode: order.currency_code,
    status,
    paymentMethod: order.payment_method,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    role,
    progress: getOrderProgress(status),
    listing: listing
      ? {
          id: listing.id,
          title: listing.title,
          status: listing.status,
          priceAmount: listing.price_amount,
          currencyCode: listing.currency_code
        }
      : null,
    counterpart: counterpart
      ? {
          id: counterpart.id,
          displayName: counterpart.display_name,
          status: counterpart.status
        }
      : null,
    offer: offer
      ? {
          id: offer.id,
          status: offer.status,
          message: offer.message,
          createdAt: offer.created_at,
          updatedAt: offer.updated_at
        }
      : null
  };
}

export async function orderActivityRoutes(app: FastifyInstance): Promise<void> {
  app.get('/market/orders', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const accountId = authRequest.user.sub;
    const query = orderPageQuery.parse(request.query);

    if (!enforceReadLimit(request, reply, accountId)) {
      return;
    }

    let ordersQuery = db.selectFrom('transactions')
      .select(orderColumns)
      .where((expression) => expression.or([
        expression('buyer_id', '=', accountId),
        expression('seller_id', '=', accountId)
      ]));

    if (query.status) {
      ordersQuery = ordersQuery.where('status', '=', query.status);
    }
    if (query.before) {
      ordersQuery = ordersQuery.where('updated_at', '<', new Date(query.before));
    }

    const rows = await ordersQuery
      .orderBy('updated_at', 'desc')
      .limit(query.limit + 1)
      .execute();
    const hasMore = rows.length > query.limit;
    const page = rows.slice(0, query.limit);
    const orders = await Promise.all(page.map((order) => enrichOrder(order, accountId)));
    const last = page.at(-1);

    return reply.send({
      orders,
      pagination: {
        hasMore,
        nextCursor: hasMore && last
          ? new Date(last.updated_at).toISOString()
          : null
      }
    });
  });

  app.get('/market/orders/:orderId', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const accountId = authRequest.user.sub;
    const params = orderParams.parse(request.params);

    if (!enforceReadLimit(request, reply, accountId)) {
      return;
    }

    const order = await db.selectFrom('transactions')
      .select(orderColumns)
      .where('id', '=', params.orderId)
      .executeTakeFirst();

    if (!order || (order.buyer_id !== accountId && order.seller_id !== accountId)) {
      return reply.code(404).send({ error: 'Order not found' });
    }

    return reply.send({
      order: await enrichOrder(order, accountId)
    });
  });
}
