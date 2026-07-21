import type { OrderActivityStatus } from './order-activity-api';

export type OrderParticipantRole = 'buyer' | 'seller';

export function canCancelPendingOrder(
  role: OrderParticipantRole,
  status: OrderActivityStatus
): boolean {
  return role === 'buyer' && status === 'pending';
}

export function cancellationSuccessMessage(
  unchanged: boolean,
  isArabic: boolean
): string {
  if (unchanged) {
    return isArabic
      ? 'كان الطلب ملغى بالفعل. لم تُجرَ تغييرات إضافية.'
      : 'The order was already cancelled. No additional changes were made.';
  }

  return isArabic
    ? 'أُلغي الطلب والعرض وأصبح الإعلان متاحاً من جديد.'
    : 'The order and offer were cancelled, and the listing is available again.';
}
