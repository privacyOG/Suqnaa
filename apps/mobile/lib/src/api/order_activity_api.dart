import 'authed_api.dart';

final _uuidPattern = RegExp(
  r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
);
final _currencyPattern = RegExp(r'^[A-Z]{3}$');

T _requiredEnum<T>(
  Object? value,
  Iterable<T> values,
  String Function(T item) wireValue,
  String label,
) {
  for (final item in values) {
    if (wireValue(item) == value) {
      return item;
    }
  }
  throw FormatException('Unsupported $label');
}

String _requiredString(
  Map<String, dynamic> json,
  String key, {
  int maximumLength = 500,
}) {
  final value = json[key];
  if (value is! String || value.isEmpty || value.length > maximumLength) {
    throw FormatException('Invalid $key');
  }
  return value;
}

String _requiredUuid(Map<String, dynamic> json, String key) {
  final value = _requiredString(json, key, maximumLength: 36);
  if (!_uuidPattern.hasMatch(value)) {
    throw FormatException('Invalid $key');
  }
  return value;
}

String _requiredDate(Map<String, dynamic> json, String key) {
  final value = _requiredString(json, key, maximumLength: 64);
  if (DateTime.tryParse(value) == null) {
    throw FormatException('Invalid $key');
  }
  return value;
}

String _requiredAmount(Map<String, dynamic> json, String key) {
  final raw = json[key];
  final value = raw is num
      ? raw.toString()
      : raw is String
          ? raw
          : null;
  final numeric = value == null ? null : num.tryParse(value);
  if (numeric == null || numeric <= 0) {
    throw FormatException('Invalid $key');
  }
  return value!;
}

Map<String, dynamic> _requiredMap(
  Map<String, dynamic> json,
  String key,
) {
  final value = json[key];
  if (value is! Map) {
    throw FormatException('Invalid $key');
  }
  return Map<String, dynamic>.from(value);
}

Map<String, dynamic>? _optionalMap(
  Map<String, dynamic> json,
  String key,
) {
  final value = json[key];
  if (value == null) {
    return null;
  }
  if (value is! Map) {
    throw FormatException('Invalid $key');
  }
  return Map<String, dynamic>.from(value);
}

enum OrderActivityStatus {
  pending('pending'),
  paid('paid'),
  released('released'),
  refunded('refunded'),
  disputed('disputed'),
  cancelled('cancelled');

  const OrderActivityStatus(this.wireValue);
  final String wireValue;

  static OrderActivityStatus parse(Object? value) => _requiredEnum(
        value,
        OrderActivityStatus.values,
        (item) => item.wireValue,
        'order status',
      );
}

enum OrderRole {
  buyer('buyer'),
  seller('seller');

  const OrderRole(this.wireValue);
  final String wireValue;

  static OrderRole parse(Object? value) => _requiredEnum(
        value,
        OrderRole.values,
        (item) => item.wireValue,
        'order role',
      );
}

enum OrderProgressStage {
  paymentPending('payment_pending'),
  fulfilment('fulfilment'),
  complete('complete'),
  disputed('disputed'),
  refunded('refunded'),
  cancelled('cancelled');

  const OrderProgressStage(this.wireValue);
  final String wireValue;

  static OrderProgressStage parse(Object? value) => _requiredEnum(
        value,
        OrderProgressStage.values,
        (item) => item.wireValue,
        'order progress stage',
      );
}

enum OrderProgressStepKey {
  created('created'),
  paid('paid'),
  fulfilment('fulfilment'),
  complete('complete');

  const OrderProgressStepKey(this.wireValue);
  final String wireValue;

  static OrderProgressStepKey parse(Object? value) => _requiredEnum(
        value,
        OrderProgressStepKey.values,
        (item) => item.wireValue,
        'order progress step',
      );
}

enum OrderProgressStepState {
  complete('complete'),
  current('current'),
  upcoming('upcoming'),
  exception('exception');

  const OrderProgressStepState(this.wireValue);
  final String wireValue;

  static OrderProgressStepState parse(Object? value) => _requiredEnum(
        value,
        OrderProgressStepState.values,
        (item) => item.wireValue,
        'order progress state',
      );
}

class OrderProgressStep {
  const OrderProgressStep({required this.key, required this.state});

  final OrderProgressStepKey key;
  final OrderProgressStepState state;

  factory OrderProgressStep.fromJson(Map<String, dynamic> json) {
    return OrderProgressStep(
      key: OrderProgressStepKey.parse(json['key']),
      state: OrderProgressStepState.parse(json['state']),
    );
  }
}

