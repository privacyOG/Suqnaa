import 'authed_api.dart';

final _uuidPattern = RegExp(
  r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
);

Map<String, dynamic> _requiredMap(Map<String, dynamic> json, String key) {
  final value = json[key];
  if (value is! Map) {
    throw FormatException('Invalid $key');
  }
  return Map<String, dynamic>.from(value);
}

String _requiredUuid(Map<String, dynamic> json, String key) {
  final value = json[key];
  if (value is! String || !_uuidPattern.hasMatch(value)) {
    throw FormatException('Invalid $key');
  }
  return value;
}

DateTime? _optionalDate(Map<String, dynamic> json, String key) {
  final value = json[key];
  if (value == null) {
    return null;
  }
  if (value is! String || DateTime.tryParse(value) == null) {
    throw FormatException('Invalid $key');
  }
  return DateTime.parse(value);
}

enum MobileFulfilmentStatus {
  notStarted('not_started'),
  readyForPickup('ready_for_pickup'),
  shipped('shipped'),
  delivered('delivered'),
  receivedConfirmed('received_confirmed'),
  failed('failed');

  const MobileFulfilmentStatus(this.wireValue);
  final String wireValue;

  static MobileFulfilmentStatus parse(Object? value) {
    for (final item in values) {
      if (item.wireValue == value) {
        return item;
      }
    }
    throw const FormatException('Unsupported fulfilment status');
  }
}

enum MobilePaymentContextStatus {
  created('created'),
  awaitingPayment('awaiting_payment'),
  fundsReceived('funds_received'),
  held('held'),
  released('released'),
  refunded('refunded'),
  disputed('disputed'),
  cancelled('cancelled'),
  complianceHold('compliance_hold');

  const MobilePaymentContextStatus(this.wireValue);
  final String wireValue;

  static MobilePaymentContextStatus parse(Object? value) {
    for (final item in values) {
      if (item.wireValue == value) {
        return item;
      }
    }
    throw const FormatException('Unsupported payment context status');
  }
}

enum MobileFulfilmentAction {
  readyForPickup('ready_for_pickup'),
  shipped('shipped'),
  confirmReceived('confirm_received');

  const MobileFulfilmentAction(this.wireValue);
  final String wireValue;
}

class OrderFulfilmentContext {
  const OrderFulfilmentContext({
    required this.orderId,
    required this.paymentIntentId,
    required this.paymentStatus,
    required this.providerConfigured,
    required this.fulfilmentId,
    required this.fulfilmentStatus,
    required this.releaseEnabled,
  });

  final String orderId;
  final String paymentIntentId;
  final MobilePaymentContextStatus paymentStatus;
  final bool providerConfigured;
  final String fulfilmentId;
  final MobileFulfilmentStatus fulfilmentStatus;
  final bool releaseEnabled;

  factory OrderFulfilmentContext.fromJson(Map<String, dynamic> json) {
    final orderId = _requiredUuid(json, 'orderId');
    final context = _requiredMap(json, 'paymentContext');
    final intent = _requiredMap(context, 'paymentIntent');
    final fulfilment = _requiredMap(context, 'fulfilment');
    final operations = _requiredMap(context, 'operations');

    if (intent['providerConfigured'] is! bool ||
        operations['releaseEnabled'] is! bool ||
        operations['collectionEnabled'] is! bool ||
        context['releaseModel'] !=
            'hold_until_fulfilment_or_dispute_resolution') {
      throw const FormatException('Invalid order payment context');
    }
    if (operations['releaseEnabled'] != false ||
        operations['collectionEnabled'] != false) {
      throw const FormatException('Payment operations must remain disabled');
    }

    return OrderFulfilmentContext(
      orderId: orderId,
      paymentIntentId: _requiredUuid(intent, 'id'),
      paymentStatus: MobilePaymentContextStatus.parse(intent['status']),
      providerConfigured: intent['providerConfigured'] as bool,
      fulfilmentId: _requiredUuid(fulfilment, 'id'),
      fulfilmentStatus: MobileFulfilmentStatus.parse(fulfilment['status']),
      releaseEnabled: false,
    );
  }
}

class OrderFulfilmentResult {
  const OrderFulfilmentResult({
    required this.orderId,
    required this.fulfilmentId,
    required this.status,
    required this.carrier,
    required this.trackingReference,
    required this.shippedAt,
    required this.deliveredAt,
    required this.buyerConfirmedAt,
    required this.updatedAt,
    required this.unchanged,
  });

  final String orderId;
  final String fulfilmentId;
  final MobileFulfilmentStatus status;
  final String? carrier;
  final String? trackingReference;
  final DateTime? shippedAt;
  final DateTime? deliveredAt;
  final DateTime? buyerConfirmedAt;
  final DateTime updatedAt;
  final bool unchanged;

