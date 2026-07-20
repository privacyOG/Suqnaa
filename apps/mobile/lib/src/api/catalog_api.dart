import 'dart:convert';
import 'package:http/http.dart' as http;

abstract interface class CatalogGateway {
  Future<List<CatalogCategoryDto>> fetchCategories();

  Future<CatalogPageDto> search(CatalogSearchOptions options);

  Future<CatalogListingDto> fetchListing(String listingId);
}

class CatalogApi implements CatalogGateway {
  CatalogApi({required this.baseUrl, http.Client? client})
      : _client = client ?? http.Client();

  final Uri baseUrl;
  final http.Client _client;

  @override
  Future<List<CatalogCategoryDto>> fetchCategories() async {
    final response = await _client.get(
      baseUrl.resolve('/v1/categories'),
      headers: const {'accept': 'application/json'},
    );
    final payload = _readPayload(response, 'Unable to load categories');
    final items = payload['categories'];
    if (items is! List) {
      return const [];
    }

    return items
        .whereType<Map>()
        .map((item) => CatalogCategoryDto.fromJson(
              Map<String, dynamic>.from(item),
            ))
        .toList(growable: false);
  }

  @override
  Future<CatalogPageDto> search(CatalogSearchOptions options) async {
    final endpoint = baseUrl.resolve('/v1/listings/search').replace(
          queryParameters: options.toQueryParameters(),
        );
    final response = await _client.get(
      endpoint,
      headers: const {'accept': 'application/json'},
    );
    final payload = _readPayload(response, 'Unable to load listings');
    final rawItems = payload['listings'];
    final items = rawItems is List
        ? rawItems
            .whereType<Map>()
            .map((item) => CatalogListingDto.fromJson(
                  Map<String, dynamic>.from(item),
                  baseUrl,
                ))
            .toList(growable: false)
        : const <CatalogListingDto>[];
    final rawPagination = payload['pagination'];
    final pagination = rawPagination is Map
        ? Map<String, dynamic>.from(rawPagination)
        : const <String, dynamic>{};

    return CatalogPageDto(
      listings: items,
      hasMore: pagination['hasMore'] == true,
      nextCursor: pagination['nextCursor']?.toString(),
    );
  }

  @override
  Future<CatalogListingDto> fetchListing(String listingId) async {
    final response = await _client.get(
      baseUrl.resolve('/v1/listings/${Uri.encodeComponent(listingId)}'),
      headers: const {'accept': 'application/json'},
    );
    final payload = _readPayload(response, 'Unable to load listing');
    final rawListing = payload['listing'];
    if (rawListing is! Map) {
      throw const CatalogRequestException(
        status: 502,
        message: 'Invalid listing response',
      );
    }

    return CatalogListingDto.fromJson(
      Map<String, dynamic>.from(rawListing),
      baseUrl,
    );
  }

  Map<String, dynamic> _readPayload(http.Response response, String fallback) {
    Map<String, dynamic> payload = const {};
    try {
      final decoded = jsonDecode(response.body);
      if (decoded is Map) {
        payload = Map<String, dynamic>.from(decoded);
      }
    } catch (_) {
      // The typed error below avoids exposing an invalid upstream body.
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      final retryAfter = int.tryParse(response.headers['retry-after'] ?? '');
      throw CatalogRequestException(
        status: response.statusCode,
        message: payload['error']?.toString() ?? fallback,
        retryAfterSeconds: retryAfter,
      );
    }

    return payload;
  }
}

class CatalogRequestException implements Exception {
  const CatalogRequestException({
    required this.status,
    required this.message,
    this.retryAfterSeconds,
  });

  final int status;
  final String message;
  final int? retryAfterSeconds;

  @override
  String toString() => message;
}

class CatalogSearchOptions {
  const CatalogSearchOptions({
    this.limit = 20,
    this.before,
    this.query,
    this.categoryId,
    this.condition,
    this.availabilityStatus,
    this.minimumPrice,
    this.maximumPrice,
    this.currency,
    this.country,
    this.city,
    this.fulfilment,
  });

  final int limit;
  final String? before;
  final String? query;
  final String? categoryId;
  final String? condition;
  final String? availabilityStatus;
  final double? minimumPrice;
  final double? maximumPrice;
  final String? currency;
  final String? country;
  final String? city;
  final String? fulfilment;

