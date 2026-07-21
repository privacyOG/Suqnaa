import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:suqnaa/src/api/authed_api.dart';
import 'package:suqnaa/src/api/order_activity_api.dart';

const orderId = '123e4567-e89b-42d3-a456-426614174000';
const listingId = '223e4567-e89b-42d3-a456-426614174000';
const buyerId = '323e4567-e89b-42d3-a456-426614174000';
const sellerId = '423e4567-e89b-42d3-a456-426614174000';
const offerId = '523e4567-e89b-42d3-a456-426614174000';

Map<String, dynamic> orderPayload({
  Object? role = 'buyer',
  Object? status = 'pending',
}) {
  return {
    'id': orderId,
    'offerId': offerId,
    'listingId': listingId,
    'buyerId': buyerId,
    'sellerId': sellerId,
    'amount': '80.00',
    'currencyCode': 'AUD',
    'status': status,
    'paymentMethod': 'bank_transfer',
    'createdAt': '2026-07-20T01:00:00.000Z',
    'updatedAt': '2026-07-21T01:00:00.000Z',
    'role': role,
    'progress': {
      'stage': 'payment_pending',
      'percent': 25,
      'terminal': false,
      'steps': [
        {'key': 'created', 'state': 'complete'},
        {'key': 'paid', 'state': 'current'},
        {'key': 'fulfilment', 'state': 'upcoming'},
        {'key': 'complete', 'state': 'upcoming'},
      ],
    },
    'listing': {
      'id': listingId,
      'title': 'Test phone',
      'status': 'reserved',
      'priceAmount': '100.00',
      'currencyCode': 'AUD',
    },
    'counterpart': {
      'id': sellerId,
      'displayName': 'Test Seller',
      'status': 'active',
    },
    'offer': {
      'id': offerId,
      'status': 'accepted',
      'message': 'Can collect tomorrow.',
      'createdAt': '2026-07-19T01:00:00.000Z',
      'updatedAt': '2026-07-20T01:00:00.000Z',
    },
  };
}

void main() {
  test('serializes order filters and parses a validated page', () async {
    http.Request? captured;
    final client = MockClient((request) async {
      captured = request;
      return http.Response(
        jsonEncode({
          'orders': [orderPayload()],
          'pagination': {
            'hasMore': true,
            'nextCursor': '2026-07-21T01:00:00.000Z',
          },
        }),
        200,
      );
    });
    final api = OrderActivityApi(
      authedApi: AuthedApi(
        baseUrl: Uri.parse('https://api.suqnaa.test'),
        client: client,
      ),
    );

    final page = await api.fetchPage(
      'access-token',
      status: OrderActivityStatus.pending,
      limit: 20,
      before: '2026-07-22T01:00:00.000Z',
    );

    expect(captured?.method, 'GET');
    expect(
      captured?.url.toString(),
      'https://api.suqnaa.test/v1/market/orders?limit=20&status=pending&before=2026-07-22T01%3A00%3A00.000Z',
    );
    expect(captured?.headers['authorization'], 'Bearer access-token');
    expect(page.hasMore, isTrue);
    expect(page.nextCursor, '2026-07-21T01:00:00.000Z');
    expect(page.orders.single.id, orderId);
    expect(page.orders.single.role, OrderRole.buyer);
    expect(page.orders.single.status, OrderActivityStatus.pending);
    expect(page.orders.single.progress.percent, 25);
    expect(page.orders.single.listing?.title, 'Test phone');
  });

  test('loads one participant order by encoded identifier', () async {
    http.Request? captured;
    final client = MockClient((request) async {
      captured = request;
      return http.Response(jsonEncode({'order': orderPayload()}), 200);
    });
    final api = OrderActivityApi(
      authedApi: AuthedApi(
        baseUrl: Uri.parse('https://api.suqnaa.test'),
        client: client,
      ),
    );

    final order = await api.fetchDetail(
      'access-token',
      orderId: orderId,
    );

    expect(
      captured?.url.toString(),
      'https://api.suqnaa.test/v1/market/orders/$orderId',
    );
    expect(order.counterpart?.displayName, 'Test Seller');
    expect(order.offer?.message, 'Can collect tomorrow.');
  });

  test('rejects malformed role and impossible pagination', () async {
    final malformedRole = Map<String, dynamic>.from(orderPayload(role: 'admin'));
    expect(
      () => OrderActivity.fromJson(malformedRole),
      throwsA(isA<FormatException>()),
    );

    expect(
      () => OrderActivityPage.fromJson({
        'orders': [orderPayload()],
        'pagination': {'hasMore': true, 'nextCursor': null},
      }),
      throwsA(isA<FormatException>()),
    );
  });

  test('rejects invalid input before making a request', () async {
    var requests = 0;
    final client = MockClient((request) async {
      requests += 1;
      return http.Response('{}', 200);
    });
    final api = OrderActivityApi(
      authedApi: AuthedApi(
        baseUrl: Uri.parse('https://api.suqnaa.test'),
        client: client,
      ),
    );

    await expectLater(
      api.fetchDetail('access-token', orderId: 'not-an-order'),
      throwsArgumentError,
    );
    await expectLater(
      api.fetchPage('access-token', limit: 100),
      throwsRangeError,
    );
    expect(requests, 0);
  });
}
