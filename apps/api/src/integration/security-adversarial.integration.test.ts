import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { closeDb, db } from '../db/index.js';
import { transformListingImage } from '../media/listing-image-transform.js';
import { verifyAndParseStripeWebhook } from '../payments/stripe-webhook.js';
import { authRoutes } from '../routes/auth.js';
import { marketActionRoutes } from '../routes/market-actions.js';
import { offerWorkflowRoutes } from '../routes/offer-workflow.js';

const app = Fastify();
await app.register(authRoutes, { prefix: '/v1' });
await app.register(marketActionRoutes, { prefix: '/v1' });
await app.register(offerWorkflowRoutes, { prefix: '/v1' });

const runId = randomUUID();
const password = 'P1-19-security-password-123';
const sellerEmail = `p1-19-seller-${runId}@example.test`;
const buyerEmail = `p1-19-buyer-${runId}@example.test`;
const attackerEmail = `p1-19-attacker-${runId}@example.test`;
const listingId = randomUUID();
const clientOfferId = randomUUID();
const userAgent = 'Suqnaa-P1-19-Security/1.0';
let userIds: string[] = [];
let offerId = '';

function authorization(accessToken: string) {
  return { authorization: `Bearer ${accessToken}`, 'user-agent': userAgent };
}

async function register(email: string, displayName: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    headers: { 'user-agent': userAgent },
    payload: { email, displayName, password }
  });
  assert.equal(response.statusCode, 201, response.body);
  const raw = response.body;
  assert.equal(raw.includes(password), false, 'registration response leaked plaintext password');
  assert.equal(raw.includes('password_hash'), false, 'registration response leaked password hash field');
  assert.equal(raw.includes('token_hash'), false, 'registration response leaked refresh-token hash field');
  assert.equal(raw.includes('DATABASE_URL'), false, 'registration response leaked environment metadata');
  const body = response.json() as {
    accessToken: string;
    user: { id: string; email: string };
    session: { refreshToken: string; sessionId: string };
  };
  assert.ok(body.accessToken);
  assert.ok(body.session.refreshToken);
  return body;
}

function expectSafeFailureBody(body: string): void {
  assert.equal(body.includes('password_hash'), false);
  assert.equal(body.includes('token_hash'), false);
  assert.equal(body.includes('JWT_ACCESS_SECRET'), false);
  assert.equal(body.includes('DATABASE_URL'), false);
  assert.equal(body.includes('SELECT '), false);
  assert.equal(body.includes('stack'), false);
}

