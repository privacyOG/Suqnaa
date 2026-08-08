import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

const uuid = z.string().uuid();

const stripePaymentIntentObject = z.object({
  id: z.string().regex(/^pi_[A-Za-z0-9_]{8,}$/),
  object: z.literal('payment_intent'),
  amount: z.number().int().positive(),
  amount_received: z.number().int().nonnegative(),
  currency: z.string().length(3),
  status: z.literal('succeeded'),
  latest_charge: z.string().regex(/^ch_[A-Za-z0-9_]{8,}$/),
  transfer_group: z.string().min(1).max(255),
  receipt_email: z.string().email().nullable().optional(),
  metadata: z.object({
    suqnaa_order_id: uuid,
    suqnaa_payment_intent_id: uuid,
    suqnaa_listing_id: uuid,
    suqnaa_seller_id: uuid
  }).passthrough()
}).passthrough();

const stripeEventSchema = z.object({
  id: z.string().regex(/^evt_[A-Za-z0-9_]{8,}$/),
  object: z.literal('event'),
  type: z.literal('payment_intent.succeeded'),
  created: z.number().int().positive(),
  livemode: z.boolean(),
  data: z.object({
    object: stripePaymentIntentObject
  })
}).passthrough();

export type StripePaymentSucceededEvent = z.infer<typeof stripeEventSchema>;

function parseSignatureHeader(value: string): { timestamp: number; signatures: string[] } {
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of value.split(',')) {
    const [key, rawValue] = part.split('=', 2);
    if (key === 't' && /^\d+$/.test(rawValue ?? '')) {
      timestamp = Number(rawValue);
    } else if (key === 'v1' && /^[a-f0-9]{64}$/i.test(rawValue ?? '')) {
      signatures.push((rawValue ?? '').toLowerCase());
    }
  }
  if (!timestamp || signatures.length === 0) {
    throw new Error('Invalid Stripe signature header');
  }
  return { timestamp, signatures };
}

export function verifyAndParseStripeWebhook(input: {
  rawBody: Buffer;
  signatureHeader: string;
  webhookSecret: string;
  nowMs?: number;
  toleranceSeconds?: number;
}): StripePaymentSucceededEvent {
  const parsedHeader = parseSignatureHeader(input.signatureHeader);
  const nowMs = input.nowMs ?? Date.now();
  const tolerance = (input.toleranceSeconds ?? 300) * 1000;
  const eventTime = parsedHeader.timestamp * 1000;
  if (Math.abs(nowMs - eventTime) > tolerance) {
    throw new Error('Stripe webhook timestamp is outside tolerance');
  }

  const signedPayload = Buffer.concat([
    Buffer.from(`${parsedHeader.timestamp}.`, 'utf8'),
    input.rawBody
  ]);
  const expected = createHmac('sha256', input.webhookSecret)
    .update(signedPayload)
    .digest();
  const verified = parsedHeader.signatures.some((signature) => {
    const candidate = Buffer.from(signature, 'hex');
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  });
  if (!verified) {
    throw new Error('Stripe webhook signature is invalid');
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(input.rawBody.toString('utf8'));
  } catch {
    throw new Error('Stripe webhook JSON is invalid');
  }
  return stripeEventSchema.parse(decoded);
}

export function stripePaymentFingerprint(event: StripePaymentSucceededEvent): string {
  const payment = event.data.object;
  return createHash('sha256')
    .update([
      'suqnaa-stripe-event-fingerprint-v1',
      event.id,
      payment.id,
      payment.metadata.suqnaa_payment_intent_id,
      String(payment.amount_received),
      payment.currency.toUpperCase(),
      payment.latest_charge,
      payment.transfer_group
    ].join('\n'))
    .digest('hex');
}