class OrderProgress {
  const OrderProgress({
    required this.stage,
    required this.percent,
    required this.terminal,
    required this.steps,
  });

  final OrderProgressStage stage;
  final int percent;
  final bool terminal;
  final List<OrderProgressStep> steps;

  factory OrderProgress.fromJson(Map<String, dynamic> json) {
    final percent = json['percent'];
    final terminal = json['terminal'];
    final rawSteps = json['steps'];
    if (percent is! int || percent < 0 || percent > 100) {
      throw const FormatException('Invalid order progress percent');
    }
    if (terminal is! bool || rawSteps is! List || rawSteps.isEmpty) {
      throw const FormatException('Invalid order progress payload');
    }

    final steps = rawSteps.map((value) {
      if (value is! Map) {
        throw const FormatException('Invalid order progress step');
      }
      return OrderProgressStep.fromJson(Map<String, dynamic>.from(value));
    }).toList(growable: false);

    return OrderProgress(
      stage: OrderProgressStage.parse(json['stage']),
      percent: percent,
      terminal: terminal,
      steps: steps,
    );
  }
}

class OrderListingSummary {
  const OrderListingSummary({
    required this.id,
    required this.title,
    required this.status,
    required this.priceAmount,
    required this.currencyCode,
  });

  final String id;
  final String title;
  final String status;
  final String priceAmount;
  final String currencyCode;

  factory OrderListingSummary.fromJson(Map<String, dynamic> json) {
    final currency = _requiredString(json, 'currencyCode', maximumLength: 3);
    if (!_currencyPattern.hasMatch(currency)) {
      throw const FormatException('Invalid listing currency');
    }
    return OrderListingSummary(
      id: _requiredUuid(json, 'id'),
      title: _requiredString(json, 'title', maximumLength: 160),
      status: _requiredString(json, 'status', maximumLength: 32),
      priceAmount: _requiredAmount(json, 'priceAmount'),
      currencyCode: currency,
    );
  }
}

class OrderCounterpartSummary {
  const OrderCounterpartSummary({
    required this.id,
    required this.displayName,
    required this.status,
  });

  final String id;
  final String displayName;
  final String status;

  factory OrderCounterpartSummary.fromJson(Map<String, dynamic> json) {
    return OrderCounterpartSummary(
      id: _requiredUuid(json, 'id'),
      displayName: _requiredString(json, 'displayName', maximumLength: 120),
      status: _requiredString(json, 'status', maximumLength: 32),
    );
  }
}

