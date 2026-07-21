import 'dart:typed_data';
import 'authed_api.dart';

final _uuidPattern = RegExp(
  r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
);
const _allowedMimeTypes = <String>{
  'image/jpeg',
  'image/png',
  'image/webp',
};
const maximumListingPhotoBytes = 4 * 1024 * 1024;
const maximumListingPhotoCount = 8;
const maximumChallengeResponseLength = 2048;

Map<String, dynamic> _requiredMap(Map<String, dynamic> json, String key) {
  final value = json[key];
  if (value is! Map) {
    throw FormatException('Invalid $key');
  }
  return Map<String, dynamic>.from(value);
}

String _requiredString(
  Map<String, dynamic> json,
  String key, {
  int maximumLength = 500,
}) {
  final value = json[key];
  if (value is! String || value.isEmpty || value.length > maximumLength) {
    throw FormatException('Invalid $key');
  }
  return value;
}

String _requiredUuid(Map<String, dynamic> json, String key) {
  final value = _requiredString(json, key, maximumLength: 36);
  if (!_uuidPattern.hasMatch(value)) {
    throw FormatException('Invalid $key');
  }
  return value;
}

String _requiredListingId(String value) {
  final normalized = value.trim();
  if (!_uuidPattern.hasMatch(normalized)) {
    throw ArgumentError.value(value, 'listingId', 'Must be a UUID');
  }
  return normalized;
}

String _requiredMediaId(String value) {
  final normalized = value.trim();
  if (!_uuidPattern.hasMatch(normalized)) {
    throw ArgumentError.value(value, 'mediaId', 'Must be a UUID');
  }
  return normalized;
}

DateTime _requiredDate(Map<String, dynamic> json, String key) {
  final value = _requiredString(json, key, maximumLength: 64);
  final parsed = DateTime.tryParse(value);
  if (parsed == null) {
    throw FormatException('Invalid $key');
  }
  return parsed;
}

int _requiredCount(Object? value, String label) {
  if (value is! int || value < 0 || value > maximumListingPhotoCount) {
    throw FormatException('Invalid $label');
  }
  return value;
}

String? _normalizedChallenge(String? value) {
  final normalized = value?.trim();
  if (normalized != null && normalized.length > maximumChallengeResponseLength) {
    throw ArgumentError.value(
      value,
      'challengeResponse',
      'Must not exceed $maximumChallengeResponseLength characters',
    );
  }
  return normalized;
}

enum MobileListingStatus {
  draft('draft'),
  active('active'),
  reserved('reserved'),
  sold('sold'),
  expired('expired'),
  removed('removed');

  const MobileListingStatus(this.wireValue);
  final String wireValue;

  static MobileListingStatus parse(Object? value) {
    for (final status in values) {
      if (status.wireValue == value) {
        return status;
      }
    }
    throw const FormatException('Unsupported listing status');
  }
}

class SellerMediaListing {
  const SellerMediaListing({
    required this.id,
    required this.title,
    required this.status,
    required this.mediaCount,
  });

  final String id;
  final String title;
  final MobileListingStatus status;
  final int mediaCount;

  bool get mediaChangesAllowed =>
      status != MobileListingStatus.sold &&
      status != MobileListingStatus.removed;

  factory SellerMediaListing.fromJson(
    Map<String, dynamic> json, {
    int? mediaCount,
  }) {
    return SellerMediaListing(
      id: _requiredUuid(json, 'id'),
      title: _requiredString(json, 'title', maximumLength: 120),
      status: MobileListingStatus.parse(json['status']),
      mediaCount: mediaCount ?? _requiredCount(json['mediaCount'], 'media count'),
    );
  }
}

class SellerListingMediaItem {
  const SellerListingMediaItem({
    required this.id,
    required this.uri,
    required this.mimeType,
    required this.width,
    required this.height,
    required this.sizeBytes,
    required this.sortOrder,
    required this.altText,
    required this.createdAt,
  });

  final String id;
  final Uri uri;
  final String mimeType;
  final int? width;
  final int? height;
  final int sizeBytes;
  final int sortOrder;
  final String? altText;
  final DateTime createdAt;

