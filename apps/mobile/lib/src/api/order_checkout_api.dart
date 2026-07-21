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
  configureXmrPaymentAddress('configure_xmr_payment_address');

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
  });

  final CheckoutOrderSnapshot order;
  final CheckoutNextAction nextAction;

  factory CheckoutPreparation.fromJson(Map<String, dynamic> json) {
    final rawOrder = json['order'];
    final rawPayment = json['payment'];

    if (json['accepted'] != true ||
        json['status'] != 'configuration_required') {
      throw const FormatException('Invalid checkout preparation status');
    }
    if (rawOrder is! Map || rawPayment is! Map) {
      throw const FormatException('Invalid checkout preparation payload');
    }
    if (rawPayment['provider'] != null) {
      throw const FormatException('Unexpected configured payment provider');
    }
    if (json['releaseModel'] !=
        'hold_until_fulfilment_or_dispute_resolution') {
      throw const FormatException('Invalid checkout release model');
    }

    return CheckoutPreparation(
      order: CheckoutOrderSnapshot.fromJson(
        Map<String, dynamic>.from(rawOrder),
      ),
      nextAction: CheckoutNextAction.parse(rawPayment['nextAction']),
    );
  }
}

class OrderCheckoutApi {
  OrderCheckoutApi({required AuthedApi authedApi}) : _authedApi = authedApi;

  final AuthedApi _authedApi;

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
      {'orderId': normalizedOrderId},
      extraHeaders: {
        if (normalizedChallenge?.isNotEmpty == true)
          'x-suqnaa-human-check': normalizedChallenge!,
      },
    );

    return CheckoutPreparation.fromJson(response);
  }
}