  CatalogSearchOptions copyWith({
    int? limit,
    String? before,
    String? query,
    String? categoryId,
    String? condition,
    String? availabilityStatus,
    double? minimumPrice,
    double? maximumPrice,
    String? currency,
    String? country,
    String? city,
    String? fulfilment,
    bool clearBefore = false,
    bool clearCategory = false,
    bool clearCondition = false,
    bool clearAvailability = false,
    bool clearMinimumPrice = false,
    bool clearMaximumPrice = false,
    bool clearCurrency = false,
    bool clearCountry = false,
    bool clearCity = false,
    bool clearFulfilment = false,
  }) {
    return CatalogSearchOptions(
      limit: limit ?? this.limit,
      before: clearBefore ? null : before ?? this.before,
      query: query ?? this.query,
      categoryId: clearCategory ? null : categoryId ?? this.categoryId,
      condition: clearCondition ? null : condition ?? this.condition,
      availabilityStatus: clearAvailability
          ? null
          : availabilityStatus ?? this.availabilityStatus,
      minimumPrice: clearMinimumPrice
          ? null
          : minimumPrice ?? this.minimumPrice,
      maximumPrice: clearMaximumPrice
          ? null
          : maximumPrice ?? this.maximumPrice,
      currency: clearCurrency ? null : currency ?? this.currency,
      country: clearCountry ? null : country ?? this.country,
      city: clearCity ? null : city ?? this.city,
      fulfilment: clearFulfilment ? null : fulfilment ?? this.fulfilment,
    );
  }

  CatalogSearchOptions withCursor(String? cursor) {
    return copyWith(before: cursor, clearBefore: cursor == null);
  }

  Map<String, String> toQueryParameters() {
    final output = <String, String>{'limit': '$limit'};

    void add(String key, Object? value) {
      final text = value?.toString().trim();
      if (text != null && text.isNotEmpty) {
        output[key] = text;
      }
    }

    add('before', before);
    add('q', query);
    add('categoryId', categoryId);
    add('condition', condition);
    add('availabilityStatus', availabilityStatus);
    add('minPrice', minimumPrice);
    add('maxPrice', maximumPrice);
    add('currency', currency?.toUpperCase());
    add('country', country?.toUpperCase());
    add('city', city);
    add('fulfilment', fulfilment);
    return output;
  }

  bool get hasFilters =>
      (query?.trim().isNotEmpty ?? false) ||
      categoryId != null ||
      condition != null ||
      availabilityStatus != null ||
      minimumPrice != null ||
      maximumPrice != null ||
      currency != null ||
      country != null ||
      city != null ||
      fulfilment != null;
}

class CatalogPageDto {
  const CatalogPageDto({
    required this.listings,
    required this.hasMore,
    required this.nextCursor,
  });

  final List<CatalogListingDto> listings;
  final bool hasMore;
  final String? nextCursor;
}

class CatalogCategoryDto {
  const CatalogCategoryDto({
    required this.id,
    required this.slug,
    required this.nameEn,
    this.nameAr,
  });

  final String id;
  final String slug;
  final String nameEn;
  final String? nameAr;

  factory CatalogCategoryDto.fromJson(Map<String, dynamic> json) {
    return CatalogCategoryDto(
      id: json['id']?.toString() ?? '',
      slug: json['slug']?.toString() ?? '',
      nameEn: json['name_en']?.toString() ?? '',
      nameAr: json['name_ar']?.toString(),
    );
  }

  String labelFor(String languageCode) {
    if (languageCode == 'ar' && nameAr != null && nameAr!.isNotEmpty) {
      return nameAr!;
    }
    return nameEn;
  }
}

class CatalogListingDto {
  const CatalogListingDto({
    required this.id,
    required this.title,
    required this.description,
    required this.priceAmount,
    required this.currencyCode,
    required this.condition,
    required this.availabilityStatus,
    required this.countryCode,
    required this.allowPickup,
    required this.allowDelivery,
    required this.media,
    required this.mediaCount,
    this.availableQuantity,
    this.unitLabel,
    this.region,
    this.city,
    this.suburb,
    this.category,
    this.seller,
  });

  final String id;
  final String title;
  final String description;
  final double priceAmount;
  final String currencyCode;
  final String condition;
  final String availabilityStatus;
  final int? availableQuantity;
  final String? unitLabel;
  final String countryCode;
  final String? region;
  final String? city;
  final String? suburb;
  final bool allowPickup;
  final bool allowDelivery;
  final List<CatalogMediaDto> media;
  final int mediaCount;
  final CatalogCategoryDto? category;
  final CatalogSellerDto? seller;