  factory SellerListingMediaItem.fromJson(
    Map<String, dynamic> json,
    Uri apiBaseUrl, {
    required String listingId,
  }) {
    final id = _requiredUuid(json, 'id');
    final rawPath = _requiredString(json, 'url', maximumLength: 240);
    final uri = Uri.tryParse(rawPath);
    final expectedPath = '/v1/listings/$listingId/media/$id/mine';
    if (uri == null ||
        uri.isAbsolute ||
        rawPath != expectedPath ||
        uri.hasQuery ||
        uri.hasFragment) {
      throw const FormatException('Invalid owner media URL');
    }
    final mimeType = _requiredString(json, 'mimeType', maximumLength: 32);
    if (!_allowedMimeTypes.contains(mimeType)) {
      throw const FormatException('Unsupported owner media type');
    }
    final width = json['width'];
    final height = json['height'];
    final sizeBytes = json['sizeBytes'];
    final sortOrder = json['sortOrder'];
    final altText = json['altText'];
    if ((width != null && (width is! int || width < 1 || width > 20000)) ||
        (height != null && (height is! int || height < 1 || height > 20000)) ||
        sizeBytes is! int ||
        sizeBytes < 1 ||
        sizeBytes > maximumListingPhotoBytes ||
        sortOrder is! int ||
        sortOrder < 0 ||
        sortOrder >= maximumListingPhotoCount ||
        (altText != null && (altText is! String || altText.length > 240))) {
      throw const FormatException('Invalid owner media metadata');
    }

    return SellerListingMediaItem(
      id: id,
      uri: apiBaseUrl.resolve(rawPath),
      mimeType: mimeType,
      width: width as int?,
      height: height as int?,
      sizeBytes: sizeBytes,
      sortOrder: sortOrder,
      altText: altText as String?,
      createdAt: _requiredDate(json, 'createdAt'),
    );
  }
}

class SellerListingGallery {
  const SellerListingGallery({
    required this.listing,
    required this.media,
  });

  final SellerMediaListing listing;
  final List<SellerListingMediaItem> media;

  factory SellerListingGallery.fromJson(
    Map<String, dynamic> json,
    Uri apiBaseUrl,
  ) {
    final mediaCount = _requiredCount(json['mediaCount'], 'gallery count');
    final listing = SellerMediaListing.fromJson(
      _requiredMap(json, 'listing'),
      mediaCount: mediaCount,
    );
    final rawMedia = json['media'];
    if (rawMedia is! List || rawMedia.length != mediaCount) {
      throw const FormatException('Invalid owner media gallery');
    }
    final seenIds = <String>{};
    var previousSortOrder = -1;
    final media = rawMedia.map((value) {
      if (value is! Map) {
        throw const FormatException('Invalid owner media entry');
      }
      final item = SellerListingMediaItem.fromJson(
        Map<String, dynamic>.from(value),
        apiBaseUrl,
        listingId: listing.id,
      );
      if (!seenIds.add(item.id) || item.sortOrder < previousSortOrder) {
        throw const FormatException('Invalid owner media ordering');
      }
      previousSortOrder = item.sortOrder;
      return item;
    }).toList(growable: false);

    return SellerListingGallery(listing: listing, media: media);
  }
}

class PickedListingImage {
  const PickedListingImage({
    required this.bytes,
    required this.mimeType,
    required this.fileName,
  });

  final Uint8List bytes;
  final String mimeType;
  final String fileName;

  void validate() {
    if (!_allowedMimeTypes.contains(mimeType)) {
      throw const FormatException('Unsupported listing image type');
    }
    if (bytes.isEmpty || bytes.length > maximumListingPhotoBytes) {
      throw const FormatException('Invalid listing image size');
    }
    if (fileName.trim().isEmpty || fileName.length > 240) {
      throw const FormatException('Invalid listing image name');
    }
  }
}

class ListingMediaMutationResult {
  const ListingMediaMutationResult({
    required this.mediaId,
    required this.mediaCount,
  });

  final String mediaId;
  final int mediaCount;
}

abstract interface class ListingMediaGateway {
  Future<List<SellerMediaListing>> fetchListings(String accessToken);

  Future<SellerListingGallery> fetchGallery(
    String accessToken, {
    required String listingId,
  });

  Future<ListingMediaMutationResult> upload(
    String accessToken, {
    required String listingId,
    required String listingTitle,
    required int sortOrder,
    required PickedListingImage image,
    String? challengeResponse,
  });

  Future<ListingMediaMutationResult> delete(
    String accessToken, {
    required String listingId,
    required String mediaId,
    String? challengeResponse,
  });
}

