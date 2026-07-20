import assert from 'node:assert/strict';
import {
  checkoutPaymentMethods,
  prepareOrderCheckout,
  type CheckoutNextAction
} from './checkout-preparation.js';

const expectedActions: Record<string, CheckoutNextAction> = {
  card: 'configure_card_provider',
  bank_transfer: 'configure_bank_transfer_instructions',
  wallet: 'configure_wallet_provider',
  xmr: 'configure_xmr_payment_address'
};

for (const paymentMethod of checkoutPaymentMethods) {
  const checkout = prepareOrderCheckout({
    id: '123e4567-e89b-42d3-a456-426614174000',
    listingId: '223e4567-e89b-42d3-a456-426614174000',
    amount: '199.95',
    currencyCode: 'AUD',
    status: 'pending',
    paymentMethod
  });

  assert.equal(checkout.accepted, true);
  assert.equal(checkout.status, 'configuration_required');
  assert.equal(checkout.payment.provider, null);
  assert.equal(checkout.payment.nextAction, expectedActions[paymentMethod]);
  assert.equal(checkout.order.amount, '199.95');
  assert.equal(checkout.order.currencyCode, 'AUD');
  assert.equal(
    checkout.releaseModel,
    'hold_until_fulfilment_or_dispute_resolution'
  );
  assert.equal('buyerId' in checkout.order, false);
  assert.equal('sellerId' in checkout.order, false);
}
