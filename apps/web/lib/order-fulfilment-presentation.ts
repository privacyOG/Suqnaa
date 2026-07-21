import type { OrderActivityItem } from './order-activity-api';
import type {
  FulfilmentMutationInput,
  FulfilmentStatus,
  OrderPaymentContextResponse
} from './order-fulfilment-api';

export type AvailableFulfilmentAction = FulfilmentMutationInput['action'];

export function availableFulfilmentActions(
  order: Pick<OrderActivityItem, 'role' | 'status'>,
  context: OrderPaymentContextResponse
): AvailableFulfilmentAction[] {
  const payment = context.paymentContext.paymentIntent;
  const fulfilment = context.paymentContext.fulfilment;

  if (
    order.status !== 'paid' ||
    payment.status !== 'held' ||
    payment.providerConfigured !== true ||
    context.paymentContext.operations.releaseEnabled !== false
  ) {
    return [];
  }

  if (order.role === 'seller' && fulfilment.status === 'not_started') {
    return ['ready_for_pickup', 'shipped'];
  }

  if (
    order.role === 'buyer' &&
    (fulfilment.status === 'ready_for_pickup' ||
      fulfilment.status === 'shipped' ||
      fulfilment.status === 'delivered')
  ) {
    return ['confirm_received'];
  }

  return [];
}

export function fulfilmentStatusLabel(
  status: FulfilmentStatus,
  isArabic: boolean
): string {
  const labels: Record<FulfilmentStatus, readonly [string, string]> = {
    not_started: ['Not started', 'لم يبدأ'],
    ready_for_pickup: ['Ready for pickup', 'جاهز للاستلام'],
    shipped: ['Shipped', 'تم الشحن'],
    delivered: ['Delivered', 'تم التسليم'],
    received_confirmed: ['Receipt confirmed', 'تم تأكيد الاستلام'],
    failed: ['Fulfilment failed', 'تعذر الإيفاء']
  };
  return labels[status][isArabic ? 1 : 0];
}

export function fulfilmentSuccessMessage(
  action: AvailableFulfilmentAction,
  unchanged: boolean,
  isArabic: boolean
): string {
  if (unchanged) {
    return isArabic
      ? 'كانت حالة الإيفاء مسجلة بالفعل. لم تُجرَ تغييرات إضافية.'
      : 'That fulfilment state was already recorded. No additional changes were made.';
  }

  if (action === 'ready_for_pickup') {
    return isArabic
      ? 'تم تسجيل أن الطلب جاهز للاستلام.'
      : 'The order is now recorded as ready for pickup.';
  }
  if (action === 'shipped') {
    return isArabic
      ? 'تم تسجيل الشحن ومعلومات التتبع.'
      : 'Shipment and tracking details were recorded.';
  }
  return isArabic
    ? 'تم تأكيد الاستلام. لا يتم تحرير الأموال تلقائياً.'
    : 'Receipt was confirmed. Funds are not released automatically.';
}
