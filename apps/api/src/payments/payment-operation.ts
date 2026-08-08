export const paymentOperationKinds = [
  'release',
  'refund_full',
  'refund_partial',
  'cancel_after_payment',
  'chargeback',
  'compliance_hold'
] as const;

export type PaymentOperationKind = (typeof paymentOperationKinds)[number];
export type RequestedPaymentOperationKind = Exclude<PaymentOperationKind, 'chargeback'>;

export const paymentOperationStatuses = [
  'requested',
  'approved',
  'processing',
  'succeeded',
  'failed',
  'rejected'
] as const;

export type PaymentOperationStatus = (typeof paymentOperationStatuses)[number];

export class PaymentOperationError extends Error {
  constructor(readonly code: string, readonly statusCode = 409) {
    super(code);
  }
}

export function normalizeOperationAmount(value: string | number): string {
  const normalized = String(value).trim();
  const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) throw new PaymentOperationError('invalid_amount', 400);
  const whole = BigInt(match[1]);
  const fraction = BigInt((match[2] ?? '').padEnd(2, '0'));
  const cents = whole * 100n + fraction;
  if (cents <= 0n || cents > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new PaymentOperationError('invalid_amount', 400);
  }
  return `${whole}.${fraction.toString().padStart(2, '0')}`;
}

export function validateOperationInput(input: {
  kind: RequestedPaymentOperationKind;
  reason: string;
  amount?: string | number | null;
}): { reason: string; amount: string | null } {
  const reason = input.reason.trim();
  if (reason.length < 8 || reason.length > 2000) {
    throw new PaymentOperationError('invalid_reason', 400);
  }

  if (input.kind === 'refund_partial') {
    if (input.amount === undefined || input.amount === null) {
      throw new PaymentOperationError('amount_required', 400);
    }
    return { reason, amount: normalizeOperationAmount(input.amount) };
  }
  if (input.amount !== undefined && input.amount !== null) {
    throw new PaymentOperationError('amount_not_allowed', 400);
  }
  return { reason, amount: null };
}

export function operationRequiresProviderRefund(kind: PaymentOperationKind): boolean {
  return kind === 'refund_full' || kind === 'refund_partial' || kind === 'cancel_after_payment';
}

export function targetPaymentStatusForOperation(
  kind: PaymentOperationKind,
  fullyRefunded = false
): 'released' | 'refunded' | 'held' | 'disputed' | 'compliance_hold' {
  switch (kind) {
    case 'release':
      return 'released';
    case 'refund_full':
    case 'cancel_after_payment':
      return 'refunded';
    case 'refund_partial':
      return fullyRefunded ? 'refunded' : 'held';
    case 'chargeback':
      return 'disputed';
    case 'compliance_hold':
      return 'compliance_hold';
  }
}
