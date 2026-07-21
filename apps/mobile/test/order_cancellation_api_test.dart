import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:suqnaa/src/api/authed_api.dart';
import 'package:suqnaa/src/api/order_cancellation_api.dart';

const orderId = '123e4567-e89b-42d3-a456-426614174000';
const otherOrderId = '223e4567-e89b-42d3-a456-426614174000';

String cancellationResponse({
  String responseOrderId = orderId,
  String status = 'cancelled',
  Object? unchanged = false,
}) {
  return jsonEncode({
    'accepted': true,
    'order': {
      'id': responseOrderId,
      'status': status,
      'updatedAt': '2026-07-21T10:30:00.000Z',
    },
    'cancellation': {'unchanged': unchanged},
  });
}

void main() {
  test('sends an empty body to the order-bound cancellation route', () async {
    http.Request? captured;
    final client = MockClient((request) async {
      captured = request;
      return http.Response(
        cancellationResponse(),
        200,
        headers: {'content-type': 'application/json'},
      );
    });
    final api = OrderCancellationApi(
      authedApi: AuthedApi(
        baseUrl: Uri.parse('https://api.suqnaa.test'),
        client: client,
      ),
    );

    final result = await api.cancel(
      'access-token',
      orderId: orderId,
      challengeResponse: '  verified-check  ',
    );

    expect(captured?.method, 'POST');
    expect(
      captured?.url.toString(),
      'https://api.suqnaa.test/v1/market/orders/$orderId/cancel',
    );
    expect(captured?.headers['authorization'], 'Bearer access-token');
    expect(captured?.headers['content-type'], 'application/json');
    expect(captured?.headers['x-suqnaa-human-check'], 'verified-check');
    expect(jsonDecode(captured?.body ?? ''), <String, dynamic>{});
    expect(result.orderId, orderId);
    expect(result.unchanged, isFalse);
  });

  test('rejects a response bound to a different order', () async {
    final client = MockClient((request) async {
      return http.Response(
        cancellationResponse(responseOrderId: otherOrderId),
        200,
      );
    });
    final api = OrderCancellationApi(
      authedApi: AuthedApi(
        baseUrl: Uri.parse('https://api.suqnaa.test'),
        client: client,
      ),
    );

    await expectLater(
      api.cancel('access-token', orderId: orderId),
      throwsA(isA<FormatException>()),
    );
  });

  test('rejects a non-cancelled response', () async {
    final client = MockClient((request) async {
      return http.Response(cancellationResponse(status: 'pending'), 200);
    });
    final api = OrderCancellationApi(
      authedApi: AuthedApi(
        baseUrl: Uri.parse('https://api.suqnaa.test'),
        client: client,
      ),
    );

    await expectLater(
      api.cancel('access-token', orderId: orderId),
      throwsA(isA<FormatException>()),
    );
  });

  test('rejects an invalid order id before making a request', () async {
    var requests = 0;
    final client = MockClient((request) async {
      requests += 1;
      return http.Response(cancellationResponse(), 200);
    });
    final api = OrderCancellationApi(
      authedApi: AuthedApi(
        baseUrl: Uri.parse('https://api.suqnaa.test'),
        client: client,
      ),
    );

    await expectLater(
      api.cancel('access-token', orderId: 'not-an-order'),
      throwsArgumentError,
    );
    expect(requests, 0);
  });
}
