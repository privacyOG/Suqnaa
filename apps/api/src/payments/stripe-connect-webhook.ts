import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

const providerId = (prefix: string) => z.string().regex(new RegExp(`^${prefix}_[A-Za-z0-9_]{8,}$`));
const accountId = providerId('acct');

const accountObject = z.object({
  id: accountId,
  object: z.literal('account'),
  country: z.string().length(2),
  default_currency: z.string().length(3),
  details_submitted: z.boolean(),
  payouts_enabled: z.boolean(),
  capabilities: z.object({ transfers: z.string().optional() }).passthrough().optional(),
  requirements: z.object({
    currently_due: z.array(z.string()).optional(),
    past_due: z.array(z.string()).optional(),
    pending_verification: z.array(z.string()).optional(),
    disabled_reason: z.string().nullable().optional()
  }).passthrough().optional()
}).passthrough();

const payoutObject = z.object({
  id: providerId('po'),
  object: z.literal('payout'),
  amount: z.number().int().nonnegative(),
  currency: z.string().length(3),
  status: z.enum(['pending', 'in_transit', 'paid', 'failed', 'canceled']),
  failure_code: z.string().nullable().optional()
}).passthrough();

const base = {
  id: providerId('evt'),
  object: z.literal('event'),
  created: z.number().int().positive(),
  livemode: z.boolean(),
  account: accountId
};

const accountUpdated = z.object({
  ...base,
  type: z.literal('account.updated'),
  data: z.object({ object: accountObject })
}).passthrough();

const payoutEvent = z.object({
  ...base,
  type: z.enum(['payout.paid', 'payout.failed', 'payout.canceled']),
  data: z.object({ object: payoutObject })
}).passthrough();

const connectEvent = z.discriminatedUnion('type', [accountUpdated, payoutEvent]);
export type StripeConnectEvent = z.infer<typeof connectEvent>;

function signatureHeader(value: string): { timestamp: number; signatures: string[] } {
  let timestamp = 0;
  const signatures: string[] = [];
  for (const part of value.split(',')) {
    const [key, raw] = part.split('=', 2);
    if (key === 't' && /^\d+$/.test(raw ?? '')) timestamp = Number(raw);
    if (key === 'v1' && /^[a-f0-9]{64}$/i.test(raw ?? '')) signatures.push((raw ?? '').toLowerCase());
  }
  if (!timestamp || signatures.length === 0) throw new Error('Invalid Stripe signature header');
  return { timestamp, signatures };
}

export function verifyAndParseStripeConnectWebhook(input: {
  rawBody: Buffer;
  signatureHeader: string;
  webhookSecret: string;
  nowMs?: number;
  toleranceSeconds?: number;
}): StripeConnectEvent {
  const parsed = signatureHeader(input.signatureHeader);
  const now = input.nowMs ?? Date.now();
  if (Math.abs(now - parsed.timestamp * 1000) > (input.toleranceSeconds ?? 300) * 1000) {
    throw new Error('Stripe Connect webhook timestamp is outside tolerance');
  }
  const signed = Buffer.concat([Buffer.from(`${parsed.timestamp}.`, 'utf8'), input.rawBody]);
  const expected = createHmac('sha256', input.webhookSecret).update(signed).digest();
  const valid = parsed.signatures.some((signature) => {
    const candidate = Buffer.from(signature, 'hex');
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  });
  if (!valid) throw new Error('Stripe Connect webhook signature is invalid');
  return connectEvent.parse(JSON.parse(input.rawBody.toString('utf8')));
}