  factory OrderFulfilmentResult.fromJson(Map<String, dynamic> json) {
    final fulfilment = _requiredMap(json, 'fulfilment');
    final payment = _requiredMap(json, 'payment');
    if (json['accepted'] != true || payment['releaseEnabled'] != false) {
      throw const FormatException('Invalid fulfilment response');
    }

    final carrier = fulfilment['carrier'];
    final tracking = fulfilment['trackingReference'];
    final updatedAt = fulfilment['updatedAt'];
    final unchanged = fulfilment['unchanged'];
    if (carrier != null && (carrier is! String || carrier.length > 80)) {
      throw const FormatException('Invalid carrier');
    }
    if (tracking != null && (tracking is! String || tracking.length > 160)) {
      throw const FormatException('Invalid tracking reference');
    }
    if (updatedAt is! String || DateTime.tryParse(updatedAt) == null) {
      throw const FormatException('Invalid fulfilment timestamp');
    }
    if (unchanged is! bool) {
      throw const FormatException('Invalid fulfilment idempotency state');
    }

    return OrderFulfilmentResult(
      orderId: _requiredUuid(json, 'orderId'),
      fulfilmentId: _requiredUuid(fulfilment, 'id'),
      status: MobileFulfilmentStatus.parse(fulfilment['status']),
      carrier: carrier as String?,
      trackingReference: tracking as String?,
      shippedAt: _optionalDate(fulfilment, 'shippedAt'),
      deliveredAt: _optionalDate(fulfilment, 'deliveredAt'),
      buyerConfirmedAt: _optionalDate(fulfilment, 'buyerConfirmedAt'),
      updatedAt: DateTime.parse(updatedAt),
      unchanged: unchanged,
    );
  }
}

abstract interface class OrderFulfilmentGateway {
  Future<OrderFulfilmentContext> fetchContext(
    String accessToken, {
    required String orderId,
  });

  Future<OrderFulfilmentResult> update(
    String accessToken, {
    required String orderId,
    required MobileFulfilmentAction action,
    String? carrier,
    String? trackingReference,
    String? challengeResponse,
  });
}

class OrderFulfilmentApi implements OrderFulfilmentGateway {
  OrderFulfilmentApi({required AuthedApi authedApi}) : _authedApi = authedApi;

  final AuthedApi _authedApi;

  String _orderId(String value) {
    final normalized = value.trim();
    if (!_uuidPattern.hasMatch(normalized)) {
      throw ArgumentError.value(value, 'orderId', 'Must be a UUID');
    }
    return normalized;
  }

  @override
  Future<OrderFulfilmentContext> fetchContext(
    String accessToken, {
    required String orderId,
  }) async {
    final normalizedOrderId = _orderId(orderId);
    final response = await _authedApi.get(
      '/v1/market/orders/$normalizedOrderId/payment-context',
      accessToken,
    );
    final result = OrderFulfilmentContext.fromJson(response);
    if (result.orderId != normalizedOrderId) {
      throw const FormatException('Payment context order mismatch');
    }
    return result;
  }

  @override
  Future<OrderFulfilmentResult> update(
    String accessToken, {
    required String orderId,
    required MobileFulfilmentAction action,
    String? carrier,
    String? trackingReference,
    String? challengeResponse,
  }) async {
    final normalizedOrderId = _orderId(orderId);
    final normalizedChallenge = challengeResponse?.trim();
    if (normalizedChallenge != null && normalizedChallenge.length > 4096) {
      throw ArgumentError.value(
        challengeResponse,
        'challengeResponse',
        'Must not exceed 4096 characters',
      );
    }

    final Map<String, dynamic> body;
    if (action == MobileFulfilmentAction.shipped) {
      final normalizedCarrier = carrier?.trim() ?? '';
      final normalizedTracking = trackingReference?.trim() ?? '';
      if (normalizedCarrier.length < 2 || normalizedCarrier.length > 80) {
        throw ArgumentError.value(carrier, 'carrier', 'Must be 2 to 80 characters');
      }
      if (normalizedTracking.length < 3 || normalizedTracking.length > 160) {
        throw ArgumentError.value(
          trackingReference,
          'trackingReference',
          'Must be 3 to 160 characters',
        );
      }
      body = {
        'action': action.wireValue,
        'carrier': normalizedCarrier,
        'trackingReference': normalizedTracking,
      };
    } else {
      if (carrier != null || trackingReference != null) {
        throw ArgumentError('Shipping evidence is allowed only for shipped actions');
      }
      body = {'action': action.wireValue};
    }

    final response = await _authedApi.postWithHeaders(
      '/v1/market/orders/$normalizedOrderId/fulfilment',
      accessToken,
      body,
      extraHeaders: {
        if (normalizedChallenge?.isNotEmpty == true)
          'x-suqnaa-human-check': normalizedChallenge!,
      },
    );
    final result = OrderFulfilmentResult.fromJson(response);
    if (result.orderId != normalizedOrderId) {
      throw const FormatException('Fulfilment response order mismatch');
    }
    final expectedStatus = switch (action) {
      MobileFulfilmentAction.readyForPickup =>
        MobileFulfilmentStatus.readyForPickup,
      MobileFulfilmentAction.shipped => MobileFulfilmentStatus.shipped,
      MobileFulfilmentAction.confirmReceived =>
        MobileFulfilmentStatus.receivedConfirmed,
    };
    if (result.status != expectedStatus) {
      throw const FormatException('Fulfilment response status mismatch');
    }
    if (action == MobileFulfilmentAction.shipped &&
        (result.carrier != body['carrier'] ||
            result.trackingReference != body['trackingReference'])) {
      throw const FormatException('Fulfilment shipping evidence mismatch');
    }
    return result;
  }
}
