import type {
  FulfilmentStatus,
  PaymentStatus,
  TransactionStatus
} from '../db/types.js';

export type FulfilmentActorRole = 'buyer' | 'seller';
export type FulfilmentAction =
  | 'ready_for_pickup'
  | 'shipped'
  | 'confirm_received';

export type FulfilmentTransitionReason =
  | 'allowed'
  | 'already_applied'
  | 'actor_not_allowed'
  | 'order_not_paid'
  | 'payment_not_held'
  | 'provider_evidence_missing'
  | 'invalid_fulfilment_state';

export interface FulfilmentTransitionInput {
  role: FulfilmentActorRole;
  action: FulfilmentAction;
  orderStatus: TransactionStatus;
  paymentStatus: PaymentStatus;
  providerConfigured: boolean;
  fulfilmentStatus: FulfilmentStatus;
}

export interface FulfilmentTransitionDecision {
  allowed: boolean;
  unchanged: boolean;
  targetStatus: FulfilmentStatus | null;
  reason: FulfilmentTransitionReason;
}

function denied(
  reason: Exclude<
    FulfilmentTransitionReason,
    'allowed' | 'already_applied'
  >
): FulfilmentTransitionDecision {
  return {
    allowed: false,
    unchanged: false,
    targetStatus: null,
    reason
  };
}

export function decideFulfilmentTransition(
  input: FulfilmentTransitionInput
): FulfilmentTransitionDecision {
  if (input.orderStatus !== 'paid') {
    return denied('order_not_paid');
  }
  if (input.paymentStatus !== 'held') {
    return denied('payment_not_held');
  }
  if (!input.providerConfigured) {
    return denied('provider_evidence_missing');
  }

  if (input.action === 'ready_for_pickup') {
    if (input.role !== 'seller') {
      return denied('actor_not_allowed');
    }
    if (input.fulfilmentStatus === 'ready_for_pickup') {
      return {
        allowed: true,
        unchanged: true,
        targetStatus: 'ready_for_pickup',
        reason: 'already_applied'
      };
    }
    if (input.fulfilmentStatus !== 'not_started') {
      return denied('invalid_fulfilment_state');
    }
    return {
      allowed: true,
      unchanged: false,
      targetStatus: 'ready_for_pickup',
      reason: 'allowed'
    };
  }

  if (input.action === 'shipped') {
    if (input.role !== 'seller') {
      return denied('actor_not_allowed');
    }
    if (input.fulfilmentStatus === 'shipped') {
      return {
        allowed: true,
        unchanged: true,
        targetStatus: 'shipped',
        reason: 'already_applied'
      };
    }
    if (input.fulfilmentStatus !== 'not_started') {
      return denied('invalid_fulfilment_state');
    }
    return {
      allowed: true,
      unchanged: false,
      targetStatus: 'shipped',
      reason: 'allowed'
    };
  }

  if (input.role !== 'buyer') {
    return denied('actor_not_allowed');
  }
  if (input.fulfilmentStatus === 'received_confirmed') {
    return {
      allowed: true,
      unchanged: true,
      targetStatus: 'received_confirmed',
      reason: 'already_applied'
    };
  }
  if (
    input.fulfilmentStatus !== 'ready_for_pickup' &&
    input.fulfilmentStatus !== 'shipped' &&
    input.fulfilmentStatus !== 'delivered'
  ) {
    return denied('invalid_fulfilment_state');
  }
  return {
    allowed: true,
    unchanged: false,
    targetStatus: 'received_confirmed',
    reason: 'allowed'
  };
}