  factory CatalogListingDto.fromJson(
    Map<String, dynamic> json,
    Uri baseUrl,
  ) {
    final rawMedia = json['media'];
    final rawCategory = json['category'];
    final rawSeller = json['seller'];

    return CatalogListingDto(
      id: json['id']?.toString() ?? '',
      title: json['title']?.toString() ?? '',
      description: json['description']?.toString() ?? '',
      priceAmount: _asDouble(json['priceAmount']),
      currencyCode: json['currencyCode']?.toString() ?? '',
      condition: json['condition']?.toString() ?? 'good',
      availabilityStatus:
          json['availabilityStatus']?.toString() ?? 'in_stock',
      availableQuantity: _asInt(json['availableQuantity']),
      unitLabel: json['unitLabel']?.toString(),
      countryCode: json['countryCode']?.toString() ?? '',
      region: json['region']?.toString(),
      city: json['city']?.toString(),
      suburb: json['suburb']?.toString(),
      allowPickup: json['allowPickup'] == true,
      allowDelivery: json['allowDelivery'] == true,
      media: rawMedia is List
          ? rawMedia
              .whereType<Map>()
              .map((item) => CatalogMediaDto.fromJson(
                    Map<String, dynamic>.from(item),
                    baseUrl,
                  ))
              .toList(growable: false)
          : const [],
      mediaCount: _asInt(json['mediaCount']) ?? 0,
      category: rawCategory is Map
          ? CatalogCategoryDto(
              id: rawCategory['id']?.toString() ?? '',
              slug: rawCategory['slug']?.toString() ?? '',
              nameEn: rawCategory['nameEn']?.toString() ?? '',
              nameAr: rawCategory['nameAr']?.toString(),
            )
          : null,
      seller: rawSeller is Map
          ? CatalogSellerDto.fromJson(Map<String, dynamic>.from(rawSeller))
          : null,
    );
  }

  String get location => [suburb, city, region, countryCode]
      .where((value) => value != null && value.trim().isNotEmpty)
      .join(', ');

  CatalogMediaDto? get coverMedia => media.isEmpty ? null : media.first;
}

class CatalogMediaDto {
  const CatalogMediaDto({
    required this.id,
    required this.url,
    required this.mimeType,
    this.altText,
  });

  final String id;
  final String url;
  final String mimeType;
  final String? altText;

  factory CatalogMediaDto.fromJson(Map<String, dynamic> json, Uri baseUrl) {
    final rawUrl = json['url']?.toString() ?? '';
    final parsed = Uri.tryParse(rawUrl);
    final resolved = parsed != null && parsed.hasScheme
        ? parsed
        : baseUrl.resolve(rawUrl);

    return CatalogMediaDto(
      id: json['id']?.toString() ?? '',
      url: resolved.toString(),
      mimeType: json['mimeType']?.toString() ?? '',
      altText: json['altText']?.toString(),
    );
  }
}

class CatalogSellerDto {
  const CatalogSellerDto({
    required this.id,
    required this.displayName,
    required this.status,
    this.trustScore,
    this.isBusiness = false,
    this.businessName,
    this.city,
    this.countryCode,
  });

  final String id;
  final String displayName;
  final String status;
  final int? trustScore;
  final bool isBusiness;
  final String? businessName;
  final String? city;
  final String? countryCode;

  factory CatalogSellerDto.fromJson(Map<String, dynamic> json) {
    return CatalogSellerDto(
      id: json['id']?.toString() ?? '',
      displayName: json['displayName']?.toString() ?? '',
      status: json['status']?.toString() ?? '',
      trustScore: _asInt(json['trustScore']),
      isBusiness: json['isBusiness'] == true,
      businessName: json['businessName']?.toString(),
      city: json['city']?.toString(),
      countryCode: json['countryCode']?.toString(),
    );
  }
}

double _asDouble(Object? value) {
  if (value is num) {
    return value.toDouble();
  }
  return double.tryParse(value?.toString() ?? '') ?? 0;
}

int? _asInt(Object? value) {
  if (value is int) {
    return value;
  }
  if (value is num) {
    return value.toInt();
  }
  return int.tryParse(value?.toString() ?? '');
}
