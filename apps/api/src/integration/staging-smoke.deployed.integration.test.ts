import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { Pool } from 'pg';

const apiBaseUrl = (process.env.STAGING_API_BASE_URL ?? '').replace(/\/+$/, '');
const databaseUrl = process.env.STAGING_DATABASE_URL ?? '';
const paymentProvider = process.env.PAYMENT_EVENT_PROVIDER ?? '';
const paymentSigningSecret = process.env.PAYMENT_EVENT_SIGNING_SECRET ?? '';

assert.ok(apiBaseUrl, 'STAGING_API_BASE_URL is required');
assert.ok(databaseUrl, 'STAGING_DATABASE_URL is required');
assert.match(paymentProvider, /^[a-z0-9][a-z0-9_-]{1,39}$/);
assert.ok(paymentSigningSecret.length >= 32, 'PAYMENT_EVENT_SIGNING_SECRET must be configured');

const runId = randomUUID();
const password = 'L01-staging-smoke-password-123';
const userAgent = 'Suqnaa-L01-Staging-Smoke/1.0';
const pool = new Pool({ connectionString: databaseUrl, max: 2 });

type Session = {
  accessToken: string;
  user: { id: string; email: string };
};

type RequestOptions = {
  method?: string;
  token?: string;
  payload?: unknown;
  headers?: Record<string, string>;
  expectedStatus?: number;
};

async function request(path: string, options: RequestOptions = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'user-agent': userAgent,
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...(options.payload === undefined ? {} : { 'content-type': 'application/json' }),
      ...options.headers
    },
    body: options.payload === undefined ? undefined : JSON.stringify(options.payload)
  });

  const raw = await response.text();
  const body = raw ? JSON.parse(raw) : null;
  const expectedStatus = options.expectedStatus ?? 200;
  assert.equal(
    response.status,
    expectedStatus,
    `${options.method ?? 'GET'} ${path} returned ${response.status}: ${raw}`
  );
  return body;
}

async function register(label: string): Promise<Session> {
  const email = `l01-${label}-${runId}@example.test`;
  const body = await request('/v1/auth/register', {
    method: 'POST',
    expectedStatus: 201,
    payload: {
      email,
      displayName: `L-01 ${label}`,
      password
    }
  }) as Session;
  assert.ok(body.accessToken);
  assert.equal(body.user.email, email);
  return body;
}

function paymentSignature(input: {
  provider: string;
  eventId: string;
  timestamp: string;
  event: {
    type: 'payment.held';
    paymentIntentId: string;
    providerReference: string;
    amount: string;
    currencyCode: string;
    occurredAt: string;
  };
}): string {
  return createHmac('sha256', paymentSigningSecret)
    .update([
      'suqnaa-payment-event-v1',
      input.provider,
      input.eventId,
      input.timestamp,
      input.event.type,
      input.event.paymentIntentId,
      input.event.providerReference,
      input.event.amount,
      input.event.currencyCode,
      input.event.occurredAt
    ].join('\n'))
    .digest('hex');
}

