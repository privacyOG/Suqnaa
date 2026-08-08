import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:suqnaa/src/api/authed_api.dart';
import 'package:suqnaa/src/api/catalog_api.dart';
import 'package:suqnaa/src/api/discovery_api.dart';

const listingId = '123e4567-e89b-42d3-a456-426614174000';
const searchId = '223e4567-e89b-42d3-a456-426614174000';
const notificationId = '323e4567-e89b-42d3-a456-426614174000';

void main() {
  test('uses protected discovery routes and strictly parses responses', () async {
    final requests = <http.Request>[];
    final client = MockClient((request) async {
      requests.add(request);
      if (request.url.path.endsWith('/state')) {
        return http.Response(jsonEncode({
          'state': {'listingId': listingId, 'saved': true, 'watching': false},
        }), 200);
      }
      if (request.url.path == '/v1/discovery/saved-listings') {
        return http.Response(jsonEncode({
          'items': [
            {
              'listingId': listingId,
              'available': true,
              'listing': {
                'id': listingId,
                'title': 'Camera',
                'priceAmount': '899.50',
                'currencyCode': 'AUD',
                'city': 'Sydney',
                'countryCode': 'AU',
              }
            }
          ]
        }), 200);
      }
      if (request.url.path == '/v1/discovery/saved-searches' && request.method == 'GET') {
        return http.Response(jsonEncode({
          'searches': [
            {'id': searchId, 'name': 'Sydney camera', 'filters': {'q': 'camera'}, 'active': true}
          ]
        }), 200);
      }
      if (request.url.path == '/v1/discovery/saved-searches' && request.method == 'POST') {
        return http.Response(jsonEncode({
          'search': {
            'id': searchId,
            'name': 'Sydney camera',
            'filters': {
              'q': 'camera',
              'country': 'AU',
              'nearLat': -33.87,
              'nearLon': 151.21,
              'radiusKm': 20.0,
            },
            'active': true,
          }
        }), 201);
      }
      if (request.url.path == '/v1/discovery/notifications') {
        return http.Response(jsonEncode({
          'notifications': [
            {
              'id': notificationId,
              'searchName': 'Sydney camera',
              'listingId': listingId,
              'readAt': null,
              'available': true,
              'listing': {
                'id': listingId,
                'title': 'Camera',
                'priceAmount': '899.50',
                'currencyCode': 'AUD',
                'city': 'Sydney',
                'countryCode': 'AU',
              }
            }
          ]
        }), 200);
      }
      return http.Response(jsonEncode({'ok': true}), 200);
    });

    final api = DiscoveryApi(
      authedApi: AuthedApi(
        baseUrl: Uri.parse('https://api.suqnaa.test'),
        client: client,
      ),
    );

    final state = await api.getListingState('token', listingId);
    expect(state.saved, isTrue);
    expect(requests.last.url.path, '/v1/discovery/listings/$listingId/state');

    final saved = await api.getSavedListings('token');
    expect(saved.single.listing?.title, 'Camera');
    expect(requests.last.url.queryParameters['limit'], '50');

    final searches = await api.getSavedSearches('token');
    expect(searches.single.active, isTrue);

    final created = await api.createSavedSearch(
      'token',
      name: 'Sydney camera',
      filters: const CatalogSearchOptions(
        query: 'camera',
        country: 'au',
        nearLatitude: -33.8688,
        nearLongitude: 151.2093,
        radiusKm: 20,
        sort: 'distance',
      ),
    );
    expect(created.id, searchId);
    final savedBody = jsonDecode(requests.last.body) as Map<String, dynamic>;
    expect(savedBody['filters'], {
      'q': 'camera',
      'country': 'AU',
      'nearLat': -33.87,
      'nearLon': 151.21,
      'radiusKm': 20.0,
    });
    expect(savedBody.containsKey('limit'), isFalse);
    expect(savedBody.containsKey('sort'), isFalse);

    final notifications = await api.getNotifications('token', unreadOnly: true);
    expect(notifications.single.read, isFalse);
    expect(requests.last.url.queryParameters['unreadOnly'], 'true');

    await api.saveListing('token', listingId);
    expect(requests.last.url.path, '/v1/discovery/saved-listings/$listingId/save');
    await api.watchListing('token', listingId);
    expect(requests.last.url.path, '/v1/discovery/watchlist/$listingId/watch');
    await api.recordView('token', listingId);
    expect(requests.last.url.path, '/v1/discovery/recently-viewed/$listingId/view');
    expect(requests.last.headers['authorization'], 'Bearer token');
  });

  test('rejects malformed discovery relationship response', () async {
    final client = MockClient((_) async => http.Response(jsonEncode({
      'items': [
        {
          'listingId': listingId,
          'available': true,
          'listing': null,
        }
      ]
    }), 200));
    final api = DiscoveryApi(
      authedApi: AuthedApi(baseUrl: Uri.parse('https://api.suqnaa.test'), client: client),
    );
    await expectLater(api.getSavedListings('token'), throwsFormatException);
  });
}
