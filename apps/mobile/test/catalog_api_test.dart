import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:suqnaa/src/api/catalog_api.dart';

void main() {
  test('catalog search serializes filters and resolves media URLs', () async {
    Uri? requestedUri;
    final client = MockClient((request) async {
      requestedUri = request.url;
      return http.Response(
        jsonEncode({
          'listings': [
            {
              'id': '123e4567-e89b-42d3-a456-426614174000',
              'title': 'Mirrorless camera',
              'description': 'Camera body in excellent condition.',
              'priceAmount': '899.50',
              'currencyCode': 'AUD',
              'condition': 'like_new',
              'availabilityStatus': 'in_stock',
              'availableQuantity': 1,
              'unitLabel': 'item',
              'countryCode': 'AU',
              'region': 'NSW',
              'city': 'Sydney',
              'suburb': 'Greenacre',
              'allowPickup': true,
              'allowDelivery': false,
              'media': [
                {
                  'id': '223e4567-e89b-42d3-a456-426614174000',
                  'url': '/v1/listings/123e4567-e89b-42d3-a456-426614174000/media/223e4567-e89b-42d3-a456-426614174000',
                  'mimeType': 'image/jpeg',
                  'altText': 'Camera',
                }
              ],
              'mediaCount': 1,
              'seller': {
                'id': '323e4567-e89b-42d3-a456-426614174000',
                'displayName': 'Seller',
                'status': 'active',
              }
            }
          ],
          'pagination': {
            'hasMore': true,
            'nextCursor': '2026-07-20T00:00:00.000Z',
          }
        }),
        200,
        headers: {'content-type': 'application/json'},
      );
    });
    final api = CatalogApi(
      baseUrl: Uri.parse('https://api.suqnaa.test'),
      client: client,
    );

    final page = await api.search(const CatalogSearchOptions(
      limit: 24,
      query: 'camera',
      condition: 'like_new',
      minimumPrice: 100,
      maximumPrice: 1200,
      currency: 'aud',
      country: 'au',
      city: 'Sydney',
      fulfilment: 'pickup',
    ));

    expect(requestedUri?.path, '/v1/listings/search');
    expect(requestedUri?.queryParameters, containsPair('q', 'camera'));
    expect(requestedUri?.queryParameters, containsPair('condition', 'like_new'));
    expect(requestedUri?.queryParameters, containsPair('minPrice', '100.0'));
    expect(requestedUri?.queryParameters, containsPair('maxPrice', '1200.0'));
    expect(requestedUri?.queryParameters, containsPair('currency', 'AUD'));
    expect(requestedUri?.queryParameters, containsPair('country', 'AU'));
    expect(requestedUri?.queryParameters, containsPair('fulfilment', 'pickup'));
    expect(page.hasMore, isTrue);
    expect(page.nextCursor, '2026-07-20T00:00:00.000Z');
    expect(page.listings.single.title, 'Mirrorless camera');
    expect(page.listings.single.priceAmount, 899.5);
    expect(
      page.listings.single.coverMedia?.url,
      'https://api.suqnaa.test/v1/listings/123e4567-e89b-42d3-a456-426614174000/media/223e4567-e89b-42d3-a456-426614174000',
    );
  });

  test('catalog categories retain bilingual names', () async {
    final client = MockClient((request) async => http.Response.bytes(
          utf8.encode(jsonEncode({
            'categories': [
              {
                'id': '123e4567-e89b-42d3-a456-426614174000',
                'slug': 'electronics',
                'name_en': 'Electronics',
                'name_ar': 'إلكترونيات',
              }
            ]
          })),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        ));
    final api = CatalogApi(
      baseUrl: Uri.parse('https://api.suqnaa.test'),
      client: client,
    );

    final categories = await api.fetchCategories();

    expect(categories.single.labelFor('en'), 'Electronics');
    expect(categories.single.labelFor('ar'), 'إلكترونيات');
  });

  test('catalog errors expose status and retry interval', () async {
    final client = MockClient((request) async => http.Response(
          jsonEncode({'error': 'Too many requests'}),
          429,
          headers: {'retry-after': '30'},
        ));
    final api = CatalogApi(
      baseUrl: Uri.parse('https://api.suqnaa.test'),
      client: client,
    );

    await expectLater(
      api.search(const CatalogSearchOptions()),
      throwsA(
        isA<CatalogRequestException>()
            .having((error) => error.status, 'status', 429)
            .having(
              (error) => error.retryAfterSeconds,
              'retryAfterSeconds',
              30,
            ),
      ),
    );
  });
}