try {
  const readiness = await request('/v1/health/ready') as { ok: boolean; status: string };
  assert.equal(readiness.ok, true);
  assert.equal(readiness.status, 'ready');

  const seller = await register('Seller');
  const buyer = await register('Buyer');
  const operator = await register('Operator');
  const accountIds = [seller.user.id, buyer.user.id, operator.user.id];

  await pool.query(
    `update users
       set status = 'active', email_verified_at = now(), updated_at = now()
     where id = any($1::uuid[])`,
    [accountIds]
  );

  const role = await pool.query<{ id: string }>(
    `select id from admin_roles where role_key = 'platform_admin'`
  );
  assert.equal(role.rowCount, 1, 'platform_admin role must exist in staging');
  await pool.query(
    `insert into admin_role_assignments(user_id, role_id, granted_by)
     values ($1::uuid, $2::uuid, $1::uuid)
     on conflict do nothing`,
    [operator.user.id, role.rows[0].id]
  );

  const permissions = await pool.query<{ permission_key: string }>(
    `select permission.permission_key
       from admin_role_assignments assignment
       join admin_role_permissions permission on permission.role_id = assignment.role_id
      where assignment.user_id = $1::uuid
        and assignment.revoked_at is null`,
    [operator.user.id]
  );
  const permissionSet = new Set(permissions.rows.map((row) => row.permission_key));
  for (const required of [
    'operations.access',
    'moderation.listing.manage',
    'disputes.read',
    'disputes.review'
  ]) {
    assert.equal(permissionSet.has(required), true, `platform_admin missing ${required}`);
  }

  const listingCreate = await request('/v1/listings', {
    method: 'POST',
    token: seller.accessToken,
    expectedStatus: 201,
    payload: {
      title: 'L-01 staging smoke listing',
      description: 'Synthetic production-like staging listing used only for automated launch smoke validation.',
      priceAmount: 110,
      currencyCode: 'AUD',
      condition: 'good',
      availabilityStatus: 'in_stock',
      availableQuantity: 1,
      countryCode: 'AU',
      region: 'NSW',
      city: 'Sydney',
      allowPickup: true,
      allowDelivery: false
    }
  }) as { listing: { id: string; status: string } };
  const listingId = listingCreate.listing.id;
  assert.equal(listingCreate.listing.status, 'draft');

  const listingPublish = await request(`/v1/listings/${listingId}/status`, {
    method: 'POST',
    token: seller.accessToken,
    payload: { status: 'active' }
  }) as { listing: { status: string } };
  assert.equal(listingPublish.listing.status, 'active');

  const message = await request('/v1/messages', {
    method: 'POST',
    token: buyer.accessToken,
    expectedStatus: 201,
    payload: {
      recipientId: seller.user.id,
      listingId,
      body: 'L-01 staging smoke: is this item available?',
      clientMessageId: randomUUID()
    }
  }) as { idempotent: boolean; message: { id: string; conversationId: string } };
  assert.equal(message.idempotent, false);
  assert.ok(message.message.id);
  assert.ok(message.message.conversationId);

  const offer = await request('/v1/market/offers', {
    method: 'POST',
    token: buyer.accessToken,
    expectedStatus: 201,
    payload: {
      listingId,
      amount: 110,
      currencyCode: 'AUD',
      message: 'L-01 staging smoke offer.',
      clientOfferId: randomUUID()
    }
  }) as { offer: { id: string; status: string } };
  assert.equal(offer.offer.status, 'pending');

  const acceptedOffer = await request(`/v1/market/offers/${offer.offer.id}/status`, {
    method: 'POST',
    token: seller.accessToken,
    payload: { status: 'accepted' }
  }) as { offer: { status: string } };
  assert.equal(acceptedOffer.offer.status, 'accepted');

  const order = await request('/v1/market/orders', {
    method: 'POST',
    token: buyer.accessToken,
    expectedStatus: 201,
    payload: {
      offerId: offer.offer.id,
      paymentMethod: 'card',
      clientOrderId: randomUUID()
    }
  }) as {
    order: { id: string; status: string; amount: string; currencyCode: string };
  };
  const orderId = order.order.id;
  assert.equal(order.order.status, 'pending');
  assert.equal(order.order.amount, '110.00');
  assert.equal(order.order.currencyCode, 'AUD');

  const delivery = await request(`/v1/market/orders/${orderId}/delivery`, {
    method: 'POST',
    token: buyer.accessToken,
    payload: { mode: 'pickup' }
  }) as { accepted: boolean; mode: string; totalAmount: string };
  assert.equal(delivery.accepted, true);
  assert.equal(delivery.mode, 'pickup');
  assert.equal(delivery.totalAmount, '110.00');

  const checkout = await request('/v1/payments/protected-checkout', {
    method: 'POST',
    token: buyer.accessToken,
    payload: { orderId, locale: 'en' }
  }) as { accepted: boolean; order: { id: string; status: string } };
  assert.equal(checkout.accepted, true);
  assert.equal(checkout.order.id, orderId);
  assert.equal(checkout.order.status, 'pending');

  const paymentContext = await request(`/v1/market/orders/${orderId}/payment-context`, {
    token: buyer.accessToken
  }) as {
    paymentContext: {
      paymentIntent: { id: string; status: string };
      fulfilment: { status: string };
    };
  };
  assert.equal(paymentContext.paymentContext.paymentIntent.status, 'created');
  assert.equal(paymentContext.paymentContext.fulfilment.status, 'not_started');

  const occurredAt = new Date().toISOString();
  const eventId = `l01-${runId}`;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const providerReference = `sandbox_${runId.replaceAll('-', '')}`;
  const paymentEvent = {
    type: 'payment.held' as const,
    paymentIntentId: paymentContext.paymentContext.paymentIntent.id,
    providerReference,
    amount: '110.00',
    currencyCode: 'AUD',
    occurredAt
  };
  const signature = paymentSignature({
    provider: paymentProvider,
    eventId,
    timestamp,
    event: paymentEvent
  });

  const held = await request('/v1/payments/provider-events', {
    method: 'POST',
    payload: paymentEvent,
    headers: {
      'x-suqnaa-payment-provider': paymentProvider,
      'x-suqnaa-payment-event-id': eventId,
      'x-suqnaa-payment-event-timestamp': timestamp,
      'x-suqnaa-payment-signature': signature
    }
  }) as {
    accepted: boolean;
    appliedState: { orderId: string; orderStatus: string; paymentStatus: string };
  };
  assert.equal(held.accepted, true);
  assert.equal(held.appliedState.orderId, orderId);
  assert.equal(held.appliedState.orderStatus, 'paid');
  assert.equal(held.appliedState.paymentStatus, 'held');

  await request(`/v1/market/orders/${orderId}/pickup-details`, {
    method: 'POST',
    token: seller.accessToken,
    payload: {
      address: {
        line1: '1 Staging Smoke Street',
        locality: 'Sydney',
        region: 'NSW',
        postalCode: '2000',
        countryCode: 'AU'
      },
      instructions: 'Synthetic staging pickup location only.'
    }
  });

  const readyForPickup = await request(`/v1/market/orders/${orderId}/fulfilment`, {
    method: 'POST',
    token: seller.accessToken,
    payload: { action: 'ready_for_pickup' }
  }) as { fulfilment: { status: string } };
  assert.equal(readyForPickup.fulfilment.status, 'ready_for_pickup');

  const pickupProof = await request(`/v1/market/orders/${orderId}/pickup-proof`, {
    method: 'POST',
    token: buyer.accessToken
  }) as { pickupProof: { code: string } };
  assert.ok(pickupProof.pickupProof.code);

  const delivered = await request(`/v1/market/orders/${orderId}/pickup-proof/verify`, {
    method: 'POST',
    token: seller.accessToken,
    payload: { code: pickupProof.pickupProof.code }
  }) as { status: string };
  assert.equal(delivered.status, 'delivered');

  const received = await request(`/v1/market/orders/${orderId}/fulfilment`, {
    method: 'POST',
    token: buyer.accessToken,
    payload: { action: 'confirm_received' }
  }) as { fulfilment: { status: string } };
  assert.equal(received.fulfilment.status, 'received_confirmed');

  const moderationListingCreate = await request('/v1/listings', {
    method: 'POST',
    token: seller.accessToken,
    expectedStatus: 201,
    payload: {
      title: 'L-01 moderation smoke listing',
      description: 'Synthetic listing dedicated to staging moderation smoke validation.',
      priceAmount: 25,
      currencyCode: 'AUD',
      condition: 'good',
      availabilityStatus: 'in_stock',
      availableQuantity: 1,
      countryCode: 'AU',
      region: 'NSW',
      city: 'Sydney',
      allowPickup: true,
      allowDelivery: false
    }
  }) as { listing: { id: string } };
  const moderationListingId = moderationListingCreate.listing.id;
  await request(`/v1/listings/${moderationListingId}/status`, {
    method: 'POST',
    token: seller.accessToken,
    payload: { status: 'active' }
  });

  const moderation = await request(`/v1/operations/moderation/listings/${moderationListingId}/action`, {
    method: 'POST',
    token: operator.accessToken,
    payload: {
      action: 'takedown',
      reasonCode: 'staging.smoke',
      reason: 'L-01 production-like staging moderation smoke validation.'
    }
  }) as { actionId: string; status: string };
  assert.ok(moderation.actionId);
  assert.equal(moderation.status, 'removed');

  const dispute = await request('/v1/market/disputes', {
    method: 'POST',
    token: buyer.accessToken,
    expectedStatus: 201,
    payload: {
      orderId,
      category: 'pickup_issue',
      reason: 'L-01 staging smoke dispute opened to verify the deployed participant and operations workflow.',
      summary: 'Synthetic staging smoke dispute.'
    }
  }) as { dispute: { id: string; status: string } };
  assert.equal(dispute.dispute.status, 'awaiting_seller');

  const disputeResponse = await request(`/v1/market/disputes/${dispute.dispute.id}/responses`, {
    method: 'POST',
    token: seller.accessToken,
    expectedStatus: 201,
    payload: {
      responseText: 'Seller response for the L-01 staging smoke dispute workflow.'
    }
  }) as { status: string };
  assert.equal(disputeResponse.status, 'under_review');

  const review = await request(`/v1/operations/disputes/${dispute.dispute.id}/review`, {
    method: 'POST',
    token: operator.accessToken,
    payload: {
      requestFrom: null,
      note: 'L-01 staging smoke operations review.'
    }
  }) as { status: string; assignedToUserId: string };
  assert.equal(review.status, 'under_review');
  assert.equal(review.assignedToUserId, operator.user.id);

  const disputeDetail = await request(`/v1/operations/disputes/${dispute.dispute.id}`, {
    token: operator.accessToken
  }) as { dispute: { id: string; status: string; assignedToUserId: string } };
  assert.equal(disputeDetail.dispute.id, dispute.dispute.id);
  assert.equal(disputeDetail.dispute.status, 'under_review');
  assert.equal(disputeDetail.dispute.assignedToUserId, operator.user.id);

  const persisted = await pool.query<{
    order_status: string;
    payment_status: string;
    fulfilment_status: string;
  }>(
    `select transaction.status as order_status,
            intent.status as payment_status,
            fulfilment.status as fulfilment_status
       from transactions transaction
       join payment_intents intent on intent.transaction_id = transaction.id
       join fulfilments fulfilment on fulfilment.payment_intent_id = intent.id
      where transaction.id = $1::uuid`,
    [orderId]
  );
  assert.equal(persisted.rowCount, 1);
  assert.equal(persisted.rows[0].order_status, 'paid');
  assert.equal(persisted.rows[0].payment_status, 'held');
  assert.equal(persisted.rows[0].fulfilment_status, 'received_confirmed');

  console.log('L-01 deployed staging smoke journey passed: registration -> listing -> messaging -> offer -> order -> sandbox payment -> fulfilment -> moderation -> dispute.');
} finally {
  await pool.end();
}
