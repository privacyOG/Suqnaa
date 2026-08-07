import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:suqnaa/src/api/authed_api.dart';
import 'package:suqnaa/src/api/seller_listing_api.dart';

const listingId = '123e4567-e89b-42d3-a456-426614174000';

void main() {
  test('loads lifecycle and renews with the current listing version', () async {
    final requests = <http.Request>[];
    final client = MockClient((request) async {
      requests.add(request);
      if (request.method == 'GET') {
        return http.Response(jsonEncode({
          'listing': {
            'id': listingId,
            'status': 'active',
            'availabilityStatus': 'limited',
            'availableQuantity': 2,
            'version': 8,
          },
          'renewable': true,
          'renewalAvailableAt': '2026-08-31T00:00:00.000Z',
          'activeDays': 30,
        }), 200);
      }
      return http.Response(jsonEncode({
        'listing': {
          'id': listingId,
          'status': 'active',
          'availabilityStatus': 'limited',
          'availableQuantity': 2,
          'version': 9,
        },
        'reactivated': false,
      }), 200);
    });
    final api = SellerListingApi(
      authedApi: AuthedApi(
        baseUrl: Uri.parse('https://api.suqnaa.test'),
        client: client,
      ),
    );

    final snapshot = await api.getLifecycle('access-token', listingId: listingId);
    expect(snapshot['renewable'], isTrue);
    expect(requests.last.method, 'GET');
    expect(requests.last.url.path, '/v1/listings/$listingId/lifecycle');
    expect(requests.last.headers['authorization'], 'Bearer access-token');

    final result = await api.renewLifecycle(
      'access-token',
      listingId: listingId,
      version: 8,
    );
    expect(requests.last.method, 'POST');
    expect(requests.last.url.path, '/v1/listings/$listingId/renew');
    expect(jsonDecode(requests.last.body), {'version': 8});
    expect(result['listing']['version'], 9);
  });
}
