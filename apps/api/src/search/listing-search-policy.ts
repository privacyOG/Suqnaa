import { createHash } from 'node:crypto';
import { z } from 'zod';

export const listingSearchSort = z.enum([
  'newest',
  'price_asc',
  'price_desc'
]);

export type ListingSearchSort = z.infer<typeof listingSearchSort>;

const listingCondition = z.enum([
  'new',
  'like_new',
  'good',
  'fair',
  'parts_or_repair'
]);

const availabilityStatus = z.enum([
  'in_stock',
  'limited',
  'out_of_stock',
  'service_available'
]);

const boundedMoney = z.coerce.number().finite().nonnegative().max(1_000_000_000_000);

export const publicListingSearchQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  before: z.string().trim().min(1).max(512).optional(),
  q: z.string().trim().min(1).max(200).optional(),
  categoryId: z.string().uuid().optional(),
  condition: listingCondition.optional(),
  availabilityStatus: availabilityStatus.optional(),
  minPrice: boundedMoney.optional(),
  maxPrice: boundedMoney.optional(),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()).optional(),
  country: z.string().trim().length(2).transform((value) => value.toUpperCase()).optional(),
  region: z.string().trim().min(1).max(120).optional(),
  city: z.string().trim().min(1).max(120).optional(),
  suburb: z.string().trim().min(1).max(120).optional(),
  fulfilment: z.enum(['pickup', 'delivery', 'both']).optional(),
  sort: listingSearchSort.default('newest')
}).superRefine((value, context) => {
  if (
    value.minPrice !== undefined &&
    value.maxPrice !== undefined &&
    value.minPrice > value.maxPrice
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['maxPrice'],
      message: 'Maximum price must be greater than or equal to minimum price'
    });
  }

  const usesMoneyOrdering = value.sort === 'price_asc' || value.sort === 'price_desc';
  if (
    (usesMoneyOrdering || value.minPrice !== undefined || value.maxPrice !== undefined) &&
    !value.currency
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['currency'],
      message: 'Currency is required for price filters and price sorting'
    });
  }
});

export type PublicListingSearchQuery = z.infer<typeof publicListingSearchQuery>;

interface CursorPayload {
  v: 1;
  sort: ListingSearchSort;
  filter: string;
  createdAt: string;
  id: string;
  price?: string;
}

export type ListingSearchCursor =
  | {
      kind: 'legacy';
      createdAt: Date;
    }
  | {
      kind: 'opaque';
      sort: ListingSearchSort;
      createdAt: Date;
      id: string;
      price?: string;
    };

const cursorPayload = z.object({
  v: z.literal(1),
  sort: listingSearchSort,
  filter: z.string().regex(/^[a-f0-9]{32}$/),
  createdAt: z.string().datetime(),
  id: z.string().uuid(),
  price: z.string().regex(/^[0-9]{1,18}(?:\.[0-9]{1,8})?$/).optional()
}).superRefine((value, context) => {
  const needsPrice = value.sort === 'price_asc' || value.sort === 'price_desc';
  if (needsPrice && !value.price) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['price'],
      message: 'Price cursor value is required for price sorting'
    });
  }
  if (!needsPrice && value.price !== undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['price'],
      message: 'Price cursor value is not allowed for newest sorting'
    });
  }
});

function filterMaterial(query: PublicListingSearchQuery) {
  return {
    q: query.q ?? null,
    categoryId: query.categoryId ?? null,
    condition: query.condition ?? null,
    availabilityStatus: query.availabilityStatus ?? null,
    minPrice: query.minPrice ?? null,
    maxPrice: query.maxPrice ?? null,
    currency: query.currency ?? null,
    country: query.country ?? null,
    region: query.region ?? null,
    city: query.city ?? null,
    suburb: query.suburb ?? null,
    fulfilment: query.fulfilment ?? null,
    sort: query.sort
  };
}

export function listingSearchFilterFingerprint(
  query: PublicListingSearchQuery
): string {
  return createHash('sha256')
    .update(JSON.stringify(filterMaterial(query)))
    .digest('hex')
    .slice(0, 32);
}

export function encodeListingSearchCursor(
  query: PublicListingSearchQuery,
  value: {
    createdAt: Date | string;
    id: string;
    price?: string | number;
  }
): string {
  const createdAt = value.createdAt instanceof Date
    ? value.createdAt.toISOString()
    : new Date(value.createdAt).toISOString();
  const payload: CursorPayload = {
    v: 1,
    sort: query.sort,
    filter: listingSearchFilterFingerprint(query),
    createdAt,
    id: value.id,
    ...(query.sort === 'newest' ? {} : { price: String(value.price) })
  };
  const validated = cursorPayload.parse(payload);
  return `ls1.${Buffer.from(JSON.stringify(validated), 'utf8').toString('base64url')}`;
}

export function decodeListingSearchCursor(
  value: string,
  query: PublicListingSearchQuery
): ListingSearchCursor {
  const legacy = z.string().datetime().safeParse(value);
  if (legacy.success) {
    if (query.sort !== 'newest') {
      throw new Error('Legacy listing cursor is valid only for newest sorting');
    }
    return {
      kind: 'legacy',
      createdAt: new Date(legacy.data)
    };
  }

  if (!value.startsWith('ls1.') || value.length > 512) {
    throw new Error('Invalid listing search cursor');
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(value.slice(4), 'base64url').toString('utf8'));
  } catch {
    throw new Error('Invalid listing search cursor');
  }

  const payload = cursorPayload.parse(decoded);
  if (
    payload.sort !== query.sort ||
    payload.filter !== listingSearchFilterFingerprint(query)
  ) {
    throw new Error('Listing search cursor does not match the active filters');
  }

  return {
    kind: 'opaque',
    sort: payload.sort,
    createdAt: new Date(payload.createdAt),
    id: payload.id,
    price: payload.price
  };
}
