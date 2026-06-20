import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser, type AuthenticatedRequest } from '../auth/require-user.js';
import { db } from '../db/index.js';

const createListingBody = z.object({
  categoryId: z.string().uuid().optional(),
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(5000),
  priceAmount: z.number().nonnegative(),
  currencyCode: z.string().length(3),
  condition: z.enum(['new', 'like_new', 'good', 'fair', 'parts_or_repair']),
  countryCode: z.string().length(2),
  region: z.string().max(120).optional(),
  city: z.string().max(120).optional(),
  suburb: z.string().max(120).optional(),
  allowPickup: z.boolean().default(true),
  allowDelivery: z.boolean().default(false)
});

export async function listingRoutes(app: FastifyInstance): Promise<void> {
  app.get('/listings', async () => {
    const listings = await db.selectFrom('listings')
      .select(['id', 'title', 'price_amount', 'currency_code', 'condition', 'city', 'country_code', 'created_at'])
      .where('status', '=', 'active')
      .orderBy('created_at', 'desc')
      .limit(50)
      .execute();

    return { listings };
  });

  app.post('/listings', { preHandler: requireUser }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const body = createListingBody.parse(request.body);

    const listing = await db.insertInto('listings')
      .values({
        seller_id: authRequest.user.sub,
        category_id: body.categoryId ?? null,
        title: body.title,
        description: body.description,
        price_amount: body.priceAmount.toFixed(2),
        currency_code: body.currencyCode.toUpperCase(),
        condition: body.condition,
        status: 'draft',
        country_code: body.countryCode.toUpperCase(),
        region: body.region ?? null,
        city: body.city ?? null,
        suburb: body.suburb ?? null,
        allow_pickup: body.allowPickup,
        allow_delivery: body.allowDelivery
      })
      .returning(['id', 'title', 'status', 'created_at'])
      .executeTakeFirstOrThrow();

    return reply.code(201).send({ listing });
  });
}
