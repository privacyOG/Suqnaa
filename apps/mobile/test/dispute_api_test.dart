import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:suqnaa/src/api/authed_api.dart';
import 'package:suqnaa/src/api/dispute_api.dart';

const disputeId = '123e4567-e89b-42d3-a456-426614174000';
const orderId = '223e4567-e89b-42d3-a456-426614174000';
const paymentIntentId = '323e4567-e89b-42d3-a456-426614174000';
const buyerId = '423e4567-e89b-42d3-a456-426614174000';
const sellerId = '523e4567-e89b-42d3-a456-426614174000';

Map<String, dynamic> summary() => {
  'id': disputeId,
  'orderId': orderId,
  'paymentIntentId': paymentIntentId,
  'openedByUserId': buyerId,
  'respondentUserId': sellerId,
  'openedByRole': 'buyer',
  'category': 'non_delivery',
  'status': 'awaiting_seller',
  'outcome': 'none',
  'reason': 'The order has not arrived after the expected delivery window.',
  'summary': null,
  'responseDueAt': '2026-08-13T00:00:00.000Z',
  'reviewDueAt': '2026-08-18T00:00:00.000Z',
  'appealDeadlineAt': null,
  'openedAt': '2026-08-08T00:00:00.000Z',
  'resolvedAt': null,
  'lastActivityAt': '2026-08-08T00:00:00.000Z',
};

void main() {
  test('lists, opens and strictly parses participant disputes', () async {
    final requests = <http.Request>[];
    final client = MockClient((request) async {
      requests.add(request);
      if (request.method == 'GET') return http.Response(jsonEncode({'disputes': [summary()]}), 200);
      return http.Response(jsonEncode({'dispute': summary()}), 201);
    });
    final api = DisputeApi(authedApi: AuthedApi(baseUrl: Uri.parse('https://api.suqnaa.test'), client: client));
    final rows = await api.list('access-token');
    expect(rows.single.orderId, orderId);
    final opened = await api.open('access-token', orderId: orderId, category: 'non_delivery', reason: 'The order has not arrived after the expected delivery window.');
    expect(opened.id, disputeId);
    expect(requests[0].url.path, '/v1/market/disputes');
    expect(requests[1].headers['authorization'], 'Bearer access-token');
    expect(jsonDecode(requests[1].body), {
      'orderId': orderId,
      'category': 'non_delivery',
      'reason': 'The order has not arrived after the expected delivery window.',
    });
  });

  test('uploads bounded private image evidence with exact content type', () async {
    http.Request? captured;
    final client = MockClient((request) async {
      captured = request;
      return http.Response(jsonEncode({'evidence': {'id': disputeId}}), 201);
    });
    final api = DisputeApi(authedApi: AuthedApi(baseUrl: Uri.parse('https://api.suqnaa.test'), client: client));
    await api.uploadImageEvidence('access-token', disputeId: disputeId, filename: 'proof.png', contentType: 'image/png', bytes: Uint8List.fromList([137,80,78,71]));
    expect(captured?.method, 'POST');
    expect(captured?.headers['content-type'], 'image/png');
    expect(captured?.url.path, '/v1/market/disputes/$disputeId/evidence/upload');
    expect(captured?.url.queryParameters['evidenceType'], 'participant_image');
    expect(captured?.url.queryParameters['filename'], 'proof.png');
  });

  test('rejects invalid identifiers, categories and oversized evidence before transport', () async {
    var calls = 0;
    final api = DisputeApi(authedApi: AuthedApi(baseUrl: Uri.parse('https://api.suqnaa.test'), client: MockClient((request) async { calls += 1; return http.Response('{}', 200); })));
    await expectLater(api.open('access-token', orderId: 'bad', category: 'non_delivery', reason: 'This reason is sufficiently long for validation.'), throwsA(isA<FormatException>()));
    await expectLater(api.open('access-token', orderId: orderId, category: 'invalid', reason: 'This reason is sufficiently long for validation.'), throwsA(isA<FormatException>()));
    await expectLater(api.uploadImageEvidence('access-token', disputeId: disputeId, filename: 'bad.gif', contentType: 'image/gif', bytes: Uint8List(4)), throwsA(isA<FormatException>()));
    expect(calls, 0);
  });
}
