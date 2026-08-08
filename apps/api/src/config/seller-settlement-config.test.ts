import assert from 'node:assert/strict';
import { resolveSellerSettlementConfiguration } from './seller-settlement-config.js';

const disabled = resolveSellerSettlementConfiguration({ enabled: 'false' });
assert.equal(disabled.enabled, false);
assert.equal(disabled.liveApproved, false);
assert.equal(disabled.commissionBps, 0);

assert.throws(() => resolveSellerSettlementConfiguration({
  enabled: 'true',
  connectWebhookSecret: 'whsec_1234567890abcdef'
}), /SELLER_SETTLEMENT_COMMISSION_BPS/);

const enabled = resolveSellerSettlementConfiguration({
  enabled: 'true',
  liveApproved: 'false',
  commissionBps: '750',
  settlementDelayDays: '2',
  payoutInterval: 'weekly',
  payoutAnchor: 'friday',
  connectWebhookSecret: 'whsec_1234567890abcdef'
});
assert.equal(enabled.enabled, true);
assert.equal(enabled.commissionBps, 750);
assert.equal(enabled.settlementDelayDays, 2);
assert.equal(enabled.payoutInterval, 'weekly');
assert.equal(enabled.payoutAnchor, 'friday');

assert.throws(() => resolveSellerSettlementConfiguration({
  enabled: 'true', commissionBps: '750', settlementDelayDays: '2',
  payoutInterval: 'weekly', payoutAnchor: 'sunday',
  connectWebhookSecret: 'whsec_1234567890abcdef'
}), /Monday-Friday/);
assert.throws(() => resolveSellerSettlementConfiguration({
  enabled: 'true', commissionBps: '5001', settlementDelayDays: '2',
  payoutInterval: 'weekly', payoutAnchor: 'monday',
  connectWebhookSecret: 'whsec_1234567890abcdef'
}), /between 0 and 5000/);

console.log('Seller settlement configuration tests passed.');
