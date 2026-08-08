import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { closeDb, db } from '../db/index.js';

const now = new Date('2026-08-08T15:30:00.000Z');
const buyerId = randomUUID();
const sellerId = randomUUID();
const listingId = randomUUID();
const orderId = randomUUID();
let intentId = '';
let fulfilmentId = '';
let shippingOptionId = '';

try {
  await db.insertInto('users').values([
    {
      id: buyerId,
      email: `delivery-buyer-${buyerId}@example.test`,
      display_name: 'Delivery Buyer', status: 'active', email_verified_at: now,
      created_at: now, updated_at: now
    },
    {
      id: sellerId,
      email: `delivery-seller-${sellerId}@example.test`,
      display_name: 'Delivery Seller', status: 'active', email_verified_at: now,
      created_at: now, updated_at: now
    }
  ]).execute();

  await db.insertInto('listings').values({
    id: listingId,
    seller_id: sellerId,
    title: 'Delivery invariant listing',
    description: 'Database-backed shipping, address privacy, and price locking test.',
    price_amount: '100.00', currency_code: 'AUD', condition: 'good',
    availability_status: 'in_stock', available_quantity: 1,
    status: 'reserved', country_code: 'AU', allow_pickup: true, allow_delivery: true,
    published_at: now, created_at: now, updated_at: now
  }).execute();

  await db.insertInto('transactions').values({
    id: orderId,
    listing_id: listingId,
    buyer_id: buyerId,
    seller_id: sellerId,
    amount: '100.00',
    currency_code: 'AUD',
    status: 'pending',
    payment_method: 'card',
    client_order_id: randomUUID(),
    created_at: now,
    updated_at: now
  }).execute();

  let order = await db.selectFrom('transactions')
    .select(['item_amount', 'shipping_amount', 'amount'])
    .where('id', '=', orderId)
    .executeTakeFirstOrThrow();
  assert.equal(Number(order.item_amount).toFixed(2), '100.00');
  assert.equal(Number(order.shipping_amount).toFixed(2), '0.00');
  assert.equal(Number(order.amount).toFixed(2), '100.00');

  const intent = await db.selectFrom('payment_intents')
    .select(['id', 'amount'])
    .where('transaction_id', '=', orderId)
    .executeTakeFirstOrThrow();
  intentId = String(intent.id);
  const fulfilment = await db.selectFrom('fulfilments')
    .select(['id'])
    .where('payment_intent_id', '=', intentId)
    .executeTakeFirstOrThrow();
  fulfilmentId = String(fulfilment.id);

  const option = await db.insertInto('listing_shipping_options').values({
    listing_id: listingId,
    label: 'Tracked metro delivery',
    carrier: 'Parcel Carrier',
    service_code: 'TRACKED',
    amount: '12.50',
    currency_code: 'AUD',
    eta_min_days: 2,
    eta_max_days: 4,
    is_active: true,
    created_at: now,
    updated_at: now
  }).returning(['id']).executeTakeFirstOrThrow();
  shippingOptionId = String(option.id);

  await db.updateTable('transactions').set({
    shipping_amount: '12.50',
    amount: '112.50',
    updated_at: new Date(now.getTime() + 1000)
  }).where('id', '=', orderId).execute();

  order = await db.selectFrom('transactions')
    .select(['item_amount', 'shipping_amount', 'amount'])
    .where('id', '=', orderId)
    .executeTakeFirstOrThrow();
  assert.equal(Number(order.amount).toFixed(2), '112.50');
  assert.equal(Number((await db.selectFrom('payment_intents').select('amount').where('id', '=', intentId).executeTakeFirstOrThrow()).amount).toFixed(2), '112.50');

  const privateStreet = '44 Protected Example Street';
  await db.insertInto('order_fulfilment_details').values({
    order_id: orderId,
    fulfilment_id: fulfilmentId,
    mode: 'shipping',
    shipping_option_id: shippingOptionId,
    shipping_method_label: 'Tracked metro delivery',
    shipping_carrier: 'Parcel Carrier',
    shipping_service_code: 'TRACKED',
    shipping_amount: '12.50',
    currency_code: 'AUD',
    recipient_name: 'Delivery Buyer',
    address_line1: privateStreet,
    address_line2: null,
    locality: 'Sydney',
    region: 'NSW',
    postal_code: '2000',
    country_code: 'AU',
    pickup_address_line1: null,
    pickup_address_line2: null,
    pickup_locality: null,
    pickup_region: null,
    pickup_postal_code: null,
    pickup_country_code: null,
    pickup_instructions: null,
    updated_by: buyerId,
    created_at: now,
    updated_at: now
  }).execute();

  const timeline = await db.selectFrom('order_timeline_events')
    .select(['event_type', 'details'])
    .where('order_id', '=', orderId)
    .execute();
  assert.ok(timeline.some((event) => event.event_type === 'order_created'));
  assert.ok(timeline.every((event) => !JSON.stringify(event.details).includes(privateStreet)));

  await db.insertInto('payment_collection_sessions').values({
    payment_intent_id: intentId,
    provider: 'stripe',
    provider_session_id: `cs_test_delivery_${randomUUID().replaceAll('-', '')}`,
    provider_payment_reference: null,
    status: 'open',
    expires_at: new Date(now.getTime() + 60 * 60 * 1000),
    created_at: now,
    updated_at: now
  }).execute();

  await assert.rejects(
    db.updateTable('transactions').set({
      shipping_amount: '15.00',
      amount: '115.00',
      updated_at: new Date(now.getTime() + 2000)
    }).where('id', '=', orderId).execute(),
    /Order price cannot change after payment collection begins/
  );

  const locked = await db.selectFrom('transactions')
    .select(['shipping_amount', 'amount'])
    .where('id', '=', orderId)
    .executeTakeFirstOrThrow();
  assert.equal(Number(locked.shipping_amount).toFixed(2), '12.50');
  assert.equal(Number(locked.amount).toFixed(2), '112.50');
} finally {
  if (intentId) {
    await db.deleteFrom('payment_collection_sessions').where('payment_intent_id', '=', intentId).execute();
    await db.deleteFrom('order_fulfilment_evidence').where('order_id', '=', orderId).execute();
    await db.deleteFrom('pickup_proofs').where('order_id', '=', orderId).execute();
    await db.deleteFrom('order_fulfilment_details').where('order_id', '=', orderId).execute();
    await db.deleteFrom('fulfilments').where('payment_intent_id', '=', intentId).execute();
    await db.deleteFrom('payment_intents').where('id', '=', intentId).execute();
  }
  await db.deleteFrom('order_timeline_events').where('order_id', '=', orderId).execute();
  await db.deleteFrom('transactions').where('id', '=', orderId).execute();
  if (shippingOptionId) await db.deleteFrom('listing_shipping_options').where('id', '=', shippingOptionId).execute();
  await db.deleteFrom('listings').where('id', '=', listingId).execute();
  await db.deleteFrom('users').where('id', 'in', [buyerId, sellerId]).execute();
  await closeDb();
}

console.log('Delivery and pickup database invariants passed.');