class OrderOfferSummary {
  const OrderOfferSummary({
    required this.id,
    required this.status,
    required this.message,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String status;
  final String? message;
  final String createdAt;
  final String updatedAt;

  factory OrderOfferSummary.fromJson(Map<String, dynamic> json) {
    final rawMessage = json['message'];
    if (rawMessage != null &&
        (rawMessage is! String || rawMessage.length > 1200)) {
      throw const FormatException('Invalid offer message');
    }
    return OrderOfferSummary(
      id: _requiredUuid(json, 'id'),
      status: _requiredString(json, 'status', maximumLength: 32),
      message: rawMessage as String?,
      createdAt: _requiredDate(json, 'createdAt'),
      updatedAt: _requiredDate(json, 'updatedAt'),
    );
  }
}

class OrderActivity {
  const OrderActivity({
    required this.id,
    required this.offerId,
    required this.listingId,
    required this.buyerId,
    required this.sellerId,
    required this.amount,
    required this.currencyCode,
    required this.status,
    required this.paymentMethod,
    required this.createdAt,
    required this.updatedAt,
    required this.role,
    required this.progress,
    required this.listing,
    required this.counterpart,
    required this.offer,
  });

  final String id;
  final String? offerId;
  final String listingId;
  final String buyerId;
  final String sellerId;
  final String amount;
  final String currencyCode;
  final OrderActivityStatus status;
  final String? paymentMethod;
  final String createdAt;
  final String updatedAt;
  final OrderRole role;
  final OrderProgress progress;
  final OrderListingSummary? listing;
  final OrderCounterpartSummary? counterpart;
  final OrderOfferSummary? offer;

  factory OrderActivity.fromJson(Map<String, dynamic> json) {
    final offerId = json['offerId'];
    if (offerId != null && (offerId is! String || !_uuidPattern.hasMatch(offerId))) {
      throw const FormatException('Invalid offer identifier');
    }
    final paymentMethod = json['paymentMethod'];
    if (paymentMethod != null &&
        (paymentMethod is! String || paymentMethod.length > 40)) {
      throw const FormatException('Invalid payment method');
    }
    final currency = _requiredString(json, 'currencyCode', maximumLength: 3);
    if (!_currencyPattern.hasMatch(currency)) {
      throw const FormatException('Invalid order currency');
    }

    final listing = _optionalMap(json, 'listing');
    final counterpart = _optionalMap(json, 'counterpart');
    final offer = _optionalMap(json, 'offer');

    return OrderActivity(
      id: _requiredUuid(json, 'id'),
      offerId: offerId as String?,
      listingId: _requiredUuid(json, 'listingId'),
      buyerId: _requiredUuid(json, 'buyerId'),
      sellerId: _requiredUuid(json, 'sellerId'),
      amount: _requiredAmount(json, 'amount'),
      currencyCode: currency,
      status: OrderActivityStatus.parse(json['status']),
      paymentMethod: paymentMethod as String?,
      createdAt: _requiredDate(json, 'createdAt'),
      updatedAt: _requiredDate(json, 'updatedAt'),
      role: OrderRole.parse(json['role']),
      progress: OrderProgress.fromJson(_requiredMap(json, 'progress')),
      listing: listing == null ? null : OrderListingSummary.fromJson(listing),
      counterpart: counterpart == null
          ? null
          : OrderCounterpartSummary.fromJson(counterpart),
      offer: offer == null ? null : OrderOfferSummary.fromJson(offer),
    );
  }
}

class OrderActivityPage {
  const OrderActivityPage({
    required this.orders,
    required this.hasMore,
    required this.nextCursor,
  });

  final List<OrderActivity> orders;
  final bool hasMore;
  final String? nextCursor;

  factory OrderActivityPage.fromJson(Map<String, dynamic> json) {
    final rawOrders = json['orders'];
    final pagination = _requiredMap(json, 'pagination');
    if (rawOrders is! List || pagination['hasMore'] is! bool) {
      throw const FormatException('Invalid order page');
    }
    final nextCursor = pagination['nextCursor'];
    if (nextCursor != null &&
        (nextCursor is! String || DateTime.tryParse(nextCursor) == null)) {
      throw const FormatException('Invalid order page cursor');
    }
    if (pagination['hasMore'] == true && nextCursor == null) {
      throw const FormatException('Missing order page cursor');
    }

    return OrderActivityPage(
      orders: rawOrders.map((value) {
        if (value is! Map) {
          throw const FormatException('Invalid order entry');
        }
        return OrderActivity.fromJson(Map<String, dynamic>.from(value));
      }).toList(growable: false),
      hasMore: pagination['hasMore'] as bool,
      nextCursor: nextCursor as String?,
    );
  }
}

abstract interface class OrderActivityGateway {
  Future<OrderActivityPage> fetchPage(
    String accessToken, {
    OrderActivityStatus? status,
    int limit = 20,
    String? before,
  });

  Future<OrderActivity> fetchDetail(
    String accessToken, {
    required String orderId,
  });
}

class OrderActivityApi implements OrderActivityGateway {
  OrderActivityApi({required AuthedApi authedApi}) : _authedApi = authedApi;

  final AuthedApi _authedApi;

  @override
  Future<OrderActivityPage> fetchPage(
    String accessToken, {
    OrderActivityStatus? status,
    int limit = 20,
    String? before,
  }) async {
    if (limit < 1 || limit > 50) {
      throw RangeError.range(limit, 1, 50, 'limit');
    }
    final normalizedCursor = before?.trim();
    if (normalizedCursor != null &&
        normalizedCursor.isNotEmpty &&
        DateTime.tryParse(normalizedCursor) == null) {
      throw ArgumentError.value(before, 'before', 'Must be an ISO date');
    }

    final path = Uri(
      path: '/v1/market/orders',
      queryParameters: {
        'limit': '$limit',
        if (status != null) 'status': status.wireValue,
        if (normalizedCursor?.isNotEmpty == true) 'before': normalizedCursor!,
      },
    ).toString();
    final response = await _authedApi.get(path, accessToken);
    return OrderActivityPage.fromJson(response);
  }

  @override
  Future<OrderActivity> fetchDetail(
    String accessToken, {
    required String orderId,
  }) async {
    final normalizedOrderId = orderId.trim();
    if (!_uuidPattern.hasMatch(normalizedOrderId)) {
      throw ArgumentError.value(orderId, 'orderId', 'Must be a UUID');
    }
    final response = await _authedApi.get(
      '/v1/market/orders/${Uri.encodeComponent(normalizedOrderId)}',
      accessToken,
    );
    return OrderActivity.fromJson(_requiredMap(response, 'order'));
  }
}
