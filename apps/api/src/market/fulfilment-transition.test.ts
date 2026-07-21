import assert from 'node:assert/strict';
import { decideFulfilmentTransition } from './fulfilment-transition.js';

const paidContext = {
  orderStatus: 'paid' as const,
  paymentStatus: 'held' as const,
  providerConfigured: true
};

assert.deepEqual(
  decideFulfilmentTransition({
    ...paidContext,
    role: 'seller',
    action: 'ready_for_pickup',
    fulfilmentStatus: 'not_started'
  }),
  {
    allowed: true,
    unchanged: false,
    targetStatus: 'ready_for_pickup',
    reason: 'allowed'
  }
);

assert.deepEqual(
  decideFulfilmentTransition({
    ...paidContext,
    role: 'seller',
    action: 'shipped',
    fulfilmentStatus: 'not_started'
  }),
  {
    allowed: true,
    unchanged: false,
    targetStatus: 'shipped',
    reason: 'allowed'
  }
);

for (const fulfilmentStatus of [
  'ready_for_pickup',
  'shipped',
  'delivered'
] as const) {
  assert.deepEqual(
    decideFulfilmentTransition({
      ...paidContext,
      role: 'buyer',
      action: 'confirm_received',
      fulfilmentStatus
    }),
    {
      allowed: true,
      unchanged: false,
      targetStatus: 'received_confirmed',
      reason: 'allowed'
    }
  );
}

assert.equal(
  decideFulfilmentTransition({
    ...paidContext,
    role: 'buyer',
    action: 'ready_for_pickup',
    fulfilmentStatus: 'not_started'
  }).reason,
  'actor_not_allowed'
);
assert.equal(
  decideFulfilmentTransition({
    ...paidContext,
    role: 'seller',
    action: 'confirm_received',
    fulfilmentStatus: 'shipped'
  }).reason,
  'actor_not_allowed'
);
assert.equal(
  decideFulfilmentTransition({
    ...paidContext,
    role: 'buyer',
    action: 'confirm_received',
    fulfilmentStatus: 'not_started'
  }).reason,
  'invalid_fulfilment_state'
);
assert.equal(
  decideFulfilmentTransition({
    ...paidContext,
    orderStatus: 'pending',
    role: 'seller',
    action: 'shipped',
    fulfilmentStatus: 'not_started'
  }).reason,
  'order_not_paid'
);
assert.equal(
  decideFulfilmentTransition({
    ...paidContext,
    paymentStatus: 'created',
    role: 'seller',
    action: 'shipped',
    fulfilmentStatus: 'not_started'
  }).reason,
  'payment_not_held'
);
assert.equal(
  decideFulfilmentTransition({
    ...paidContext,
    providerConfigured: false,
    role: 'seller',
    action: 'shipped',
    fulfilmentStatus: 'not_started'
  }).reason,
  'provider_evidence_missing'
);

assert.deepEqual(
  decideFulfilmentTransition({
    ...paidContext,
    role: 'seller',
    action: 'shipped',
    fulfilmentStatus: 'shipped'
  }),
  {
    allowed: true,
    unchanged: true,
    targetStatus: 'shipped',
    reason: 'already_applied'
  }
);
assert.deepEqual(
  decideFulfilmentTransition({
    ...paidContext,
    role: 'buyer',
    action: 'confirm_received',
    fulfilmentStatus: 'received_confirmed'
  }),
  {
    allowed: true,
    unchanged: true,
    targetStatus: 'received_confirmed',
    reason: 'already_applied'
  }
);
