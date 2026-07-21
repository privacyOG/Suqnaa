import 'package:suqnaa/l10n/app_localizations.dart';
import '../../api/order_activity_api.dart';

String orderStatusLabel(
  AppLocalizations text,
  OrderActivityStatus status,
) {
  return switch (status) {
    OrderActivityStatus.pending => text.paymentPendingStatus,
    OrderActivityStatus.paid => text.paidStatus,
    OrderActivityStatus.released => text.releasedStatus,
    OrderActivityStatus.disputed => text.disputedStatus,
    OrderActivityStatus.refunded => text.refundedStatus,
    OrderActivityStatus.cancelled => text.cancelledStatus,
  };
}

String orderStageLabel(
  AppLocalizations text,
  OrderProgressStage stage,
) {
  return switch (stage) {
    OrderProgressStage.paymentPending => text.waitingPayment,
    OrderProgressStage.fulfilment => text.preparingFulfilment,
    OrderProgressStage.complete => text.transactionComplete,
    OrderProgressStage.disputed => text.resolutionRequired,
    OrderProgressStage.refunded => text.fundsReturned,
    OrderProgressStage.cancelled => text.transactionCancelled,
  };
}

String orderStepLabel(
  AppLocalizations text,
  OrderProgressStepKey step,
) {
  return switch (step) {
    OrderProgressStepKey.created => text.orderCreated,
    OrderProgressStepKey.paid => text.paymentConfirmed,
    OrderProgressStepKey.fulfilment => text.handoverOrDelivery,
    OrderProgressStepKey.complete => text.transactionComplete,
  };
}

String orderRoleLabel(AppLocalizations text, OrderRole role) {
  return role == OrderRole.buyer ? text.buyer : text.seller;
}

String paymentMethodLabel(AppLocalizations text, String? value) {
  return switch (value) {
    'card' => Localizations.localeOf(text as dynamic).languageCode == 'ar'
        ? 'بطاقة'
        : 'Card',
    'bank_transfer' => Localizations.localeOf(text as dynamic).languageCode == 'ar'
        ? 'تحويل بنكي'
        : 'Bank transfer',
    'wallet' => Localizations.localeOf(text as dynamic).languageCode == 'ar'
        ? 'محفظة'
        : 'Wallet',
    'xmr' => 'XMR',
    null || '' => text.noPaymentMethod,
    _ => value!,
  };
}
