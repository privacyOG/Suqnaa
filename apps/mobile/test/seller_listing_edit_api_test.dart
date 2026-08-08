import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:suqnaa/src/api/authed_api.dart';
import 'package:suqnaa/src/api/seller_listing_api.dart';

const listingId = '123e4567-e89b-42d3-a456-426614174000';

void main() {
  test('uses exact owner edit and approximate location routes', () async {
    final requests = <http.Request>[];
    final client = MockClient((request) async {
      requests.add(request);
      if (request.method == 'GET' && request.url.path.endsWith('/location/manage')) {
        return http.Response(jsonEncode({
          'listing': {
            'listingId': listingId,
            'version': 6,
            'status': 'draft',
            'approximateLocation': {'latitude': -33.87, 'longitude': 151.21},
            'editable': true,
          }
        }), 200);
      }
      if (request.method == 'GET' && request.url.path.endsWith('/manage')) {
        return http.Response(jsonEncode({
          'listing': {'id': listingId, 'version': 5, 'status': 'draft'},
          'editable': true,
        }), 200);
      }
      if (request.method == 'GET' && request.url.path == '/v1/categories') {
        return http.Response(jsonEncode({'categories': []}), 200);
      }
      return http.Response(jsonEncode({
        'listing': {'id': listingId, 'version': 6, 'status': 'draft'},
        'unchanged': false,
      }), 200);
    });
    final api = SellerListingApi(
      authedApi: AuthedApi(
        baseUrl: Uri.parse('https://api.suqnaa.test'),
        client: client,
      ),
    );

    final snapshot = await api.getForEdit('access-token', listingId: listingId);
    expect(snapshot['editable'], isTrue);
    expect(requests.last.url.path, '/v1/listings/$listingId/manage');
    expect(requests.last.headers['authorization'], 'Bearer access-token');

    await api.getCategories('access-token');
    expect(requests.last.url.path, '/v1/categories');

    final input = <String, dynamic>{
      'version': 5,
      'categoryId': null,
      'title': 'Updated listing',
      'description': 'A complete updated listing description.',
      'priceAmount': 110.5,
      'currencyCode': 'AUD',
      'condition': 'good',
      'availabilityStatus': 'in_stock',
      'availableQuantity': 2,
      'unitLabel': 'items',
      'countryCode': 'AU',
      'region': 'NSW',
      'city': 'Sydney',
      'suburb': 'Greenacre',
      'allowPickup': true,
      'allowDelivery': false,
    };
    final result = await api.updateDetails(
      'access-token',
      listingId: listingId,
      input: input,
    );

    expect(requests.last.method, 'POST');
    expect(requests.last.url.path, '/v1/listings/$listingId/edit');
    expect(jsonDecode(requests.last.body), input);
    expect(result['listing']['version'], 6);

    final location = await api.getLocation('access-token', listingId: listingId);
    expect(location['listing']['version'], 6);
    expect(requests.last.url.path, '/v1/listings/$listingId/location/manage');

    await api.updateLocation(
      'access-token',
      listingId: listingId,
      version: 6,
      approximateLocation: const {'latitude': -33.87, 'longitude': 151.21},
    );
    expect(requests.last.method, 'POST');
    expect(requests.last.url.path, '/v1/listings/$listingId/location');
    expect(jsonDecode(requests.last.body), {
      'version': 6,
      'approximateLocation': {'latitude': -33.87, 'longitude': 151.21},
    });
  });
}
