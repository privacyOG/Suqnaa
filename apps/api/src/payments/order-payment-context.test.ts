import assert from 'node:assert/strict';
import {
  assertOrderPaymentContextMatches,
  OrderPaymentContextError,
  paymentRailForOrderMethod,
  paymentStatusForOrderStatus,
  presentOrderPaymentContext
} from './order-payment-context.js';

const order = {
  id: '123e4567-e89b-42d3-a456-426614174000',
  buyerId: '223e4567-e89b-42d3-a456-426614174000',
  sellerId: '323e4567-e89b-42d3-a456-426614174000',
  listingId: '423e4567-e89b-42d3-a456-426614174000',
  amount: '80.00',
  currencyCode: 'AUD',
  status: 'pending' as const,
  paymentMethod: 'bank_transfer' as const
};

assert.deepEqual(
  [
    paymentRailForOrderMethod('card'),
    paymentRailForOrderMethod('bank_transfer'),
    paymentRailForOrderMethod('wallet'),
    paymentRailForOrderMethod('xmr')
  ],
  ['card', 'bank_transfer', 'wallet', 'crypto_xmr']
);

assert.deepEqual(
  [
    paymentStatusForOrderStatus('pending'),
    paymentStatusForOrderStatus('paid'),
    paymentStatusForOrderStatus('released'),
    paymentStatusForOrderStatus('refunded'),
    paymentStatusForOrderStatus('disputed'),
    paymentStatusForOrderStatus('cancelled')
  ],
  ['created', 'held', 'released', 'refunded', 'disputed', 'cancelled']
);

const intent = {
  id: '523e4567-e89b-42d3-a456-426614174000',
  transaction_id: order.id,
  buyer_id: order.buyerId,
  seller_id: order.sellerId,
  listing_id: order.listingId,
  rail: 'bank_transfer',
  status: 'created',
  amount: 80,
  currency_code: 'AUD',
  provider: null,
  provider_reference: null,
  expires_at: null,
  created_at: '2026-07-21T10:00:00.000Z',
  updated_at: '2026-07-21T10:00:00.000Z'
};
const fulfilment = {
  id: '623e4567-e89b-42d3-a456-426614174000',
  payment_intent_id: intent.id,
  status: 'not_started',
  created_at: '2026-07-21T10:00:00.000Z',
  updated_at: '2026-07-21T10:00:00.000Z'
};

assert.doesNotThrow(() => assertOrderPaymentContextMatches(intent, order));
assert.throws(
  () => assertOrderPaymentContextMatches(
    { ...intent, amount: '81.00' },
    order
  ),
  OrderPaymentContextError
);
assert.throws(
  () => assertOrderPaymentContextMatches(
    { ...intent, transaction_id: '723e4567-e89b-42d3-a456-426614174000' },
    order
  ),
  OrderPaymentContextError
);

const presented = presentOrderPaymentContext(intent, fulfilment);
assert.deepEqual(presented, {
  paymentIntent: {
    id: intent.id,
    rail: 'bank_transfer',
    status: 'created',
    providerConfigured: false,
    expiresAt: null,
    createdAt: intent.created_at,
    updatedAt: intent.updated_at
  },
  fulfilment: {
    id: fulfilment.id,
    status: 'not_started',
    createdAt: fulfilment.created_at,
    updatedAt: fulfilment.updated_at
  },
  releaseModel: 'hold_until_fulfilment_or_dispute_resolution',
  operations: {
    collectionEnabled: false,
    releaseEnabled: false
  }
});
assert.equal('provider' in presented.paymentIntent, false);
assert.equal('providerReference' in presented.paymentIntent, false);

const configured = presentOrderPaymentContext(
  { ...intent, provider: 'configured-provider', provider_reference: 'secret-ref' },
  fulfilment
);
assert.equal(configured.paymentIntent.providerConfigured, true);
assert.equal(JSON.stringify(configured).includes('secret-ref'), false);
