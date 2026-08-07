import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { closeDb, db } from '../db/index.js';

const sellerId = randomUUID();
const buyerId = randomUUID();
const listingId = randomUUID();
const offerId = randomUUID();
const orderId = randomUUID();
const now = new Date();

try {
  await db.insertInto('users').values([
    {
      id: sellerId,
      email: `boundary-seller-${sellerId}@example.test`,
      display_name: 'Boundary Seller',
      status: 'active',
      email_verified_at: now,
      created_at: now,
      updated_at: now
    },
    {
      id: buyerId,
      email: `boundary-buyer-${buyerId}@example.test`,
      display_name: 'Boundary Buyer',
      status: 'active',
      email_verified_at: now,
      created_at: now,
      updated_at: now
    }
  ]).execute();

  await db.insertInto('listings').values({
    id: listingId,
    seller_id: sellerId,
    title: 'Reservation boundary',
    description: 'Reservation expiry must be enforced at order insertion time.',
    price_amount: '100.00',
    currency_code: 'AUD',
    condition: 'good',
    availability_status: 'in_stock',
    available_quantity: 1,
    status: 'active',
    country_code: 'AU',
    allow_pickup: true,
    allow_delivery: false,
    created_at: now,
    updated_at: now
  }).execute();

  await db.insertInto('offers').values({
    id: offerId,
    listing_id: listingId,
    buyer_id: buyerId,
    amount: '90.00',
    currency_code: 'AUD',
    status: 'pending',
    client_offer_id: randomUUID(),
    created_at: now,
    updated_at: now
  }).execute();
  await db.updateTable('offers')
    .set({ status: 'accepted', updated_at: now })
    .where('id', '=', offerId)
    .execute();

  await db.updateTable('listing_inventory_reservations')
    .set({ expires_at: new Date(Date.now() - 1000), updated_at: new Date() })
    .where('offer_id', '=', offerId)
    .execute();

  await assert.rejects(
    () => db.insertInto('transactions').values({
      id: orderId,
      listing_id: listingId,
      offer_id: offerId,
      buyer_id: buyerId,
      seller_id: sellerId,
      amount: '90.00',
      currency_code: 'AUD',
      status: 'pending',
      payment_method: 'card',
      client_order_id: randomUUID(),
      created_at: new Date(),
      updated_at: new Date()
    }).execute(),
    /reservation is unavailable or expired/i
  );

  assert.equal(
    await db.selectFrom('transactions').select('id').where('id', '=', orderId).executeTakeFirst(),
    undefined
  );
  const reservation = await db.selectFrom('listing_inventory_reservations')
    .select(['order_id', 'status'])
    .where('offer_id', '=', offerId)
    .executeTakeFirstOrThrow();
  assert.equal(reservation.order_id, null);
  assert.equal(reservation.status, 'reserved');

  console.log('Listing lifecycle boundary tests passed.');
} finally {
  await db.deleteFrom('transactions').where('id', '=', orderId).execute();
  await db.deleteFrom('offers').where('id', '=', offerId).execute();
  await db.deleteFrom('listings').where('id', '=', listingId).execute();
  await db.deleteFrom('users').where('id', 'in', [sellerId, buyerId]).execute();
  await closeDb();
}
