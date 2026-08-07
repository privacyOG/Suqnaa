import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { SellerVerificationConfiguration } from '../config/seller-verification-config.js';

const eventIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const providerReferencePattern = /^[\x21-\x7e]{1,200}$/;
const reasonCodePattern = /^[a-z0-9][a-z0-9_.-]{0,119}$/;

export const sellerVerificationProviderEventSchema = z.object({
  type: z.literal('seller_verification.updated'),
  providerReference: z.string().trim().refine(
    (value) => providerReferencePattern.test(value),
    'Invalid verification provider reference'
  ),
  result: z.enum(['passed', 'failed', 'review_required', 'expired']),
  reasonCode: z.string().trim().refine(
    (value) => reasonCodePattern.test(value),
    'Invalid verification reason code'
  ).optional(),
  occurredAt: z.string().datetime({ offset: true })
}).strict();

export const sellerVerificationProviderHeaderSchema = z.object({
  provider: z.string().regex(/^[a-z0-9][a-z0-9_-]{1,39}$/),
  eventId: z.string().refine((value) => eventIdPattern.test(value), 'Invalid verification event identifier'),
  timestamp: z.string().regex(/^[0-9]{9,11}$/),
  signature: z.string().regex(/^[a-fA-F0-9]{64}$/)
}).strict();

export type SellerVerificationProviderEvent = z.infer<typeof sellerVerificationProviderEventSchema>;
export type SellerVerificationProviderHeaders = z.infer<typeof sellerVerificationProviderHeaderSchema>;

function signatureFields(
  headers: SellerVerificationProviderHeaders,
  event: SellerVerificationProviderEvent
): string[] {
  return [
    'suqnaa-seller-verification-event-v1',
    headers.provider,
    headers.eventId,
    headers.timestamp,
    event.type,
    event.providerReference,
    event.result,
    event.reasonCode ?? '',
    event.occurredAt
  ];
}

export function canonicalSellerVerificationSignatureInput(
  headers: SellerVerificationProviderHeaders,
  event: SellerVerificationProviderEvent
): string {
  return signatureFields(headers, event).join('\n');
}

export function signSellerVerificationEvent(
  secret: string,
  headers: Omit<SellerVerificationProviderHeaders, 'signature'>,
  event: SellerVerificationProviderEvent
): string {
  return createHmac('sha256', secret)
    .update(canonicalSellerVerificationSignatureInput({ ...headers, signature: '0'.repeat(64) }, event))
    .digest('hex');
}

export function verifySellerVerificationEventSignature(
  configuration: SellerVerificationConfiguration,
  headers: SellerVerificationProviderHeaders,
  event: SellerVerificationProviderEvent,
  nowMs = Date.now()
): { verified: boolean; reason: string } {
  if (!configuration.enabled || headers.provider !== configuration.provider) {
    return { verified: false, reason: 'provider_mismatch' };
  }
  const timestampSeconds = Number(headers.timestamp);
  const nowSeconds = Math.floor(nowMs / 1000);
  const ageSeconds = nowSeconds - timestampSeconds;
  if (ageSeconds > configuration.eventMaxAgeSeconds) {
    return { verified: false, reason: 'timestamp_expired' };
  }
  if (ageSeconds < -60) {
    return { verified: false, reason: 'timestamp_in_future' };
  }
  const expected = createHmac('sha256', configuration.signingSecret)
    .update(canonicalSellerVerificationSignatureInput(headers, event))
    .digest();
  const received = Buffer.from(headers.signature, 'hex');
  if (received.length !== expected.length || !timingSafeEqual(expected, received)) {
    return { verified: false, reason: 'signature_mismatch' };
  }
  return { verified: true, reason: 'verified' };
}

export function sellerVerificationEventFingerprint(
  provider: string,
  event: SellerVerificationProviderEvent
): string {
  return createHash('sha256')
    .update([
      'suqnaa-seller-verification-payload-v1',
      provider,
      event.type,
      event.providerReference,
      event.result,
      event.reasonCode ?? '',
      event.occurredAt
    ].join('\n'))
    .digest('hex');
}
