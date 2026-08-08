import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  stripePaymentFingerprint,
  verifyAndParseStripeWebhook
} from './stripe-webhook.js';

const timestamp = 1786180000;
const secret = 'whsec_1234567890abcdef';
const payload = Buffer.from(JSON.stringify({
  id: 'evt_1234567890abcdef',
  object: 'event',
  type: 'payment_intent.succeeded',
  created: timestamp,
  livemode: false,
  data: {
    object: {
      id: 'pi_1234567890abcdef',
      object: 'payment_intent',
      amount: 19995,
      amount_received: 19995,
      currency: 'aud',
      status: 'succeeded',
      latest_charge: 'ch_1234567890abcdef',
      transfer_group: 'suqnaa_order_223e4567-e89b-42d3-a456-426614174000',
      receipt_email: 'buyer@example.test',
      metadata: {
        suqnaa_order_id: '223e4567-e89b-42d3-a456-426614174000',
        suqnaa_payment_intent_id: '123e4567-e89b-42d3-a456-426614174000',
        suqnaa_listing_id: '323e4567-e89b-42d3-a456-426614174000',
        suqnaa_seller_id: '423e4567-e89b-42d3-a456-426614174000'
      }
    }
  }
}), 'utf8');
const signature = createHmac('sha256', secret)
  .update(Buffer.concat([Buffer.from(`${timestamp}.`), payload]))
  .digest('hex');

const event = verifyAndParseStripeWebhook({
  rawBody: payload,
  signatureHeader: `t=${timestamp},v1=${signature}`,
  webhookSecret: secret,
  nowMs: timestamp * 1000
});
assert.equal(event.data.object.id, 'pi_1234567890abcdef');
assert.equal(event.data.object.metadata.suqnaa_payment_intent_id, '123e4567-e89b-42d3-a456-426614174000');
assert.match(stripePaymentFingerprint(event), /^[a-f0-9]{64}$/);

assert.throws(() => verifyAndParseStripeWebhook({
  rawBody: payload,
  signatureHeader: `t=${timestamp},v1=${'0'.repeat(64)}`,
  webhookSecret: secret,
  nowMs: timestamp * 1000
}), /signature is invalid/);

assert.throws(() => verifyAndParseStripeWebhook({
  rawBody: payload,
  signatureHeader: `t=${timestamp},v1=${signature}`,
  webhookSecret: secret,
  nowMs: (timestamp + 301) * 1000
}), /outside tolerance/);
