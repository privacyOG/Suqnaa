import type { DisputeOutcome } from '../db/types.js';
import { db } from '../db/index.js';

export const protectionPolicyVersion = 'au-marketplace-protection-v1';
export const itemIssueWindowDays = 7;
export const fallbackShippingWindowDays = 14;
export const returnShipmentWindowDays = 14;

export type ProtectionClaimType =
  | 'non_delivery'
  | 'item_not_as_described'
  | 'post_payment_cancellation'
  | 'return_request'
  | 'return_not_received'
  | 'returned_item_condition';

export interface ProtectionEligibility {
  eligible: boolean;
  claimType: ProtectionClaimType | null;
  beneficiaryRole: 'buyer' | 'seller' | null;
  reasonCode: string;
  basis: Record<string, unknown>;
}

function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}

function asDate(value: unknown): Date | null {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function claimTypeForCategory(category: string): ProtectionClaimType | null {
  switch (category) {
    case 'non_delivery':
      return 'non_delivery';
    case 'item_condition':
    case 'damage':
      return 'item_not_as_described';
    case 'payment_issue':
      return 'post_payment_cancellation';
    default:
      return null;
  }
}

function beneficiaryForOutcome(outcome: Exclude<DisputeOutcome, 'none'>): 'buyer' | 'seller' | null {
  switch (outcome) {
    case 'buyer_refund':
    case 'partial_refund':
    case 'return_required':
      return 'buyer';
    case 'seller_release':
      return 'seller';
    case 'compliance_escalation':
      return null;
  }
}

export async function evaluateDisputeProtectionEligibility(input: {
  disputeId: string;
  outcome: Exclude<DisputeOutcome, 'none'>;
  now?: Date;
}): Promise<ProtectionEligibility> {
  const now = input.now ?? new Date();
  const dispute = await db.selectFrom('disputes').selectAll()
    .where('id', '=', input.disputeId).executeTakeFirst();
  if (!dispute) {
    return { eligible: false, claimType: null, beneficiaryRole: null, reasonCode: 'dispute_not_found', basis: {} };
  }

  const claimType = claimTypeForCategory(String(dispute.category));
  const beneficiaryRole = beneficiaryForOutcome(input.outcome);
  if (!claimType) {
    return {
      eligible: input.outcome === 'seller_release' || input.outcome === 'compliance_escalation',
      claimType,
      beneficiaryRole,
      reasonCode: 'category_not_protection_eligible',
      basis: { category: dispute.category }
    };
  }

  const order = await db.selectFrom('transactions').selectAll()
    .where('id', '=', dispute.order_id).executeTakeFirst();
  const fulfilment = await db.selectFrom('fulfilments').selectAll()
    .where('payment_intent_id', '=', dispute.payment_intent_id).executeTakeFirst();
  const details = await db.selectFrom('order_fulfilment_details').selectAll()
    .where('order_id', '=', dispute.order_id).executeTakeFirst();
  const pickupProof = await db.selectFrom('pickup_proofs').select(['verified_at'])
    .where('order_id', '=', dispute.order_id)
    .where('verified_at', 'is not', null)
    .orderBy('verified_at', 'desc').executeTakeFirst();

  if (!order || !fulfilment) {
    return {
      eligible: false,
      claimType,
      beneficiaryRole,
      reasonCode: 'order_fulfilment_context_missing',
      basis: { orderPresent: Boolean(order), fulfilmentPresent: Boolean(fulfilment) }
    };
  }

  const openerIsBuyer = String(dispute.opened_by_role) === 'buyer';
  const buyerRemedy = ['buyer_refund', 'partial_refund', 'return_required'].includes(input.outcome);
  if (buyerRemedy && !openerIsBuyer) {
    return {
      eligible: false,
      claimType,
      beneficiaryRole,
      reasonCode: 'buyer_protection_requires_buyer_claim',
      basis: { openedByRole: dispute.opened_by_role }
    };
  }

  if (input.outcome === 'seller_release' || input.outcome === 'compliance_escalation') {
    return {
      eligible: true,
      claimType,
      beneficiaryRole,
      reasonCode: input.outcome === 'seller_release' ? 'seller_protection_resolution' : 'compliance_review',
      basis: { category: dispute.category, openedByRole: dispute.opened_by_role }
    };
  }

  if (claimType === 'non_delivery') {
    if (!details || String(details.mode) !== 'shipping') {
      return { eligible: false, claimType, beneficiaryRole, reasonCode: 'shipping_order_required', basis: { mode: details?.mode ?? null } };
    }
    const shippedAt = asDate(fulfilment.shipped_at);
    const deliveredAt = asDate(fulfilment.delivered_at);
    const confirmedAt = asDate(fulfilment.buyer_confirmed_at);
    if (!shippedAt) {
      return { eligible: false, claimType, beneficiaryRole, reasonCode: 'shipment_not_started', basis: { fulfilmentStatus: fulfilment.status } };
    }
    if (deliveredAt || confirmedAt) {
      return { eligible: false, claimType, beneficiaryRole, reasonCode: 'delivery_already_recorded', basis: { deliveredAt, confirmedAt } };
    }
    const promisedDays = Number(details.shipping_eta_max_days ?? fallbackShippingWindowDays);
    const eligibleAt = addDays(shippedAt, promisedDays);
    return {
      eligible: now >= eligibleAt,
      claimType,
      beneficiaryRole,
      reasonCode: now >= eligibleAt ? 'non_delivery_window_elapsed' : 'non_delivery_window_open',
      basis: {
        shippedAt: shippedAt.toISOString(),
        promisedMaximumDays: promisedDays,
        usedFallbackWindow: details.shipping_eta_max_days == null,
        eligibleAt: eligibleAt.toISOString()
      }
    };
  }

  if (claimType === 'item_not_as_described') {
    const completionAt = asDate(fulfilment.buyer_confirmed_at)
      ?? asDate(fulfilment.delivered_at)
      ?? asDate(pickupProof?.verified_at);
    if (!completionAt) {
      return {
        eligible: false,
        claimType,
        beneficiaryRole,
        reasonCode: 'completed_handoff_required',
        basis: { fulfilmentStatus: fulfilment.status, mode: details?.mode ?? null }
      };
    }
    const expiresAt = addDays(completionAt, itemIssueWindowDays);
    return {
      eligible: now <= expiresAt,
      claimType,
      beneficiaryRole,
      reasonCode: now <= expiresAt ? 'item_issue_window_active' : 'item_issue_window_expired',
      basis: { completionAt: completionAt.toISOString(), expiresAt: expiresAt.toISOString(), windowDays: itemIssueWindowDays }
    };
  }

  if (claimType === 'post_payment_cancellation') {
    const paymentStarted = ['paid', 'released', 'disputed'].includes(String(order.status));
    const shipmentStarted = Boolean(fulfilment.shipped_at) || ['shipped', 'delivered', 'received_confirmed'].includes(String(fulfilment.status));
    const pickupCompleted = Boolean(pickupProof?.verified_at);
    return {
      eligible: paymentStarted && !shipmentStarted && !pickupCompleted,
      claimType,
      beneficiaryRole,
      reasonCode: !paymentStarted
        ? 'payment_not_collected'
        : shipmentStarted || pickupCompleted
          ? 'fulfilment_already_started'
          : 'post_payment_cancellation_available',
      basis: { orderStatus: order.status, fulfilmentStatus: fulfilment.status, pickupCompleted }
    };
  }

  return { eligible: false, claimType, beneficiaryRole, reasonCode: 'protection_policy_unavailable', basis: {} };
}