class ListingMediaApi implements ListingMediaGateway {
  ListingMediaApi({
    required AuthedApi authedApi,
    required Uri apiBaseUrl,
  })  : _authedApi = authedApi,
        _apiBaseUrl = apiBaseUrl;

  final AuthedApi _authedApi;
  final Uri _apiBaseUrl;

  @override
  Future<List<SellerMediaListing>> fetchListings(String accessToken) async {
    final response = await _authedApi.get(
      '/v1/listings/mine?limit=50',
      accessToken,
    );
    final rawListings = response['listings'];
    if (rawListings is! List || rawListings.length > 50) {
      throw const FormatException('Invalid seller listings response');
    }
    return rawListings.map((value) {
      if (value is! Map) {
        throw const FormatException('Invalid seller listing entry');
      }
      return SellerMediaListing.fromJson(Map<String, dynamic>.from(value));
    }).toList(growable: false);
  }

  @override
  Future<SellerListingGallery> fetchGallery(
    String accessToken, {
    required String listingId,
  }) async {
    final normalizedListingId = _requiredListingId(listingId);
    final response = await _authedApi.get(
      '/v1/listings/$normalizedListingId/media/mine',
      accessToken,
    );
    final gallery = SellerListingGallery.fromJson(response, _apiBaseUrl);
    if (gallery.listing.id != normalizedListingId) {
      throw const FormatException('Owner gallery listing mismatch');
    }
    return gallery;
  }

  @override
  Future<ListingMediaMutationResult> upload(
    String accessToken, {
    required String listingId,
    required String listingTitle,
    required int sortOrder,
    required PickedListingImage image,
    String? challengeResponse,
  }) async {
    final normalizedListingId = _requiredListingId(listingId);
    image.validate();
    final normalizedTitle = listingTitle.trim();
    if (normalizedTitle.isEmpty || normalizedTitle.length > 120) {
      throw ArgumentError.value(listingTitle, 'listingTitle', 'Invalid title');
    }
    if (sortOrder < 0 || sortOrder >= maximumListingPhotoCount) {
      throw RangeError.range(
        sortOrder,
        0,
        maximumListingPhotoCount - 1,
        'sortOrder',
      );
    }
    final query = Uri(
      queryParameters: {
        'altText': normalizedTitle,
        'sortOrder': '$sortOrder',
      },
    ).query;
    final normalizedChallenge = _normalizedChallenge(challengeResponse);
    final response = await _authedApi.postBinaryWithHeaders(
      '/v1/listings/$normalizedListingId/media/upload?$query',
      accessToken,
      image.bytes,
      contentType: image.mimeType,
      extraHeaders: {
        if (normalizedChallenge?.isNotEmpty == true)
          'x-suqnaa-human-check': normalizedChallenge!,
      },
    );
    final rawMedia = _requiredMap(response, 'media');
    final mediaId = _requiredUuid(rawMedia, 'id');
    final responseUrl = _requiredString(rawMedia, 'url', maximumLength: 240);
    if (responseUrl !=
            '/v1/listings/$normalizedListingId/media/$mediaId' ||
        rawMedia['mimeType'] != image.mimeType ||
        rawMedia['sortOrder'] != sortOrder) {
      throw const FormatException('Invalid uploaded media response');
    }
    final mediaCount = _requiredCount(response['mediaCount'], 'media count');
    if (mediaCount < 1) {
      throw const FormatException('Invalid upload media count');
    }
    return ListingMediaMutationResult(
      mediaId: mediaId,
      mediaCount: mediaCount,
    );
  }

  @override
  Future<ListingMediaMutationResult> delete(
    String accessToken, {
    required String listingId,
    required String mediaId,
    String? challengeResponse,
  }) async {
    final normalizedListingId = _requiredListingId(listingId);
    final normalizedMediaId = _requiredMediaId(mediaId);
    final normalizedChallenge = _normalizedChallenge(challengeResponse);
    final response = await _authedApi.postWithHeaders(
      '/v1/listings/$normalizedListingId/media/$normalizedMediaId/delete',
      accessToken,
      const {},
      extraHeaders: {
        if (normalizedChallenge?.isNotEmpty == true)
          'x-suqnaa-human-check': normalizedChallenge!,
      },
    );
    if (response['deleted'] != true || response['mediaId'] != normalizedMediaId) {
      throw const FormatException('Invalid media deletion response');
    }
    return ListingMediaMutationResult(
      mediaId: normalizedMediaId,
      mediaCount: _requiredCount(response['mediaCount'], 'media count'),
    );
  }
}
