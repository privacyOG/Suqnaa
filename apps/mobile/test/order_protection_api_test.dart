import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:suqnaa/src/api/authed_api.dart';
import 'package:suqnaa/src/api/order_protection_api.dart';

const orderId = '123e4567-e89b-42d3-a456-426614174000';
const returnId = '223e4567-e89b-42d3-a456-426614174000';
const buyerId = '323e4567-e89b-42d3-a456-426614174000';
const sellerId = '423e4567-e89b-42d3-a456-426614174000';
const caseId = '523e4567-e89b-42d3-a456-426614174000';

Map<String, dynamic> snapshot({String? trackingUrl}) => {
  'cases': [
    {
      'id': caseId,
      'claim_type': 'item_condition',
      'policy_version': 'au-marketplace-protection-v1',
    }
  ],
  'returns': [
    {
      'id': returnId,
      'buyer_id': buyerId,
      'seller_id': sellerId,
      'status': 'authorized',
      'reason': 'Item condition materially differed from listing.',
      'return_due_at': '2026-08-20T00:00:00.000Z',
      'carrier': null,
      'tracking_reference': null,
      'tracking_url': trackingUrl,
      'seller_condition': null,
      'seller_condition_note': null,
    }
  ],
};

void main() {
  test('loads strict protection snapshot', () async {
    http.Request? captured;
    final client = MockClient((request) async {
      captured = request;
      return http.Response(jsonEncode(snapshot()), 200);
    });
    final api = OrderProtectionApi(
      authedApi: AuthedApi(
        baseUrl: Uri.parse('https://api.suqnaa.test'),
        client: client,
      ),
    );

    final result = await api.read('access-token', orderId);

    expect(captured?.method, 'GET');
    expect(captured?.url.toString(), 'https://api.suqnaa.test/v1/market/orders/$orderId/protection');
    expect(captured?.headers['authorization'], 'Bearer access-token');
    expect(result.cases.single.policyVersion, 'au-marketplace-protection-v1');
    expect(result.returns.single.buyerId, buyerId);
    expect(result.returns.single.status, 'authorized');
  });

  test('sends trimmed HTTPS return shipment', () async {
    http.Request? captured;
    final client = MockClient((request) async {
      captured = request;
      return http.Response(jsonEncode({'return': snapshot()['returns']!.first}), 200);
    });
    final api = OrderProtectionApi(
      authedApi: AuthedApi(baseUrl: Uri.parse('https://api.suqnaa.test'), client: client),
    );

    await api.shipReturn(
      'access-token',
      returnId: returnId,
      carrier: '  Australia Post  ',
      trackingReference: '  TRACK-123  ',
      trackingUrl: '  https://auspost.com.au/track/TRACK-123  ',
    );

    expect(captured?.method, 'POST');
    expect(captured?.url.toString(), 'https://api.suqnaa.test/v1/market/returns/$returnId/ship');
    expect(jsonDecode(captured?.body ?? ''), {
      'carrier': 'Australia Post',
      'trackingReference': 'TRACK-123',
      'trackingUrl': 'https://auspost.com.au/track/TRACK-123',
    });
  });

  test('rejects non-HTTPS tracking before request', () async {
    var requests = 0;
    final client = MockClient((request) async {
      requests += 1;
      return http.Response('{}', 200);
    });
    final api = OrderProtectionApi(
      authedApi: AuthedApi(baseUrl: Uri.parse('https://api.suqnaa.test'), client: client),
    );

    await expectLater(
      api.shipReturn(
        'access-token',
        returnId: returnId,
        carrier: 'Australia Post',
        trackingReference: 'TRACK-123',
        trackingUrl: 'http://example.test/track',
      ),
      throwsA(isA<FormatException>()),
    );
    expect(requests, 0);
  });

  test('requires a substantive seller contest note', () async {
    var requests = 0;
    final client = MockClient((request) async {
      requests += 1;
      return http.Response('{}', 200);
    });
    final api = OrderProtectionApi(
      authedApi: AuthedApi(baseUrl: Uri.parse('https://api.suqnaa.test'), client: client),
    );

    await expectLater(
      api.acknowledgeReturn(
        'access-token',
        returnId: returnId,
        condition: 'contested',
        note: 'short',
      ),
      throwsA(isA<FormatException>()),
    );
    expect(requests, 0);
  });

  test('rejects unsafe tracking URL from server response', () async {
    final client = MockClient((request) async => http.Response(jsonEncode(snapshot(trackingUrl: 'javascript:alert(1)')), 200));
    final api = OrderProtectionApi(
      authedApi: AuthedApi(baseUrl: Uri.parse('https://api.suqnaa.test'), client: client),
    );

    await expectLater(api.read('access-token', orderId), throwsA(isA<FormatException>()));
  });
}
