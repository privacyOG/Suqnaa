import { postAuthed } from './authed-api';

export type CheckoutPaymentMethod =
  | 'card'
  | 'bank_transfer'
  | 'wallet'
  | 'xmr';

export type CheckoutNextAction =
  | 'configure_card_provider'
  | 'configure_bank_transfer_instructions'
  | 'configure_wallet_provider'
  | 'configure_xmr_payment_address';

export interface CheckoutPreparationResponse {
  accepted: true;
  status: 'configuration_required';
  order: {
    id: string;
    listingId: string;
    amount: string | number;
    currencyCode: string;
    status: 'pending';
    paymentMethod: CheckoutPaymentMethod;
  };
  payment: {
    provider: null;
    nextAction: CheckoutNextAction;
  };
  releaseModel: 'hold_until_fulfilment_or_dispute_resolution';
}

export function prepareProtectedCheckout(
  orderId: string,
  challengeResponse?: string
): Promise<CheckoutPreparationResponse> {
  return postAuthed<CheckoutPreparationResponse>(
    '/v1/payments/protected-checkout',
    { orderId },
    challengeResponse
  );
}
