import {
  createHash,
  createHmac,
  timingSafeEqual
} from 'node:crypto';
import { z } from 'zod';
import type {
  PaymentStatus,
  TransactionStatus
} from '../db/types.js';
import type { PaymentEventConfiguration } from '../config/payment-event-config.js';

const eventIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const providerReferencePattern = /^[\x21-\x7e]{1,200}$/;
const amountPattern = /^(0|[1-9][0-9]{0,9})\.[0-9]{2}$/;

export const paymentHeldEventSchema = z.object({
  type: z.literal('payment.held'),
  paymentIntentId: z.string().uuid(),
  providerReference: z.string().trim().refine(
    (value) => providerReferencePattern.test(value),
    'Provider reference must contain 1 to 200 printable non-space characters'
  ),
  amount: z.string().refine(
    (value) => amountPattern.test(value) && Number(value) > 0,
    'Amount must be a positive decimal with exactly two fraction digits'
  ),
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
  occurredAt: z.string().datetime({ offset: true })
}).strict();

export const paymentEventHeaderSchema = z.object({
  provider: z.string().regex(/^[a-z0-9][a-z0-9_-]{1,39}$/),
  eventId: z.string().refine(
    (value) => eventIdPattern.test(value),
    'Invalid payment event identifier'
  ),
  timestamp: z.string().regex(/^[0-9]{9,11}$/),
  signature: z.string().regex(/^[a-fA-F0-9]{64}$/)
}).strict();

export type PaymentHeldEvent = z.infer<typeof paymentHeldEventSchema>;
export type PaymentEventHeaders = z.infer<typeof paymentEventHeaderSchema>;

export type PaymentEventVerificationReason =
  | 'verified'
  | 'provider_mismatch'
  | 'timestamp_expired'
  | 'timestamp_in_future'
  | 'signature_mismatch';

export interface PaymentEventVerificationResult {
  verified: boolean;
  reason: PaymentEventVerificationReason;
}

export type PaymentHeldTransitionReason =
  | 'allowed'
  | 'already_applied'
  | 'provider_evidence_conflict'
  | 'invalid_order_state'
  | 'invalid_payment_state';

export interface PaymentHeldTransitionInput {
  configuredProvider: string;
  eventProviderReference: string;
  orderStatus: TransactionStatus;
  paymentStatus: PaymentStatus;
  orderProvider: string | null;
  orderProviderReference: string | null;
  paymentProvider: string | null;
  paymentProviderReference: string | null;
}

export interface PaymentHeldTransitionDecision {
  allowed: boolean;
  unchanged: boolean;
  reason: PaymentHeldTransitionReason;
}

function signatureFields(
  headers: PaymentEventHeaders,
  event: PaymentHeldEvent
): string[] {
  return [
    'suqnaa-payment-event-v1',
    headers.provider,
    headers.eventId,
    headers.timestamp,
    event.type,
    event.paymentIntentId,
    event.providerReference,
    event.amount,
    event.currencyCode,
    event.occurredAt
  ];
}

export function canonicalPaymentEventSignatureInput(
  headers: PaymentEventHeaders,
  event: PaymentHeldEvent
): string {
  return signatureFields(headers, event).join('\n');
}

export function signPaymentEvent(
  secret: string,
  headers: Omit<PaymentEventHeaders, 'signature'>,
  event: PaymentHeldEvent
): string {
  return createHmac('sha256', secret)
    .update(canonicalPaymentEventSignatureInput(
      { ...headers, signature: '0'.repeat(64) },
      event
    ))
    .digest('hex');
}

export function verifyPaymentEventSignature(
  configuration: PaymentEventConfiguration,
  headers: PaymentEventHeaders,
  event: PaymentHeldEvent,
  nowMs = Date.now()
): PaymentEventVerificationResult {
  if (!configuration.enabled || headers.provider !== configuration.provider) {
    return { verified: false, reason: 'provider_mismatch' };
  }

  const timestampSeconds = Number(headers.timestamp);
  const nowSeconds = Math.floor(nowMs / 1000);
  const ageSeconds = nowSeconds - timestampSeconds;
  if (ageSeconds > configuration.maxAgeSeconds) {
    return { verified: false, reason: 'timestamp_expired' };
  }
  if (ageSeconds < -60) {
    return { verified: false, reason: 'timestamp_in_future' };
  }

  const expected = createHmac('sha256', configuration.signingSecret)
    .update(canonicalPaymentEventSignatureInput(headers, event))
    .digest();
  const received = Buffer.from(headers.signature, 'hex');
  if (
    received.length !== expected.length ||
    !timingSafeEqual(expected, received)
  ) {
    return { verified: false, reason: 'signature_mismatch' };
  }

  return { verified: true, reason: 'verified' };
}

export function paymentEventFingerprint(
  provider: string,
  event: PaymentHeldEvent
): string {
  return createHash('sha256')
    .update([
      'suqnaa-payment-event-payload-v1',
      provider,
      event.type,
      event.paymentIntentId,
      event.providerReference,
      event.amount,
      event.currencyCode,
      event.occurredAt
    ].join('\n'))
    .digest('hex');
}

export function normalizePaymentAmount(value: string | number): string {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Payment amount is invalid');
  }
  return amount.toFixed(2);
}

export function normalizePaymentCurrency(value: string): string {
  const currency = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error('Payment currency is invalid');
  }
  return currency;
}

function exactProviderEvidence(
  provider: string,
  reference: string,
  storedProvider: string | null,
  storedReference: string | null
): boolean {
  return storedProvider === provider && storedReference === reference;
}

function emptyProviderEvidence(
  storedProvider: string | null,
  storedReference: string | null
): boolean {
  return storedProvider === null && storedReference === null;
}

export function decidePaymentHeldTransition(
  input: PaymentHeldTransitionInput
): PaymentHeldTransitionDecision {
  const orderEvidenceExact = exactProviderEvidence(
    input.configuredProvider,
    input.eventProviderReference,
    input.orderProvider,
    input.orderProviderReference
  );
  const paymentEvidenceExact = exactProviderEvidence(
    input.configuredProvider,
    input.eventProviderReference,
    input.paymentProvider,
    input.paymentProviderReference
  );
  const orderEvidenceEmpty = emptyProviderEvidence(
    input.orderProvider,
    input.orderProviderReference
  );
  const paymentEvidenceEmpty = emptyProviderEvidence(
    input.paymentProvider,
    input.paymentProviderReference
  );

  if (
    !(
      (orderEvidenceExact && paymentEvidenceExact) ||
      (orderEvidenceEmpty && paymentEvidenceEmpty)
    )
  ) {
    return {
      allowed: false,
      unchanged: false,
      reason: 'provider_evidence_conflict'
    };
  }

  if (input.orderStatus === 'paid' && input.paymentStatus === 'held') {
    if (!orderEvidenceExact || !paymentEvidenceExact) {
      return {
        allowed: false,
        unchanged: false,
        reason: 'provider_evidence_conflict'
      };
    }
    return {
      allowed: true,
      unchanged: true,
      reason: 'already_applied'
    };
  }

  if (input.orderStatus !== 'pending') {
    return {
      allowed: false,
      unchanged: false,
      reason: 'invalid_order_state'
    };
  }
  if (
    input.paymentStatus !== 'created' &&
    input.paymentStatus !== 'awaiting_payment' &&
    input.paymentStatus !== 'funds_received'
  ) {
    return {
      allowed: false,
      unchanged: false,
      reason: 'invalid_payment_state'
    };
  }

  return {
    allowed: true,
    unchanged: false,
    reason: 'allowed'
  };
}
