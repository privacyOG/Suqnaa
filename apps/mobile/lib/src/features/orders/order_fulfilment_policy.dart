import '../../api/order_activity_api.dart';
import '../../api/order_fulfilment_api.dart';

List<MobileFulfilmentAction> availableMobileFulfilmentActions(
  OrderActivity order,
  OrderFulfilmentContext context,
) {
  if (context.orderId != order.id ||
      order.status != OrderActivityStatus.paid ||
      context.paymentStatus != MobilePaymentContextStatus.held ||
      !context.providerConfigured ||
      context.releaseEnabled) {
    return const [];
  }

  if (order.role == OrderRole.seller &&
      context.fulfilmentStatus == MobileFulfilmentStatus.notStarted) {
    return const [
      MobileFulfilmentAction.readyForPickup,
      MobileFulfilmentAction.shipped,
    ];
  }

  if (order.role == OrderRole.buyer &&
      (context.fulfilmentStatus == MobileFulfilmentStatus.readyForPickup ||
          context.fulfilmentStatus == MobileFulfilmentStatus.shipped ||
          context.fulfilmentStatus == MobileFulfilmentStatus.delivered)) {
    return const [MobileFulfilmentAction.confirmReceived];
  }

  return const [];
}
