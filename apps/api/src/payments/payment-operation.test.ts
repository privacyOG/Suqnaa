import assert from 'node:assert/strict';
import {
  PaymentOperationError,
  normalizeOperationAmount,
  operationRequiresProviderRefund,
  targetPaymentStatusForOperation,
  validateOperationInput
} from './payment-operation.js';

assert.equal(normalizeOperationAmount('10'), '10.00');
assert.equal(normalizeOperationAmount('10.5'), '10.50');
assert.deepEqual(
  validateOperationInput({ kind: 'refund_partial', amount: '12.34', reason: 'Customer agreed partial refund.' }),
  { amount: '12.34', reason: 'Customer agreed partial refund.' }
);
assert.throws(
  () => validateOperationInput({ kind: 'refund_partial', reason: 'Missing amount reason' }),
  (error: unknown) => error instanceof PaymentOperationError && error.code === 'amount_required'
);
assert.throws(
  () => validateOperationInput({ kind: 'release', amount: '1.00', reason: 'Release is approved for settlement.' }),
  (error: unknown) => error instanceof PaymentOperationError && error.code === 'amount_not_allowed'
);
assert.equal(operationRequiresProviderRefund('release'), false);
assert.equal(operationRequiresProviderRefund('refund_full'), true);
assert.equal(operationRequiresProviderRefund('refund_partial'), true);
assert.equal(operationRequiresProviderRefund('cancel_after_payment'), true);
assert.equal(operationRequiresProviderRefund('chargeback'), false);
assert.equal(targetPaymentStatusForOperation('release'), 'released');
assert.equal(targetPaymentStatusForOperation('refund_full'), 'refunded');
assert.equal(targetPaymentStatusForOperation('refund_partial'), 'held');
assert.equal(targetPaymentStatusForOperation('refund_partial', true), 'refunded');
assert.equal(targetPaymentStatusForOperation('chargeback'), 'disputed');
assert.equal(targetPaymentStatusForOperation('compliance_hold'), 'compliance_hold');
