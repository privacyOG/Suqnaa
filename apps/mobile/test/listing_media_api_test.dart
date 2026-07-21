import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:suqnaa/src/api/authed_api.dart';
import 'package:suqnaa/src/api/listing_media_api.dart';

const listingId = '123e4567-e89b-42d3-a456-426614174000';
const mediaId = '223e4567-e89b-42d3-a456-426614174000';
const otherListingId = '323e4567-e89b-42d3-a456-426614174000';

Map<String, dynamic> listingJson({int mediaCount = 1}) => {
      'id': listingId,
      'title': 'Test phone',
      'status': 'draft',
      'mediaCount': mediaCount,
    };

Map<String, dynamic> mediaJson({
  String listing = listingId,
  String media = mediaId,
  String mimeType = 'image/jpeg',
  int sortOrder = 0,
}) => {
      'id': media,
      'url': '/v1/listings/$listing/media/$media/mine',
      'mimeType': mimeType,
      'width': 1200,
      'height': 800,
      'sizeBytes': 4,
      'sortOrder': sortOrder,
      'altText': 'Test phone',
      'createdAt': '2026-07-21T01:00:00.000Z',
    };

void main() {
  test('loads seller listings and owner gallery with bound preview URLs', () async {
    final requests = <http.Request>[];
    final client = MockClient((request) async {
      requests.add(request);
      if (request.url.path == '/v1/listings/mine') {
        return http.Response(
          jsonEncode({
            'listings': [listingJson()],
            'pagination': {'hasMore': false, 'nextCursor': null},
          }),
          200,
        );
      }
      if (request.url.path == '/v1/listings/$listingId/media/mine') {
        return http.Response(
          jsonEncode({
            'listing': {
              'id': listingId,
              'title': 'Test phone',
              'status': 'draft',
            },
            'media': [mediaJson()],
            'mediaCount': 1,
          }),
          200,
        );
      }
      return http.Response('{}', 404);
    });
    final api = ListingMediaApi(
      authedApi: AuthedApi(
        baseUrl: Uri.parse('https://api.suqnaa.test'),
        client: client,
      ),
      apiBaseUrl: Uri.parse('https://api.suqnaa.test'),
    );

    final listings = await api.fetchListings('access-token');
    final gallery = await api.fetchGallery(
      'access-token',
      listingId: listingId,
    );

    expect(listings, hasLength(1));
    expect(listings.single.mediaCount, 1);
    expect(gallery.listing.mediaCount, 1);
    expect(gallery.media.single.id, mediaId);
    expect(
      gallery.media.single.uri.toString(),
      'https://api.suqnaa.test/v1/listings/$listingId/media/$mediaId/mine',
    );
    expect(requests, hasLength(2));
    expect(requests.first.url.queryParameters, {'limit': '50'});
    expect(requests.every((item) => item.headers['authorization'] == 'Bearer access-token'), isTrue);
  });

  test('uploads one binary image with exact metadata and protected headers', () async {
    http.Request? captured;
    final client = MockClient((request) async {
      captured = request;
      return http.Response(
        jsonEncode({
          'media': {
            'id': mediaId,
            'url': '/v1/listings/$listingId/media/$mediaId',
            'mimeType': 'image/jpeg',
            'sortOrder': 2,
          },
          'mediaCount': 3,
        }),
        201,
      );
    });
    final api = ListingMediaApi(
      authedApi: AuthedApi(
        baseUrl: Uri.parse('https://api.suqnaa.test'),
        client: client,
      ),
      apiBaseUrl: Uri.parse('https://api.suqnaa.test'),
    );
    final bytes = Uint8List.fromList([0xff, 0xd8, 0xff, 0xd9]);

    final result = await api.upload(
      'access-token',
      listingId: listingId,
      listingTitle: 'Test phone',
      sortOrder: 2,
      image: PickedListingImage(
        bytes: bytes,
        mimeType: 'image/jpeg',
        fileName: 'phone.jpg',
      ),
      challengeResponse: 'media-check',
    );

    expect(result.mediaId, mediaId);
    expect(result.mediaCount, 3);
    expect(captured?.method, 'POST');
    expect(captured?.url.path, '/v1/listings/$listingId/media/upload');
    expect(captured?.url.queryParameters, {
      'altText': 'Test phone',
      'sortOrder': '2',
    });
    expect(captured?.headers['authorization'], 'Bearer access-token');
    expect(captured?.headers['content-type'], 'image/jpeg');
    expect(captured?.headers['x-suqnaa-human-check'], 'media-check');
    expect(captured?.bodyBytes, bytes);
  });

  test('deletes only the requested listing media identifier', () async {
    http.Request? captured;
    final client = MockClient((request) async {
      captured = request;
      return http.Response(
        jsonEncode({
          'deleted': true,
          'mediaId': mediaId,
          'mediaCount': 0,
        }),
        200,
      );
    });
    final api = ListingMediaApi(
      authedApi: AuthedApi(
        baseUrl: Uri.parse('https://api.suqnaa.test'),
        client: client,
      ),
      apiBaseUrl: Uri.parse('https://api.suqnaa.test'),
    );

    final result = await api.delete(
      'access-token',
      listingId: listingId,
      mediaId: mediaId,
      challengeResponse: 'delete-check',
    );

    expect(result.mediaId, mediaId);
    expect(result.mediaCount, 0);
    expect(
      captured?.url.path,
      '/v1/listings/$listingId/media/$mediaId/delete',
    );
    expect(captured?.headers['x-suqnaa-human-check'], 'delete-check');
    expect(jsonDecode(captured!.body), <String, dynamic>{});
  });

  test('rejects cross-listing owner preview URLs', () {
    expect(
      () => SellerListingGallery.fromJson(
        {
          'listing': {
            'id': listingId,
            'title': 'Test phone',
            'status': 'draft',
          },
          'media': [mediaJson(listing: otherListingId)],
          'mediaCount': 1,
        },
        Uri.parse('https://api.suqnaa.test'),
      ),
      throwsFormatException,
    );
  });

  test('rejects conflicting uploaded media evidence', () async {
    final client = MockClient((request) async {
      return http.Response(
        jsonEncode({
          'media': {
            'id': mediaId,
            'url': '/v1/listings/$otherListingId/media/$mediaId',
            'mimeType': 'image/jpeg',
            'sortOrder': 0,
          },
          'mediaCount': 1,
        }),
        201,
      );
    });
    final api = ListingMediaApi(
      authedApi: AuthedApi(
        baseUrl: Uri.parse('https://api.suqnaa.test'),
        client: client,
      ),
      apiBaseUrl: Uri.parse('https://api.suqnaa.test'),
    );

    await expectLater(
      api.upload(
        'access-token',
        listingId: listingId,
        listingTitle: 'Test phone',
        sortOrder: 0,
        image: PickedListingImage(
          bytes: Uint8List.fromList([0xff, 0xd8, 0xff]),
          mimeType: 'image/jpeg',
          fileName: 'phone.jpg',
        ),
      ),
      throwsFormatException,
    );
  });

  test('rejects malformed identifiers and oversized challenge values', () async {
    final api = ListingMediaApi(
      authedApi: AuthedApi(
        baseUrl: Uri.parse('https://api.suqnaa.test'),
        client: MockClient((request) async => http.Response('{}', 200)),
      ),
      apiBaseUrl: Uri.parse('https://api.suqnaa.test'),
    );

    await expectLater(
      api.fetchGallery('access-token', listingId: 'not-a-listing'),
      throwsArgumentError,
    );
    await expectLater(
      api.delete(
        'access-token',
        listingId: listingId,
        mediaId: 'not-media',
      ),
      throwsArgumentError,
    );
    await expectLater(
      api.delete(
        'access-token',
        listingId: listingId,
        mediaId: mediaId,
        challengeResponse: 'x' * (maximumChallengeResponseLength + 1),
      ),
      throwsArgumentError,
    );
  });
}
