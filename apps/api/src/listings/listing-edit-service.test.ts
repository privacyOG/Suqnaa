import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { closeDb, db } from '../db/index.js';
import {
  ListingEditError,
  readSellerListingForEdit,
  updateSellerListing
} from './listing-edit-service.js';

const ownerId = randomUUID();
const otherId = randomUUID();
const listingId = randomUUID();
const categoryId = randomUUID();
const replacementCategoryId = randomUUID();
const now = new Date();

try {
  await db.insertInto('users').values([
    {
      id: ownerId,
      email: `listing-owner-${ownerId}@example.test`,
      display_name: 'Listing Owner',
      status: 'active',
      email_verified_at: now,
      created_at: now,
      updated_at: now
    },
    {
      id: otherId,
      email: `listing-other-${otherId}@example.test`,
      display_name: 'Other Seller',
      status: 'active',
      email_verified_at: now,
      created_at: now,
      updated_at: now
    }
  ]).execute();

  await db.insertInto('categories').values([
    { id: categoryId, slug: `listing-edit-${categoryId}`, name_en: 'Edit category', sort_order: 5000 },
    { id: replacementCategoryId, slug: `listing-edit-${replacementCategoryId}`, name_en: 'Replacement category', sort_order: 5001 }
  ]).execute();

  await db.insertInto('listings').values({
    id: listingId,
    seller_id: ownerId,
    category_id: categoryId,
    title: 'Original listing',
    description: 'Original listing description for optimistic editing.',
    price_amount: '100.00',
    currency_code: 'AUD',
    condition: 'good',
    availability_status: 'in_stock',
    available_quantity: 3,
    unit_label: 'item',
    status: 'draft',
    country_code: 'AU',
    region: 'NSW',
    city: 'Sydney',
    suburb: 'Greenacre',
    allow_pickup: true,
    allow_delivery: false,
    created_at: now,
    updated_at: now
  }).execute();

  const initial = await readSellerListingForEdit(ownerId, listingId);
  assert.equal(initial.editable, true);
  assert.equal(initial.listing.version, 1);
  assert.equal(initial.listing.categoryId, categoryId);

  await assert.rejects(
    () => readSellerListingForEdit(otherId, listingId),
    (error: unknown) => error instanceof ListingEditError && error.code === 'listing_not_found'
  );

  const firstUpdate = await updateSellerListing({
    userId: ownerId,
    listingId,
    edit: {
      version: 1,
      categoryId: replacementCategoryId,
      title: 'Updated listing',
      description: 'Updated listing description with all editable fields changed.',
      priceAmount: 125.5,
      currencyCode: 'nzd',
      condition: 'like_new',
      availabilityStatus: 'limited',
      availableQuantity: 2,
      unitLabel: 'units',
      countryCode: 'nz',
      region: 'Auckland',
      city: 'Auckland',
      suburb: 'Central',
      allowPickup: false,
      allowDelivery: true
    }
  });

  assert.equal(firstUpdate.unchanged, false);
  assert.equal(firstUpdate.listing.version, 2);
  assert.equal(firstUpdate.listing.title, 'Updated listing');
  assert.equal(firstUpdate.listing.currencyCode, 'NZD');
  assert.equal(firstUpdate.listing.countryCode, 'NZ');
  assert.equal(firstUpdate.listing.categoryId, replacementCategoryId);

  await assert.rejects(
    () => updateSellerListing({
      userId: ownerId,
      listingId,
      edit: {
        version: 1,
        categoryId: replacementCategoryId,
        title: 'Stale overwrite attempt',
        description: 'A stale form must never overwrite the current listing values.',
        priceAmount: 50,
        currencyCode: 'AUD',
        condition: 'fair',
        availabilityStatus: 'in_stock',
        availableQuantity: 1,
        unitLabel: 'item',
        countryCode: 'AU',
        region: 'NSW',
        city: 'Sydney',
        suburb: 'Bankstown',
        allowPickup: true,
        allowDelivery: false
      }
    }),
    (error: unknown) => error instanceof ListingEditError
      && error.code === 'listing_conflict'
      && error.currentVersion === 2
  );

  const noChange = await updateSellerListing({
    userId: ownerId,
    listingId,
    edit: {
      version: 2,
      categoryId: replacementCategoryId,
      title: 'Updated listing',
      description: 'Updated listing description with all editable fields changed.',
      priceAmount: 125.5,
      currencyCode: 'NZD',
      condition: 'like_new',
      availabilityStatus: 'limited',
      availableQuantity: 2,
      unitLabel: 'units',
      countryCode: 'NZ',
      region: 'Auckland',
      city: 'Auckland',
      suburb: 'Central',
      allowPickup: false,
      allowDelivery: true
    }
  });
  assert.equal(noChange.unchanged, true);
  assert.equal(noChange.listing.version, 2);

  await assert.rejects(
    () => updateSellerListing({
      userId: ownerId,
      listingId,
      edit: {
        version: 2,
        categoryId: randomUUID(),
        title: 'Updated listing',
        description: 'Updated listing description with all editable fields changed.',
        priceAmount: 125.5,
        currencyCode: 'NZD',
        condition: 'like_new',
        availabilityStatus: 'limited',
        availableQuantity: 2,
        unitLabel: 'units',
        countryCode: 'NZ',
        region: 'Auckland',
        city: 'Auckland',
        suburb: 'Central',
        allowPickup: false,
        allowDelivery: true
      }
    }),
    (error: unknown) => error instanceof ListingEditError && error.code === 'invalid_category'
  );

  await db.updateTable('listings')
    .set({ status: 'active', updated_at: new Date() })
    .where('id', '=', listingId)
    .execute();
  const afterExternalChange = await readSellerListingForEdit(ownerId, listingId);
  assert.equal(afterExternalChange.listing.version, 3);
  assert.equal(afterExternalChange.listing.status, 'active');

  await assert.rejects(
    () => updateSellerListing({
      userId: ownerId,
      listingId,
      edit: {
        version: 2,
        categoryId: replacementCategoryId,
        title: 'Old snapshot',
        description: 'An old snapshot conflicts after a status update elsewhere.',
        priceAmount: 125.5,
        currencyCode: 'NZD',
        condition: 'like_new',
        availabilityStatus: 'limited',
        availableQuantity: 2,
        unitLabel: 'units',
        countryCode: 'NZ',
        region: 'Auckland',
        city: 'Auckland',
        suburb: 'Central',
        allowPickup: false,
        allowDelivery: true
      }
    }),
    (error: unknown) => error instanceof ListingEditError
      && error.code === 'listing_conflict'
      && error.currentVersion === 3
  );

  await db.updateTable('listings')
    .set({ status: 'reserved', updated_at: new Date() })
    .where('id', '=', listingId)
    .execute();
  const reserved = await readSellerListingForEdit(ownerId, listingId);
  assert.equal(reserved.editable, false);
  assert.equal(reserved.listing.version, 4);

  await assert.rejects(
    () => updateSellerListing({
      userId: ownerId,
      listingId,
      edit: {
        version: 4,
        categoryId: replacementCategoryId,
        title: 'Should remain immutable',
        description: 'Reserved marketplace terms cannot be rewritten by seller editing.',
        priceAmount: 125.5,
        currencyCode: 'NZD',
        condition: 'like_new',
        availabilityStatus: 'limited',
        availableQuantity: 2,
        unitLabel: 'units',
        countryCode: 'NZ',
        region: 'Auckland',
        city: 'Auckland',
        suburb: 'Central',
        allowPickup: false,
        allowDelivery: true
      }
    }),
    (error: unknown) => error instanceof ListingEditError && error.code === 'listing_not_editable'
  );

  console.log('Seller listing optimistic edit service tests passed.');
} finally {
  await db.deleteFrom('listings').where('id', '=', listingId).execute();
  await db.deleteFrom('categories').where('id', 'in', [categoryId, replacementCategoryId]).execute();
  await db.deleteFrom('users').where('id', 'in', [ownerId, otherId]).execute();
  await closeDb();
}
