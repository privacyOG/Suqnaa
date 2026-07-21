import 'authed_api.dart';

final _uuidPattern = RegExp(
  r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
);

class OrderCancellationResult {
  const OrderCancellationResult({
    required this.orderId,
    required this.updatedAt,
    required this.unchanged,
  });

  final String orderId;
  final DateTime updatedAt;
  final bool unchanged;

  factory OrderCancellationResult.fromJson(Map<String, dynamic> json) {
    final rawOrder = json['order'];
    final rawCancellation = json['cancellation'];
    if (json['accepted'] != true ||
        rawOrder is! Map ||
        rawCancellation is! Map) {
      throw const FormatException('Invalid order cancellation response');
    }

    final order = Map<String, dynamic>.from(rawOrder);
    final cancellation = Map<String, dynamic>.from(rawCancellation);
    final orderId = order['id'];
    final updatedAt = order['updatedAt'];
    final unchanged = cancellation['unchanged'];

    if (orderId is! String || !_uuidPattern.hasMatch(orderId)) {
      throw const FormatException('Invalid cancelled order identifier');
    }
    if (order['status'] != 'cancelled') {
      throw const FormatException('Cancelled order status is required');
    }
    if (updatedAt is! String || DateTime.tryParse(updatedAt) == null) {
      throw const FormatException('Invalid cancellation timestamp');
    }
    if (unchanged is! bool) {
      throw const FormatException('Invalid cancellation idempotency state');
    }

    return OrderCancellationResult(
      orderId: orderId,
      updatedAt: DateTime.parse(updatedAt),
      unchanged: unchanged,
    );
  }
}

abstract interface class OrderCancellationGateway {
  Future<OrderCancellationResult> cancel(
    String accessToken, {
    required String orderId,
    String? challengeResponse,
  });
}

class OrderCancellationApi implements OrderCancellationGateway {
  OrderCancellationApi({required AuthedApi authedApi}) : _authedApi = authedApi;

  final AuthedApi _authedApi;

  @override
  Future<OrderCancellationResult> cancel(
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
      '/v1/market/orders/$normalizedOrderId/cancel',
      accessToken,
      const {},
      extraHeaders: {
        if (normalizedChallenge?.isNotEmpty == true)
          'x-suqnaa-human-check': normalizedChallenge!,
      },
    );

    final result = OrderCancellationResult.fromJson(response);
    if (result.orderId != normalizedOrderId) {
      throw const FormatException('Cancellation response order mismatch');
    }
    return result;
  }
}
