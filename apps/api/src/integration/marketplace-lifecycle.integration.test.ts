import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { closeDb, db } from '../db/index.js';
import { authRoutes } from '../routes/auth.js';
import { marketActionRoutes } from '../routes/market-actions.js';
import { messageRoutes } from '../routes/messages.js';
import { offerWorkflowRoutes } from '../routes/offer-workflow.js';

const app = Fastify();
await app.register(authRoutes, { prefix: '/v1' });
await app.register(messageRoutes, { prefix: '/v1' });
await app.register(marketActionRoutes, { prefix: '/v1' });
await app.register(offerWorkflowRoutes, { prefix: '/v1' });

const runId = randomUUID();
const sellerEmail = `p1-15-seller-${runId}@example.test`;
const buyerEmail = `p1-15-buyer-${runId}@example.test`;
const password = 'P1-15-integration-password-123';
const listingId = randomUUID();
const clientMessageId = randomUUID();
const clientOfferId = randomUUID();
const clientOrderId = randomUUID();

let sellerId = '';
let buyerId = '';
let conversationId = '';
let messageId = '';
let offerId = '';
let orderId = '';
let paymentIntentId = '';

function authorization(accessToken: string) {
  return { authorization: `Bearer ${accessToken}`, 'user-agent': 'Suqnaa-P1-15-Integration/1.0' };
}

async function register(email: string, displayName: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    headers: { 'user-agent': 'Suqnaa-P1-15-Integration/1.0' },
    payload: { email, displayName, password }
  });
  assert.equal(response.statusCode, 201, response.body);
  const body = response.json();
  assert.ok(body.accessToken);
  assert.equal(body.user.email, email);
  return body as { accessToken: string; user: { id: string; email: string } };
}

