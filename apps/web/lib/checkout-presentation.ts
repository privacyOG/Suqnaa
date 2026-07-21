import type { CheckoutNextAction } from './payment-api';

export function canPrepareCheckout(
  role: 'buyer' | 'seller',
  status: string
): boolean {
  return role === 'buyer' && status === 'pending';
}

export function checkoutNextActionMessage(
  action: CheckoutNextAction,
  isArabic: boolean
): string {
  const messages: Record<CheckoutNextAction, [string, string]> = {
    configure_card_provider: [
      'Card processing must be configured before payment can begin.',
      'يجب إعداد معالجة البطاقة قبل بدء الدفع.'
    ],
    configure_bank_transfer_instructions: [
      'Bank transfer instructions must be configured before payment can begin.',
      'يجب إعداد تعليمات التحويل البنكي قبل بدء الدفع.'
    ],
    configure_wallet_provider: [
      'Wallet processing must be configured before payment can begin.',
      'يجب إعداد معالجة المحفظة قبل بدء الدفع.'
    ],
    configure_xmr_payment_address: [
      'The payment address must be configured before payment can begin.',
      'يجب إعداد عنوان الدفع قبل بدء الدفع.'
    ]
  };

  return messages[action][isArabic ? 1 : 0];
}
