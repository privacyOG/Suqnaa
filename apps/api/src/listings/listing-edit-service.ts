import { db } from '../db/index.js';

export const editableListingStatuses = new Set(['draft', 'active', 'expired']);

export interface ListingEditInput {
  version: number;
  categoryId: string | null;
  title: string;
  description: string;
  priceAmount: number;
  currencyCode: string;
  condition: 'new' | 'like_new' | 'good' | 'fair' | 'parts_or_repair';
  availabilityStatus: 'in_stock' | 'limited' | 'out_of_stock' | 'service_available';
  availableQuantity: number | null;
  unitLabel: string | null;
  countryCode: string;
  region: string | null;
  city: string | null;
  suburb: string | null;
  allowPickup: boolean;
  allowDelivery: boolean;
}

export class ListingEditError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string,
    public readonly currentVersion?: number,
    public readonly currentStatus?: string
  ) {
    super(message);
  }
}

function normalizedOptional(value: string | null): string | null {
  const normalized = value?.trim() ?? '';
  return normalized.length > 0 ? normalized : null;
}

function normalizeInput(input: ListingEditInput): ListingEditInput {
  return {
    ...input,
    title: input.title.trim(),
    description: input.description.trim(),
    currencyCode: input.currencyCode.trim().toUpperCase(),
    unitLabel: normalizedOptional(input.unitLabel),
    countryCode: input.countryCode.trim().toUpperCase(),
    region: normalizedOptional(input.region),
    city: normalizedOptional(input.city),
    suburb: normalizedOptional(input.suburb)
  };
}

function serializeListing(row: Record<string, any>) {
  return {
    id: String(row.id),
    categoryId: row.category_id ? String(row.category_id) : null,
    title: String(row.title),
    description: String(row.description),
    priceAmount: row.price_amount,
    currencyCode: String(row.currency_code),
    condition: String(row.condition),
    availabilityStatus: String(row.availability_status ?? 'in_stock'),
    availableQuantity: row.available_quantity === null || row.available_quantity === undefined
      ? null
      : Number(row.available_quantity),
    unitLabel: row.unit_label ?? null,
    status: String(row.status),
    countryCode: String(row.country_code),
    region: row.region ?? null,
    city: row.city ?? null,
    suburb: row.suburb ?? null,
    allowPickup: Boolean(row.allow_pickup),
    allowDelivery: Boolean(row.allow_delivery),
    version: Number(row.edit_version),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function readSellerListingForEdit(userId: string, listingId: string) {
  const row = await db.selectFrom('listings')
    .selectAll()
    .where('id', '=', listingId)
    .where('seller_id', '=', userId)
    .executeTakeFirst();

  if (!row) {
    throw new ListingEditError('listing_not_found', 404, 'Listing not found');
  }

  return {
    listing: serializeListing(row),
    editable: editableListingStatuses.has(String(row.status))
  };
}

async function requireCategory(categoryId: string | null): Promise<void> {
  if (!categoryId) {
    return;
  }
  const category = await db.selectFrom('categories')
    .select(['id'])
    .where('id', '=', categoryId)
    .executeTakeFirst();
  if (!category) {
    throw new ListingEditError('invalid_category', 400, 'Category not found');
  }
}

function rowMatchesInput(row: Record<string, any>, input: ListingEditInput): boolean {
  return (row.category_id ?? null) === input.categoryId
    && String(row.title) === input.title
    && String(row.description) === input.description
    && Number(row.price_amount) === input.priceAmount
    && String(row.currency_code) === input.currencyCode
    && String(row.condition) === input.condition
    && String(row.availability_status ?? 'in_stock') === input.availabilityStatus
    && (row.available_quantity === null || row.available_quantity === undefined
      ? input.availableQuantity === null
      : Number(row.available_quantity) === input.availableQuantity)
    && (row.unit_label ?? null) === input.unitLabel
    && String(row.country_code) === input.countryCode
    && (row.region ?? null) === input.region
    && (row.city ?? null) === input.city
    && (row.suburb ?? null) === input.suburb
    && Boolean(row.allow_pickup) === input.allowPickup
    && Boolean(row.allow_delivery) === input.allowDelivery;
}

export async function updateSellerListing(input: {
  userId: string;
  listingId: string;
  edit: ListingEditInput;
}) {
  const edit = normalizeInput(input.edit);
  if (!edit.allowPickup && !edit.allowDelivery) {
    throw new ListingEditError('fulfilment_required', 400, 'At least one fulfilment option is required');
  }

  const existing = await db.selectFrom('listings')
    .selectAll()
    .where('id', '=', input.listingId)
    .where('seller_id', '=', input.userId)
    .executeTakeFirst();

  if (!existing) {
    throw new ListingEditError('listing_not_found', 404, 'Listing not found');
  }

  const currentStatus = String(existing.status);
  const currentVersion = Number(existing.edit_version);
  if (!editableListingStatuses.has(currentStatus)) {
    throw new ListingEditError(
      'listing_not_editable',
      409,
      'Listing cannot be edited in its current status',
      currentVersion,
      currentStatus
    );
  }
  if (currentVersion !== edit.version) {
    throw new ListingEditError(
      'listing_conflict',
      409,
      'Listing changed; reload before saving',
      currentVersion,
      currentStatus
    );
  }

  await requireCategory(edit.categoryId);

  if (rowMatchesInput(existing, edit)) {
    return { listing: serializeListing(existing), unchanged: true };
  }

  const now = new Date();
  const updated = await db.updateTable('listings')
    .set({
      category_id: edit.categoryId,
      title: edit.title,
      description: edit.description,
      price_amount: edit.priceAmount.toFixed(2),
      currency_code: edit.currencyCode,
      condition: edit.condition,
      availability_status: edit.availabilityStatus,
      available_quantity: edit.availableQuantity,
      unit_label: edit.unitLabel,
      country_code: edit.countryCode,
      region: edit.region,
      city: edit.city,
      suburb: edit.suburb,
      allow_pickup: edit.allowPickup,
      allow_delivery: edit.allowDelivery,
      updated_at: now
    })
    .where('id', '=', input.listingId)
    .where('seller_id', '=', input.userId)
    .where('edit_version', '=', edit.version)
    .where('status', 'in', [...editableListingStatuses])
    .returningAll()
    .executeTakeFirst();

  if (!updated) {
    const latest = await db.selectFrom('listings')
      .select(['edit_version', 'status'])
      .where('id', '=', input.listingId)
      .where('seller_id', '=', input.userId)
      .executeTakeFirst();
    if (!latest) {
      throw new ListingEditError('listing_not_found', 404, 'Listing not found');
    }
    const stillEditable = editableListingStatuses.has(String(latest.status));
    throw new ListingEditError(
      stillEditable ? 'listing_conflict' : 'listing_not_editable',
      409,
      stillEditable
        ? 'Listing changed; reload before saving'
        : 'Listing cannot be edited in its current status',
      Number(latest.edit_version),
      String(latest.status)
    );
  }

  return { listing: serializeListing(updated), unchanged: false };
}
