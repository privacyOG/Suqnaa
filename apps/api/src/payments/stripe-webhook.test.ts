import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  stripePaymentFingerprint,
  verifyAndParseStripeWebhook
} from './stripe-webhook.js';

const timestamp = 1786180000;
const secret = 'whsec_1234567890abcdef';

function signedPayload(value: unknown) {
  const payload = Buffer.from(JSON.stringify(value), 'utf8');
  const signature = createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(`${timestamp}.`), payload]))
    .digest('hex');
  return { payload, signature };
}

const payment = signedPayload({
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
});
const event = verifyAndParseStripeWebhook({
  rawBody: payment.payload,
  signatureHeader: `t=${timestamp},v1=${payment.signature}`,
  webhookSecret: secret,
  nowMs: timestamp * 1000
});
assert.equal(event.type, 'payment_intent.succeeded');
if (event.type !== 'payment_intent.succeeded') throw new Error('unexpected event');
assert.equal(event.data.object.metadata.suqnaa_payment_intent_id, '123e4567-e89b-42d3-a456-426614174000');
assert.match(stripePaymentFingerprint(event), /^[a-f0-9]{64}$/);

const refund = signedPayload({
  id: 'evt_refund_1234567890',
  object: 'event',
  type: 'refund.updated',
  created: timestamp,
  livemode: false,
  data: {
    object: {
      id: 're_1234567890abcdef',
      object: 'refund',
      amount: 2500,
      currency: 'aud',
      payment_intent: 'pi_1234567890abcdef',
      charge: 'ch_1234567890abcdef',
      status: 'succeeded',
      metadata: {
        suqnaa_payment_operation_id: '523e4567-e89b-42d3-a456-426614174000'
      }
    }
  }
});
const refundEvent = verifyAndParseStripeWebhook({
  rawBody: refund.payload,
  signatureHeader: `t=${timestamp},v1=${refund.signature}`,
  webhookSecret: secret,
  nowMs: timestamp * 1000
});
assert.equal(refundEvent.type, 'refund.updated');
if (refundEvent.type !== 'refund.updated') throw new Error('unexpected refund event');
assert.equal(refundEvent.data.object.metadata.suqnaa_payment_operation_id, '523e4567-e89b-42d3-a456-426614174000');

const dispute = signedPayload({
  id: 'evt_dispute_1234567890',
  object: 'event',
  type: 'charge.dispute.created',
  created: timestamp,
  livemode: false,
  data: {
    object: {
      id: 'dp_1234567890abcdef',
      object: 'dispute',
      amount: 19995,
      currency: 'aud',
      charge: 'ch_1234567890abcdef'
    }
  }
});
const disputeEvent = verifyAndParseStripeWebhook({
  rawBody: dispute.payload,
  signatureHeader: `t=${timestamp},v1=${dispute.signature}`,
  webhookSecret: secret,
  nowMs: timestamp * 1000
});
assert.equal(disputeEvent.type, 'charge.dispute.created');

assert.throws(() => verifyAndParseStripeWebhook({
  rawBody: payment.payload,
  signatureHeader: `t=${timestamp},v1=${'0'.repeat(64)}`,
  webhookSecret: secret,
  nowMs: timestamp * 1000
}), /signature is invalid/);

assert.throws(() => verifyAndParseStripeWebhook({
  rawBody: payment.payload,
  signatureHeader: `t=${timestamp},v1=${payment.signature}`,
  webhookSecret: secret,
  nowMs: (timestamp + 301) * 1000
}), /outside tolerance/);
