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
  | 'configure_xmr_payment_address'
  | 'redirect_to_provider';

interface CheckoutOrderSnapshot {
  id: string;
  listingId: string;
  amount: string | number;
  currencyCode: string;
  status: 'pending';
  paymentMethod: CheckoutPaymentMethod;
}

export type CheckoutPreparationResponse =
  | {
      accepted: true;
      status: 'configuration_required';
      order: CheckoutOrderSnapshot;
      payment: {
        provider: null;
        nextAction: Exclude<CheckoutNextAction, 'redirect_to_provider'>;
      };
      releaseModel: 'hold_until_fulfilment_or_dispute_resolution';
    }
  | {
      accepted: true;
      status: 'redirect_required';
      order: CheckoutOrderSnapshot;
      payment: {
        provider: 'stripe';
        nextAction: 'redirect_to_provider';
        checkoutUrl: string;
        expiresAt: string;
      };
      releaseModel: 'hold_until_fulfilment_or_dispute_resolution';
    };

export function prepareProtectedCheckout(
  orderId: string,
  locale: 'en' | 'ar',
  challengeResponse?: string
): Promise<CheckoutPreparationResponse> {
  return postAuthed<CheckoutPreparationResponse>(
    '/v1/payments/protected-checkout',
    { orderId, locale },
    challengeResponse
  );
}
