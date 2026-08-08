import 'authed_api.dart';

const _checkoutPath = '/v1/payments/protected-checkout';
final _uuidPattern = RegExp(
  r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
);
final _currencyPattern = RegExp(r'^[A-Z]{3}$');

enum CheckoutPaymentMethod {
  card('card'),
  bankTransfer('bank_transfer'),
  wallet('wallet'),
  xmr('xmr');

  const CheckoutPaymentMethod(this.wireValue);

  final String wireValue;

  static CheckoutPaymentMethod parse(Object? value) {
    return CheckoutPaymentMethod.values.firstWhere(
      (method) => method.wireValue == value,
      orElse: () => throw const FormatException(
        'Unsupported checkout payment method',
      ),
    );
  }
}

enum CheckoutNextAction {
  configureCardProvider('configure_card_provider'),
  configureBankTransferInstructions(
    'configure_bank_transfer_instructions',
  ),
  configureWalletProvider('configure_wallet_provider'),
  configureXmrPaymentAddress('configure_xmr_payment_address'),
  redirectToProvider('redirect_to_provider');

  const CheckoutNextAction(this.wireValue);

  final String wireValue;

  static CheckoutNextAction parse(Object? value) {
    return CheckoutNextAction.values.firstWhere(
      (action) => action.wireValue == value,
      orElse: () => throw const FormatException(
        'Unsupported checkout next action',
      ),
    );
  }
}

class CheckoutOrderSnapshot {
  const CheckoutOrderSnapshot({
    required this.id,
    required this.listingId,
    required this.amount,
    required this.currencyCode,
    required this.paymentMethod,
  });

  final String id;
  final String listingId;
  final String amount;
  final String currencyCode;
  final CheckoutPaymentMethod paymentMethod;

  factory CheckoutOrderSnapshot.fromJson(Map<String, dynamic> json) {
    final id = json['id'];
    final listingId = json['listingId'];
    final currencyCode = json['currencyCode'];
    final rawAmount = json['amount'];
    final amount = rawAmount is num
        ? rawAmount.toString()
        : rawAmount is String
            ? rawAmount
            : null;
    final numericAmount = amount == null ? null : num.tryParse(amount);

    if (id is! String || !_uuidPattern.hasMatch(id)) {
      throw const FormatException('Invalid checkout order identifier');
    }
    if (listingId is! String || !_uuidPattern.hasMatch(listingId)) {
      throw const FormatException('Invalid checkout listing identifier');
    }
    if (numericAmount == null || numericAmount <= 0) {
      throw const FormatException('Invalid checkout amount');
    }
    if (currencyCode is! String || !_currencyPattern.hasMatch(currencyCode)) {
      throw const FormatException('Invalid checkout currency');
    }
    if (json['status'] != 'pending') {
      throw const FormatException('Checkout order must be pending');
    }

    return CheckoutOrderSnapshot(
      id: id,
      listingId: listingId,
      amount: amount!,
      currencyCode: currencyCode,
      paymentMethod: CheckoutPaymentMethod.parse(json['paymentMethod']),
    );
  }
}

class CheckoutPreparation {
  const CheckoutPreparation({
    required this.order,
    required this.nextAction,
    this.provider,
    this.checkoutUrl,
    this.expiresAt,
  });

  final CheckoutOrderSnapshot order;
  final CheckoutNextAction nextAction;
  final String? provider;
  final Uri? checkoutUrl;
  final DateTime? expiresAt;

  bool get requiresProviderRedirect => checkoutUrl != null;

  factory CheckoutPreparation.fromJson(Map<String, dynamic> json) {
    final rawOrder = json['order'];
    final rawPayment = json['payment'];
    final status = json['status'];

    if (json['accepted'] != true ||
        (status != 'configuration_required' && status != 'redirect_required')) {
      throw const FormatException('Invalid checkout preparation status');
    }
    if (rawOrder is! Map || rawPayment is! Map) {
      throw const FormatException('Invalid checkout preparation payload');
    }
    if (json['releaseModel'] !=
        'hold_until_fulfilment_or_dispute_resolution') {
      throw const FormatException('Invalid checkout release model');
    }

    final nextAction = CheckoutNextAction.parse(rawPayment['nextAction']);
    String? provider;
    Uri? checkoutUrl;
    DateTime? expiresAt;

    if (status == 'configuration_required') {
      if (rawPayment['provider'] != null ||
          nextAction == CheckoutNextAction.redirectToProvider) {
        throw const FormatException('Unexpected configured payment provider');
      }
    } else {
      if (rawPayment['provider'] != 'stripe' ||
          nextAction != CheckoutNextAction.redirectToProvider) {
        throw const FormatException('Invalid hosted checkout provider');
      }
      provider = 'stripe';
      final rawUrl = rawPayment['checkoutUrl'];
      final rawExpiry = rawPayment['expiresAt'];
      checkoutUrl = rawUrl is String ? Uri.tryParse(rawUrl) : null;
      expiresAt = rawExpiry is String ? DateTime.tryParse(rawExpiry) : null;
      if (!_trustedCheckoutUri(checkoutUrl) || expiresAt == null) {
        throw const FormatException('Invalid hosted checkout details');
      }
    }

    return CheckoutPreparation(
      order: CheckoutOrderSnapshot.fromJson(
        Map<String, dynamic>.from(rawOrder),
      ),
      nextAction: nextAction,
      provider: provider,
      checkoutUrl: checkoutUrl,
      expiresAt: expiresAt,
    );
  }
}

bool _trustedCheckoutUri(Uri? uri) {
  if (uri == null || uri.scheme != 'https' || uri.userInfo.isNotEmpty) {
    return false;
  }
  final host = uri.host.toLowerCase();
  return host == 'checkout.stripe.com' || host.endsWith('.checkout.stripe.com');
}

abstract interface class OrderCheckoutGateway {
  Future<CheckoutPreparation> prepare(
    String accessToken, {
    required String orderId,
    String? challengeResponse,
  });
}

class OrderCheckoutApi implements OrderCheckoutGateway {
  OrderCheckoutApi({required AuthedApi authedApi}) : _authedApi = authedApi;

  final AuthedApi _authedApi;

  @override
  Future<CheckoutPreparation> prepare(
    String accessToken, {
    required String orderId,
    String? challengeResponse,
  }) async {
    final normalizedOrderId = orderId.trim();
    if (!_uuidPattern.hasMatch(normalizedOrderId)) {
      throw ArgumentError.value(orderId, 'orderId', 'Must be a UUID');
    }

    final normalizedChallenge = challengeResponse?.trim();
    if (normalizedChallenge != null && normalizedChallenge.length > 4096) {
      throw ArgumentError.value(
        challengeResponse,
        'challengeResponse',
        'Must not exceed 4096 characters',
      );
    }

    final response = await _authedApi.postWithHeaders(
      _checkoutPath,
      accessToken,
      {'orderId': normalizedOrderId, 'locale': 'en'},
      extraHeaders: {
        if (normalizedChallenge?.isNotEmpty == true)
          'x-suqnaa-human-check': normalizedChallenge!,
      },
    );

    final preparation = CheckoutPreparation.fromJson(response);
    if (preparation.order.id != normalizedOrderId) {
      throw const FormatException('Checkout response order mismatch');
    }

    return preparation;
  }
}