try {
  const seller = await register(sellerEmail, 'P1-15 Seller');
  const buyer = await register(buyerEmail, 'P1-15 Buyer');
  sellerId = seller.user.id;
  buyerId = buyer.user.id;
  assert.notEqual(sellerId, buyerId);

  const persistedAccounts = await db.selectFrom('users')
    .select(['id', 'email', 'status'])
    .where('id', 'in', [sellerId, buyerId])
    .orderBy('email')
    .execute();
  assert.equal(persistedAccounts.length, 2);
  assert.ok(persistedAccounts.every((row) => row.status === 'active'));

  await db.insertInto('listings').values({
    id: listingId,
    seller_id: sellerId,
    title: 'P1-15 lifecycle listing',
    description: 'Database-backed cross-domain marketplace integration test listing.',
    price_amount: '120.00',
    currency_code: 'AUD',
    condition: 'good',
    availability_status: 'in_stock',
    available_quantity: 1,
    status: 'active',
    country_code: 'AU',
    region: 'NSW',
    city: 'Sydney',
    allow_pickup: true,
    allow_delivery: true,
    published_at: new Date(),
    updated_at: new Date()
  }).execute();

  const message = await app.inject({
    method: 'POST',
    url: '/v1/messages',
    headers: authorization(buyer.accessToken),
    payload: {
      recipientId: sellerId,
      listingId,
      body: 'Is this listing still available for purchase?',
      clientMessageId
    }
  });
  assert.equal(message.statusCode, 201, message.body);
  const messageBody = message.json();
  assert.equal(messageBody.idempotent, false);
  conversationId = messageBody.message.conversationId;
  messageId = messageBody.message.id;

  const persistedMessage = await db.selectFrom('messages')
    .innerJoin('conversations', 'conversations.id', 'messages.conversation_id')
    .select([
      'messages.id as message_id',
      'messages.sender_id as sender_id',
      'messages.client_message_id as client_message_id',
      'conversations.listing_id as listing_id',
      'conversations.buyer_id as buyer_id',
      'conversations.seller_id as seller_id'
    ])
    .where('messages.id', '=', messageId)
    .executeTakeFirstOrThrow();
  assert.equal(persistedMessage.sender_id, buyerId);
  assert.equal(persistedMessage.client_message_id, clientMessageId);
  assert.equal(persistedMessage.listing_id, listingId);
  assert.equal(persistedMessage.buyer_id, buyerId);
  assert.equal(persistedMessage.seller_id, sellerId);

  const offer = await app.inject({
    method: 'POST',
    url: '/v1/market/offers',
    headers: authorization(buyer.accessToken),
    payload: {
      listingId,
      amount: 110,
      currencyCode: 'AUD',
      message: 'Offering 110 AUD.',
      clientOfferId
    }
  });
  assert.equal(offer.statusCode, 201, offer.body);
  const offerBody = offer.json();
  assert.equal(offerBody.idempotent, false);
  assert.equal(offerBody.offer.status, 'pending');
  offerId = offerBody.offer.id;

  const idempotentOffer = await app.inject({
    method: 'POST',
    url: '/v1/market/offers',
    headers: authorization(buyer.accessToken),
    payload: { listingId, amount: 110, currencyCode: 'AUD', clientOfferId }
  });
  assert.equal(idempotentOffer.statusCode, 200, idempotentOffer.body);
  assert.equal(idempotentOffer.json().idempotent, true);
  assert.equal(idempotentOffer.json().offer.id, offerId);

  const accept = await app.inject({
    method: 'POST',
    url: `/v1/market/offers/${offerId}/status`,
    headers: authorization(seller.accessToken),
    payload: { status: 'accepted' }
  });
  assert.equal(accept.statusCode, 200, accept.body);
  assert.equal(accept.json().offer.status, 'accepted');

  const reservedListing = await db.selectFrom('listings')
    .select(['status'])
    .where('id', '=', listingId)
    .executeTakeFirstOrThrow();
  assert.equal(reservedListing.status, 'reserved');

  const order = await app.inject({
    method: 'POST',
    url: '/v1/market/orders',
    headers: authorization(buyer.accessToken),
    payload: { offerId, paymentMethod: 'card', clientOrderId }
  });
  assert.equal(order.statusCode, 201, order.body);
  const orderBody = order.json();
  assert.equal(orderBody.idempotent, false);
  assert.equal(orderBody.order.status, 'pending');
  assert.equal(orderBody.order.amount, '110.00');
  assert.equal(orderBody.order.currencyCode, 'AUD');
  assert.equal(orderBody.order.sellerId, sellerId);
  assert.equal(orderBody.order.buyerId, buyerId);
  orderId = orderBody.order.id;

  const idempotentOrder = await app.inject({
    method: 'POST',
    url: '/v1/market/orders',
    headers: authorization(buyer.accessToken),
    payload: { offerId, paymentMethod: 'card', clientOrderId }
  });
  assert.equal(idempotentOrder.statusCode, 200, idempotentOrder.body);
  assert.equal(idempotentOrder.json().idempotent, true);
  assert.equal(idempotentOrder.json().order.id, orderId);

  const persistedOrder = await db.selectFrom('transactions')
    .select(['id', 'offer_id', 'listing_id', 'buyer_id', 'seller_id', 'amount', 'currency_code', 'status'])
    .where('id', '=', orderId)
    .executeTakeFirstOrThrow();
  assert.equal(persistedOrder.offer_id, offerId);
  assert.equal(persistedOrder.listing_id, listingId);
  assert.equal(persistedOrder.buyer_id, buyerId);
  assert.equal(persistedOrder.seller_id, sellerId);
  assert.equal(Number(persistedOrder.amount).toFixed(2), '110.00');
  assert.equal(persistedOrder.currency_code, 'AUD');
  assert.equal(persistedOrder.status, 'pending');

  const paymentIntent = await db.selectFrom('payment_intents')
    .select(['id', 'transaction_id', 'amount', 'currency_code', 'status'])
    .where('transaction_id', '=', orderId)
    .executeTakeFirstOrThrow();
  paymentIntentId = String(paymentIntent.id);
  assert.equal(paymentIntent.transaction_id, orderId);
  assert.equal(Number(paymentIntent.amount).toFixed(2), '110.00');
  assert.equal(paymentIntent.currency_code, 'AUD');
  assert.equal(paymentIntent.status, 'created');

  console.log('P1-15 account/listing/message/offer/order database journey passed.');
} finally {
  await app.close();

  if (paymentIntentId) {
    await db.deleteFrom('payment_collection_sessions').where('payment_intent_id', '=', paymentIntentId).execute();
    await db.deleteFrom('payment_receipts').where('payment_intent_id', '=', paymentIntentId).execute();
    await db.deleteFrom('fulfilments').where('payment_intent_id', '=', paymentIntentId).execute();
    await db.deleteFrom('payment_intents').where('id', '=', paymentIntentId).execute();
  }
  if (orderId) await db.deleteFrom('transactions').where('id', '=', orderId).execute();
  if (offerId) await db.deleteFrom('offers').where('id', '=', offerId).execute();
  if (messageId) await db.deleteFrom('messages').where('id', '=', messageId).execute();
  if (conversationId) await db.deleteFrom('conversations').where('id', '=', conversationId).execute();
  await db.deleteFrom('listings').where('id', '=', listingId).execute();
  if (sellerId || buyerId) {
    const userIds = [sellerId, buyerId].filter(Boolean);
    await db.deleteFrom('refresh_sessions').where('user_id', 'in', userIds).execute();
    await db.deleteFrom('users').where('id', 'in', userIds).execute();
  }
  await closeDb();
}
