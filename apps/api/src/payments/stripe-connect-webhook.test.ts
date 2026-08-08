import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyAndParseStripeConnectWebhook } from './stripe-connect-webhook.js';

const secret = 'whsec_connect_1234567890abcdef';
const timestamp = 1786200000;
const event = {
  id: 'evt_test_12345678', object: 'event', created: timestamp, livemode: false,
  account: 'acct_test_12345678', type: 'payout.failed',
  data: { object: {
    id: 'po_test_12345678', object: 'payout', amount: 9250, currency: 'aud',
    status: 'failed', failure_code: 'account_closed'
  } }
};
const rawBody = Buffer.from(JSON.stringify(event));
const signature = createHmac('sha256', secret).update(Buffer.concat([
  Buffer.from(`${timestamp}.`), rawBody
])).digest('hex');

const parsed = verifyAndParseStripeConnectWebhook({
  rawBody,
  signatureHeader: `t=${timestamp},v1=${signature}`,
  webhookSecret: secret,
  nowMs: timestamp * 1000
});
assert.equal(parsed.type, 'payout.failed');
assert.equal(parsed.account, 'acct_test_12345678');

assert.throws(() => verifyAndParseStripeConnectWebhook({
  rawBody,
  signatureHeader: `t=${timestamp},v1=${'0'.repeat(64)}`,
  webhookSecret: secret,
  nowMs: timestamp * 1000
}), /signature is invalid/);
assert.throws(() => verifyAndParseStripeConnectWebhook({
  rawBody,
  signatureHeader: `t=${timestamp},v1=${signature}`,
  webhookSecret: secret,
  nowMs: (timestamp + 1000) * 1000
}), /outside tolerance/);

console.log('Stripe Connect webhook verification tests passed.');
