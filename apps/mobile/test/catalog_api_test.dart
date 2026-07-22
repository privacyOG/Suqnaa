import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:suqnaa/src/api/catalog_api.dart';

const listingId = '123e4567-e89b-42d3-a456-426614174000';
const mediaId = '223e4567-e89b-42d3-a456-426614174000';
const sellerId = '323e4567-e89b-42d3-a456-426614174000';
const categoryId = '423e4567-e89b-42d3-a456-426614174000';

Map<String, dynamic> listingPayload({String mediaListingId = listingId}) {
  return {
    'id': listingId,
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
    'allowDelivery': true,
    'media': [
      {
        'id': mediaId,
        'url': '/v1/listings/$mediaListingId/media/$mediaId',
        'mimeType': 'image/jpeg',
        'altText': 'Camera',
      }
    ],
    'mediaCount': 1,
    'category': {
      'id': categoryId,
      'slug': 'electronics',
      'nameEn': 'Electronics',
      'nameAr': 'إلكترونيات',
    },
    'seller': {
      'id': sellerId,
      'displayName': 'Seller',
      'status': 'active',
    }
  };
}

Future<Object?> captureException(Future<Object?> Function() action) async {
  try {
    await action();
    return null;
  } catch (error) {
    return error;
  }
}

void main() {
  test('catalog search serializes complete filters and resolves media URLs', () async {
    Uri? requestedUri;
    final client = MockClient((request) async {
      requestedUri = request.url;
      return http.Response(
        jsonEncode({
          'listings': [listingPayload()],
          'pagination': {
            'hasMore': true,
            'nextCursor': 'ls1.opaque-cursor',
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
      before: 'ls1.previous-cursor',
      query: 'camera',
      categoryId: categoryId,
      condition: 'like_new',
      availabilityStatus: 'in_stock',
      minimumPrice: 100,
      maximumPrice: 1200,
      currency: 'aud',
      country: 'au',
      region: 'NSW',
      city: 'Sydney',
      suburb: 'Greenacre',
      fulfilment: 'both',
      sort: 'price_asc',
    ));

    expect(requestedUri?.path, '/v1/listings/search');
    expect(requestedUri?.queryParameters, containsPair('before', 'ls1.previous-cursor'));
    expect(requestedUri?.queryParameters, containsPair('q', 'camera'));
    expect(requestedUri?.queryParameters, containsPair('categoryId', categoryId));
    expect(requestedUri?.queryParameters, containsPair('condition', 'like_new'));
    expect(requestedUri?.queryParameters, containsPair('availabilityStatus', 'in_stock'));
    expect(requestedUri?.queryParameters, containsPair('minPrice', '100.0'));
    expect(requestedUri?.queryParameters, containsPair('maxPrice', '1200.0'));
    expect(requestedUri?.queryParameters, containsPair('currency', 'AUD'));
    expect(requestedUri?.queryParameters, containsPair('country', 'AU'));
    expect(requestedUri?.queryParameters, containsPair('region', 'NSW'));
    expect(requestedUri?.queryParameters, containsPair('city', 'Sydney'));
    expect(requestedUri?.queryParameters, containsPair('suburb', 'Greenacre'));
    expect(requestedUri?.queryParameters, containsPair('fulfilment', 'both'));
    expect(requestedUri?.queryParameters, containsPair('sort', 'price_asc'));
    expect(page.hasMore, isTrue);
    expect(page.nextCursor, 'ls1.opaque-cursor');
    expect(page.listings.single.title, 'Mirrorless camera');
    expect(page.listings.single.priceAmount, 899.5);
    expect(page.listings.single.category?.labelFor('ar'), 'إلكترونيات');
    expect(
      page.listings.single.coverMedia?.url,
      'https://api.suqnaa.test/v1/listings/$listingId/media/$mediaId',
    );
  });

  test('newest search omits the default sort parameter', () {
    final query = const CatalogSearchOptions(
      country: 'au',
      city: 'Sydney',
    ).toQueryParameters();

    expect(query, containsPair('country', 'AU'));
    expect(query, containsPair('city', 'Sydney'));
    expect(query.containsKey('sort'), isFalse);
  });

  test('rejects invalid search option combinations before transport', () {
    expect(
      () => const CatalogSearchOptions(minimumPrice: 10).toQueryParameters(),
      throwsArgumentError,
    );
    expect(
      () => const CatalogSearchOptions(
        minimumPrice: 20,
        maximumPrice: 10,
        currency: 'AUD',
      ).toQueryParameters(),
      throwsArgumentError,
    );
    expect(
      () => const CatalogSearchOptions(
        sort: 'price_desc',
      ).toQueryParameters(),
      throwsArgumentError,
    );
    expect(
      () => const CatalogSearchOptions(
        categoryId: 'not-a-category',
      ).toQueryParameters(),
      throwsArgumentError,
    );
    expect(
      () => const CatalogSearchOptions(fulfilment: 'unknown').toQueryParameters(),
      throwsArgumentError,
    );
  });

  test('rejects cross-listing media paths', () async {
    final client = MockClient((request) async => http.Response(
          jsonEncode({
            'listings': [
              listingPayload(
                mediaListingId: '523e4567-e89b-42d3-a456-426614174000',
              )
            ],
            'pagination': {
              'hasMore': false,
              'nextCursor': null,
            }
          }),
          200,
        ));
    final api = CatalogApi(
      baseUrl: Uri.parse('https://api.suqnaa.test'),
      client: client,
    );

    final error = await captureException(
      () => api.search(const CatalogSearchOptions()),
    );
    expect(error, isA<FormatException>());
    expect(error.toString(), contains('Invalid listing media URL'));
  });

  test('rejects contradictory pagination', () async {
    final client = MockClient((request) async => http.Response(
          jsonEncode({
            'listings': [listingPayload()],
            'pagination': {
              'hasMore': true,
              'nextCursor': null,
            }
          }),
          200,
        ));
    final api = CatalogApi(
      baseUrl: Uri.parse('https://api.suqnaa.test'),
      client: client,
    );

    final error = await captureException(
      () => api.search(const CatalogSearchOptions()),
    );
    expect(error, isA<CatalogRequestException>());
    expect(error.toString(), contains('Invalid listing pagination response'));
  });

  test('catalog categories retain bilingual names', () async {
    final client = MockClient((request) async => http.Response.bytes(
          utf8.encode(jsonEncode({
            'categories': [
              {
                'id': categoryId,
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