try {
  const seller = await register(sellerEmail, 'Security Seller');
  const buyer = await register(buyerEmail, 'Security Buyer');
  const attacker = await register(attackerEmail, 'Security Attacker');
  userIds = [seller.user.id, buyer.user.id, attacker.user.id];

  await db.updateTable('users')
    .set({ status: 'active', email_verified_at: new Date(), updated_at: new Date() })
    .where('id', 'in', userIds)
    .execute();

  await db.insertInto('listings').values({
    id: listingId,
    seller_id: seller.user.id,
    title: 'P1-19 authorization boundary listing',
    description: 'Synthetic adversarial security-test fixture.',
    price_amount: '125.00',
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

  // Authorization boundary: a third-party account cannot manage another seller's offer.
  const createOffer = await app.inject({
    method: 'POST',
    url: '/v1/market/offers',
    headers: authorization(buyer.accessToken),
    payload: { listingId, amount: 110, currencyCode: 'AUD', clientOfferId }
  });
  assert.equal(createOffer.statusCode, 201, createOffer.body);
  offerId = createOffer.json().offer.id;

  const attackerDecision = await app.inject({
    method: 'POST',
    url: `/v1/market/offers/${offerId}/status`,
    headers: authorization(attacker.accessToken),
    payload: { status: 'accepted' }
  });
  assert.equal(attackerDecision.statusCode, 404, attackerDecision.body);
  expectSafeFailureBody(attackerDecision.body);

  const sellerCancel = await app.inject({
    method: 'POST',
    url: `/v1/market/offers/${offerId}/cancel`,
    headers: authorization(seller.accessToken)
  });
  assert.equal(sellerCancel.statusCode, 404, sellerCancel.body);
  expectSafeFailureBody(sellerCancel.body);

  const persistedOffer = await db.selectFrom('offers')
    .select(['id', 'buyer_id', 'status'])
    .where('id', '=', offerId)
    .executeTakeFirstOrThrow();
  assert.equal(persistedOffer.buyer_id, buyer.user.id);
  assert.equal(persistedOffer.status, 'pending');

  // Replay/idempotency: duplicate business command creates no duplicate durable object.
  const offerReplay = await app.inject({
    method: 'POST',
    url: '/v1/market/offers',
    headers: authorization(buyer.accessToken),
    payload: { listingId, amount: 110, currencyCode: 'AUD', clientOfferId }
  });
  assert.equal(offerReplay.statusCode, 200, offerReplay.body);
  assert.equal(offerReplay.json().idempotent, true);
  assert.equal(offerReplay.json().offer.id, offerId);
  const duplicateCount = await db.selectFrom('offers')
    .select(({ fn }) => fn.countAll<number>().as('count'))
    .where('buyer_id', '=', buyer.user.id)
    .where('client_offer_id', '=', clientOfferId)
    .executeTakeFirstOrThrow();
  assert.equal(Number(duplicateCount.count), 1);

  // Session abuse: refresh tokens are single-use even when two refreshes race.
  const firstRefresh = await app.inject({
    method: 'POST', url: '/v1/auth/refresh', headers: { 'user-agent': userAgent },
    payload: { refreshToken: buyer.session.refreshToken }
  });
  assert.equal(firstRefresh.statusCode, 200, firstRefresh.body);
  const rotatedToken = firstRefresh.json().session.refreshToken as string;

  const replayedRefresh = await app.inject({
    method: 'POST', url: '/v1/auth/refresh', headers: { 'user-agent': userAgent },
    payload: { refreshToken: buyer.session.refreshToken }
  });
  assert.equal(replayedRefresh.statusCode, 401, replayedRefresh.body);
  expectSafeFailureBody(replayedRefresh.body);

  const racing = await Promise.all([
    app.inject({ method: 'POST', url: '/v1/auth/refresh', headers: { 'user-agent': userAgent }, payload: { refreshToken: rotatedToken } }),
    app.inject({ method: 'POST', url: '/v1/auth/refresh', headers: { 'user-agent': userAgent }, payload: { refreshToken: rotatedToken } })
  ]);
  assert.deepEqual(racing.map((response) => response.statusCode).sort(), [200, 401]);

  // Injection probes are rejected by schema validation before reaching SQL semantics.
  const accountCountBefore = await db.selectFrom('users')
    .select(({ fn }) => fn.countAll<number>().as('count'))
    .executeTakeFirstOrThrow();
  const injectionLogin = await app.inject({
    method: 'POST',
    url: '/v1/auth/login',
    headers: { 'user-agent': userAgent },
    payload: { phone: "+61412' OR 1=1--", password: 'irrelevant-password' }
  });
  assert.equal(injectionLogin.statusCode, 400, injectionLogin.body);
  expectSafeFailureBody(injectionLogin.body);
  const accountCountAfter = await db.selectFrom('users')
    .select(({ fn }) => fn.countAll<number>().as('count'))
    .executeTakeFirstOrThrow();
  assert.equal(Number(accountCountAfter.count), Number(accountCountBefore.count));

  const pathInjection = await app.inject({
    method: 'POST',
    url: `/v1/market/offers/${encodeURIComponent("' OR 1=1 --")}/status`,
    headers: authorization(attacker.accessToken),
    payload: { status: 'accepted' }
  });
  assert.equal(pathInjection.statusCode, 400, pathInjection.body);
  expectSafeFailureBody(pathInjection.body);

  // Upload attack probes: malformed/polyglot-like bytes must never produce derivatives.
  const hostileUpload = Buffer.from('<svg><script>alert(1)</script></svg>PK\u0003\u0004not-an-image', 'utf8');
  await assert.rejects(
    () => transformListingImage({
      buffer: hostileUpload,
      mimeType: 'image/png',
      width: 1024,
      height: 768,
      orientation: null
    })
  );

  // Webhook validation: tampering, stale timestamps and malformed payloads are rejected.
  const webhookSecret = 'whsec_p1_19_security_123456789012345';
  const now = Math.floor(Date.now() / 1000);
  const webhookEvent = {
    id: 'evt_security12345', object: 'event', created: now, livemode: false,
    type: 'payment_intent.succeeded',
    data: { object: {
      id: 'pi_security12345', object: 'payment_intent', amount: 11000, amount_received: 11000,
      currency: 'aud', status: 'succeeded', latest_charge: 'ch_security12345',
      transfer_group: 'security-order', receipt_email: null,
      metadata: {
        suqnaa_order_id: randomUUID(), suqnaa_payment_intent_id: randomUUID(),
        suqnaa_listing_id: listingId, suqnaa_seller_id: seller.user.id
      }
    } }
  };
  const webhookBody = Buffer.from(JSON.stringify(webhookEvent));
  const signature = createHmac('sha256', webhookSecret).update(`${now}.`).update(webhookBody).digest('hex');
  const validHeader = `t=${now},v1=${signature}`;
  const parsed = verifyAndParseStripeWebhook({ rawBody: webhookBody, signatureHeader: validHeader, webhookSecret, nowMs: now * 1000 });
  assert.equal(parsed.id, webhookEvent.id);

  assert.throws(() => verifyAndParseStripeWebhook({
    rawBody: Buffer.from(`${webhookBody.toString('utf8')} `),
    signatureHeader: validHeader,
    webhookSecret,
    nowMs: now * 1000
  }));

  const staleTimestamp = now - 3600;
  const staleSignature = createHmac('sha256', webhookSecret).update(`${staleTimestamp}.`).update(webhookBody).digest('hex');
  assert.throws(() => verifyAndParseStripeWebhook({
    rawBody: webhookBody,
    signatureHeader: `t=${staleTimestamp},v1=${staleSignature}`,
    webhookSecret,
    nowMs: now * 1000
  }));

  const malformedBody = Buffer.from('{"id":');
  const malformedSignature = createHmac('sha256', webhookSecret).update(`${now}.`).update(malformedBody).digest('hex');
  assert.throws(() => verifyAndParseStripeWebhook({
    rawBody: malformedBody,
    signatureHeader: `t=${now},v1=${malformedSignature}`,
    webhookSecret,
    nowMs: now * 1000
  }));

  console.log('P1-19 adversarial API security suite passed.');
} finally {
  await app.close();
  if (offerId) await db.deleteFrom('offers').where('id', '=', offerId).execute();
  await db.deleteFrom('listings').where('id', '=', listingId).execute();
  if (userIds.length > 0) {
    await db.deleteFrom('refresh_sessions').where('user_id', 'in', userIds).execute();
    await db.deleteFrom('users').where('id', 'in', userIds).execute();
  }
  await closeDb();
}
