import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:suqnaa/src/api/authed_api.dart';
import 'package:suqnaa/src/api/order_fulfilment_api.dart';

const orderId = '123e4567-e89b-42d3-a456-426614174000';
const otherOrderId = '223e4567-e89b-42d3-a456-426614174000';
const intentId = '323e4567-e89b-42d3-a456-426614174000';
const fulfilmentId = '423e4567-e89b-42d3-a456-426614174000';

String contextResponse({String responseOrderId = orderId}) => jsonEncode({
      'orderId': responseOrderId,
      'paymentContext': {
        'paymentIntent': {
          'id': intentId,
          'rail': 'card',
          'status': 'held',
          'providerConfigured': true,
          'expiresAt': null,
          'createdAt': '2026-07-21T10:00:00.000Z',
          'updatedAt': '2026-07-21T10:00:00.000Z',
        },
        'fulfilment': {
          'id': fulfilmentId,
          'status': 'not_started',
          'createdAt': '2026-07-21T10:00:00.000Z',
          'updatedAt': '2026-07-21T10:00:00.000Z',
        },
        'releaseModel': 'hold_until_fulfilment_or_dispute_resolution',
        'operations': {
          'collectionEnabled': false,
          'releaseEnabled': false,
        },
      },
    });

String mutationResponse({
  String responseOrderId = orderId,
  String status = 'shipped',
  bool releaseEnabled = false,
}) =>
    jsonEncode({
      'accepted': true,
      'orderId': responseOrderId,
      'fulfilment': {
        'id': fulfilmentId,
        'status': status,
        'carrier': 'Australia Post',
        'trackingReference': 'TRACK-123',
        'shippedAt': '2026-07-21T11:00:00.000Z',
        'deliveredAt': null,
        'buyerConfirmedAt': null,
        'updatedAt': '2026-07-21T11:00:00.000Z',
        'unchanged': false,
      },
      'payment': {'releaseEnabled': releaseEnabled},
    });

void main() {
  test('loads strict participant payment and fulfilment context', () async {
    http.Request? captured;
    final client = MockClient((request) async {
      captured = request;
      return http.Response(contextResponse(), 200);
    });
    final api = OrderFulfilmentApi(
      authedApi: AuthedApi(
        baseUrl: Uri.parse('https://api.suqnaa.test'),
        client: client,
      ),
    );

    final result = await api.fetchContext('access-token', orderId: orderId);

    expect(captured?.method, 'GET');
    expect(
      captured?.url.toString(),
      'https://api.suqnaa.test/v1/market/orders/$orderId/payment-context',
    );
    expect(captured?.headers['authorization'], 'Bearer access-token');
    expect(result.orderId, orderId);
    expect(result.paymentStatus, MobilePaymentContextStatus.held);
    expect(result.providerConfigured, isTrue);
    expect(result.fulfilmentStatus, MobileFulfilmentStatus.notStarted);
    expect(result.releaseEnabled, isFalse);
  });

  test('sends trimmed shipment evidence to the order-bound route', () async {
    http.Request? captured;
    final client = MockClient((request) async {
      captured = request;
      return http.Response(mutationResponse(), 200);
    });
    final api = OrderFulfilmentApi(
      authedApi: AuthedApi(
        baseUrl: Uri.parse('https://api.suqnaa.test'),
        client: client,
      ),
    );

    final result = await api.update(
      'access-token',
      orderId: orderId,
      action: MobileFulfilmentAction.shipped,
      carrier: '  Australia Post  ',
      trackingReference: '  TRACK-123  ',
      challengeResponse: '  verified-check  ',
    );

    expect(captured?.method, 'POST');
    expect(
      captured?.url.toString(),
      'https://api.suqnaa.test/v1/market/orders/$orderId/fulfilment',
    );
    expect(captured?.headers['authorization'], 'Bearer access-token');
    expect(captured?.headers['x-suqnaa-human-check'], 'verified-check');
    expect(jsonDecode(captured?.body ?? ''), {
      'action': 'shipped',
      'carrier': 'Australia Post',
      'trackingReference': 'TRACK-123',
    });
    expect(result.orderId, orderId);
    expect(result.status, MobileFulfilmentStatus.shipped);
    expect(result.carrier, 'Australia Post');
  });

  test('rejects mismatched order, status, or release responses', () async {
    Future<void> expectRejected(String response) async {
      final client = MockClient((request) async => http.Response(response, 200));
      final api = OrderFulfilmentApi(
        authedApi: AuthedApi(
          baseUrl: Uri.parse('https://api.suqnaa.test'),
          client: client,
        ),
      );
      await expectLater(
        api.update(
          'access-token',
          orderId: orderId,
          action: MobileFulfilmentAction.shipped,
          carrier: 'Australia Post',
          trackingReference: 'TRACK-123',
        ),
        throwsA(isA<FormatException>()),
      );
    }

    await expectRejected(mutationResponse(responseOrderId: otherOrderId));
    await expectRejected(mutationResponse(status: 'ready_for_pickup'));
    await expectRejected(mutationResponse(releaseEnabled: true));
  });

  test('rejects invalid identifiers and shipment evidence before request', () async {
    var requests = 0;
    final client = MockClient((request) async {
      requests += 1;
      return http.Response(mutationResponse(), 200);
    });
    final api = OrderFulfilmentApi(
      authedApi: AuthedApi(
        baseUrl: Uri.parse('https://api.suqnaa.test'),
        client: client,
      ),
    );

    await expectLater(
      api.fetchContext('access-token', orderId: 'not-an-order'),
      throwsArgumentError,
    );
    await expectLater(
      api.update(
        'access-token',
        orderId: orderId,
        action: MobileFulfilmentAction.shipped,
        carrier: 'A',
        trackingReference: 'TRACK-123',
      ),
      throwsArgumentError,
    );
    await expectLater(
      api.update(
        'access-token',
        orderId: orderId,
        action: MobileFulfilmentAction.readyForPickup,
        carrier: 'Unexpected',
      ),
      throwsArgumentError,
    );
    expect(requests, 0);
  });
}
