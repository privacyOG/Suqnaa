export const checkoutPaymentMethods = [
  'card',
  'bank_transfer',
  'wallet',
  'xmr'
] as const;

export type CheckoutPaymentMethod = typeof checkoutPaymentMethods[number];

export type CheckoutNextAction =
  | 'configure_card_provider'
  | 'configure_bank_transfer_instructions'
  | 'configure_wallet_provider'
  | 'configure_xmr_payment_address';

export interface CheckoutOrderSnapshot {
  id: string;
  listingId: string;
  amount: string | number;
  currencyCode: string;
  status: 'pending';
  paymentMethod: CheckoutPaymentMethod;
}

export interface CheckoutPreparation {
  accepted: true;
  status: 'configuration_required';
  order: CheckoutOrderSnapshot;
  payment: {
    provider: null;
    nextAction: CheckoutNextAction;
  };
  releaseModel: 'hold_until_fulfilment_or_dispute_resolution';
}

const nextActionByMethod: Record<CheckoutPaymentMethod, CheckoutNextAction> = {
  card: 'configure_card_provider',
  bank_transfer: 'configure_bank_transfer_instructions',
  wallet: 'configure_wallet_provider',
  xmr: 'configure_xmr_payment_address'
};

export function prepareOrderCheckout(
  order: CheckoutOrderSnapshot
): CheckoutPreparation {
  return {
    accepted: true,
    status: 'configuration_required',
    order,
    payment: {
      provider: null,
      nextAction: nextActionByMethod[order.paymentMethod]
    },
    releaseModel: 'hold_until_fulfilment_or_dispute_resolution'
  };
}
