import assert from 'node:assert/strict';
import {
  canPrepareCheckout,
  checkoutNextActionMessage
} from './checkout-presentation';

assert.equal(canPrepareCheckout('buyer', 'pending'), true);
assert.equal(canPrepareCheckout('seller', 'pending'), false);
assert.equal(canPrepareCheckout('buyer', 'paid'), false);

assert.equal(
  checkoutNextActionMessage('configure_card_provider', false),
  'Card processing must be configured before payment can begin.'
);
assert.equal(
  checkoutNextActionMessage('configure_bank_transfer_instructions', true),
  'يجب إعداد تعليمات التحويل البنكي قبل بدء الدفع.'
);
assert.equal(
  checkoutNextActionMessage('configure_wallet_provider', false),
  'Wallet processing must be configured before payment can begin.'
);
assert.equal(
  checkoutNextActionMessage('configure_xmr_payment_address', true),
  'يجب إعداد عنوان الدفع قبل بدء الدفع.'
);
