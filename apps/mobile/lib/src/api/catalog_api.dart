import 'dart:convert';
import 'package:http/http.dart' as http;

final _uuidPattern = RegExp(
  r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
);
const _conditions = <String>{
  'new',
  'like_new',
  'good',
  'fair',
  'parts_or_repair',
};
const _availabilityStatuses = <String>{
  'in_stock',
  'limited',
  'out_of_stock',
  'service_available',
};
const _fulfilmentModes = <String>{'pickup', 'delivery', 'both'};
const _sortModes = <String>{'newest', 'price_asc', 'price_desc'};
const _mediaTypes = <String>{'image/jpeg', 'image/png', 'image/webp'};
const _maximumMoney = 1000000000000.0;

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
    if (items is! List || items.length > 500) {
      throw const CatalogRequestException(
        status: 502,
        message: 'Invalid categories response',
      );
    }

    final categories = items.map((item) {
      if (item is! Map) {
        throw const FormatException('Invalid category entry');
      }
      return CatalogCategoryDto.fromJson(Map<String, dynamic>.from(item));
    }).toList(growable: false);
    final ids = <String>{};
    if (categories.any((category) => !ids.add(category.id))) {
      throw const CatalogRequestException(
        status: 502,
        message: 'Duplicate category response',
      );
    }
    return categories;
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
    final rawPagination = payload['pagination'];
    if (rawItems is! List ||
        rawItems.length > options.limit ||
        rawPagination is! Map) {
      throw const CatalogRequestException(
        status: 502,
        message: 'Invalid listing search response',
      );
    }

    final items = rawItems.map((item) {
      if (item is! Map) {
        throw const FormatException('Invalid listing entry');
      }
      return CatalogListingDto.fromJson(
        Map<String, dynamic>.from(item),
        baseUrl,
      );
    }).toList(growable: false);
    final ids = <String>{};
    if (items.any((item) => !ids.add(item.id))) {
      throw const CatalogRequestException(
        status: 502,
        message: 'Duplicate listing search response',
      );
    }

    final pagination = Map<String, dynamic>.from(rawPagination);
    final hasMore = pagination['hasMore'];
    final nextCursor = pagination['nextCursor'];
    if (hasMore is! bool ||
        (nextCursor != null &&
            (nextCursor is! String ||
                nextCursor.isEmpty ||
                nextCursor.length > 512)) ||
        (hasMore && nextCursor == null) ||
        (!hasMore && nextCursor != null)) {
      throw const CatalogRequestException(
        status: 502,
        message: 'Invalid listing pagination response',
      );
    }

    return CatalogPageDto(
      listings: items,
      hasMore: hasMore,
      nextCursor: nextCursor as String?,
    );
  }

  @override
  Future<CatalogListingDto> fetchListing(String listingId) async {
    final normalizedId = _requiredUuid(listingId, 'listingId');
    final response = await _client.get(
      baseUrl.resolve('/v1/listings/$normalizedId'),
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

    final listing = CatalogListingDto.fromJson(
      Map<String, dynamic>.from(rawListing),
      baseUrl,
    );
    if (listing.id != normalizedId) {
      throw const CatalogRequestException(
        status: 502,
        message: 'Listing response mismatch',
      );
    }
    return listing;
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
    this.region,
    this.city,
    this.suburb,
    this.fulfilment,
    this.sort = 'newest',
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
  final String? region;
  final String? city;
  final String? suburb;
  final String? fulfilment;
  final String sort;

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
    String? region,
    String? city,
    String? suburb,
    String? fulfilment,
    String? sort,
    bool clearBefore = false,
    bool clearQuery = false,
    bool clearCategory = false,
    bool clearCondition = false,
    bool clearAvailability = false,
    bool clearMinimumPrice = false,
    bool clearMaximumPrice = false,
    bool clearCurrency = false,
    bool clearCountry = false,
    bool clearRegion = false,
    bool clearCity = false,
    bool clearSuburb = false,
    bool clearFulfilment = false,
  }) {
    return CatalogSearchOptions(
      limit: limit ?? this.limit,
      before: clearBefore ? null : before ?? this.before,
      query: clearQuery ? null : query ?? this.query,
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
      region: clearRegion ? null : region ?? this.region,
      city: clearCity ? null : city ?? this.city,
      suburb: clearSuburb ? null : suburb ?? this.suburb,
      fulfilment: clearFulfilment ? null : fulfilment ?? this.fulfilment,
      sort: sort ?? this.sort,
    );
  }

  CatalogSearchOptions withCursor(String? cursor) {
    return copyWith(before: cursor, clearBefore: cursor == null);
  }

  Map<String, String> toQueryParameters() {
    _validate();
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
    add('region', region);
    add('city', city);
    add('suburb', suburb);
    add('fulfilment', fulfilment);
    if (sort != 'newest') add('sort', sort);
    return output;
  }

  void _validate() {
    if (limit < 1 || limit > 50) {
      throw RangeError.range(limit, 1, 50, 'limit');
    }
    _validateText(before, 'before', 512);
    _validateText(query, 'query', 200);
    _validateText(region, 'region', 120);
    _validateText(city, 'city', 120);
    _validateText(suburb, 'suburb', 120);
    if (categoryId != null) _requiredUuid(categoryId!, 'categoryId');
    if (condition != null && !_conditions.contains(condition)) {
      throw ArgumentError.value(condition, 'condition', 'Unsupported value');
    }
    if (availabilityStatus != null &&
        !_availabilityStatuses.contains(availabilityStatus)) {
      throw ArgumentError.value(
        availabilityStatus,
        'availabilityStatus',
        'Unsupported value',
      );
    }
    if (fulfilment != null && !_fulfilmentModes.contains(fulfilment)) {
      throw ArgumentError.value(fulfilment, 'fulfilment', 'Unsupported value');
    }
    if (!_sortModes.contains(sort)) {
      throw ArgumentError.value(sort, 'sort', 'Unsupported value');
    }
    if (minimumPrice != null &&
        (!minimumPrice!.isFinite ||
            minimumPrice! < 0 ||
            minimumPrice! > _maximumMoney)) {
      throw ArgumentError.value(minimumPrice, 'minimumPrice', 'Invalid value');
    }
    if (maximumPrice != null &&
        (!maximumPrice!.isFinite ||
            maximumPrice! < 0 ||
            maximumPrice! > _maximumMoney)) {
      throw ArgumentError.value(maximumPrice, 'maximumPrice', 'Invalid value');
    }
    if (minimumPrice != null &&
        maximumPrice != null &&
        minimumPrice! > maximumPrice!) {
      throw ArgumentError.value(maximumPrice, 'maximumPrice', 'Invalid range');
    }
    final priceOrdering = sort == 'price_asc' || sort == 'price_desc';
    if ((priceOrdering || minimumPrice != null || maximumPrice != null) &&
        (currency == null || currency!.trim().length != 3)) {
      throw ArgumentError.value(
        currency,
        'currency',
        'Required for price filters and sorting',
      );
    }
    if (currency != null && currency!.trim().length != 3) {
      throw ArgumentError.value(currency, 'currency', 'Must contain 3 letters');
    }
    if (country != null && country!.trim().length != 2) {
      throw ArgumentError.value(country, 'country', 'Must contain 2 letters');
    }
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
      region != null ||
      city != null ||
      suburb != null ||
      fulfilment != null ||
      sort != 'newest';
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
    final id = _requiredUuid(json['id']?.toString() ?? '', 'category.id');
    final slug = json['slug']?.toString().trim() ?? '';
    final nameEn = json['name_en']?.toString().trim() ?? '';
    final nameAr = json['name_ar']?.toString().trim();
    if (slug.isEmpty ||
        slug.length > 120 ||
        nameEn.isEmpty ||
        nameEn.length > 160 ||
        (nameAr != null && nameAr.length > 160)) {
      throw const FormatException('Invalid category metadata');
    }
    return CatalogCategoryDto(
      id: id,
      slug: slug,
      nameEn: nameEn,
      nameAr: nameAr?.isEmpty == true ? null : nameAr,
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
    final id = _requiredUuid(json['id']?.toString() ?? '', 'listing.id');
    final title = json['title']?.toString().trim() ?? '';
    final description = json['description']?.toString().trim() ?? '';
    final currencyCode = json['currencyCode']?.toString().trim() ?? '';
    final countryCode = json['countryCode']?.toString().trim() ?? '';
    final condition = json['condition']?.toString() ?? '';
    final availability = json['availabilityStatus']?.toString() ?? '';
    final priceAmount = _strictDouble(json['priceAmount'], 'priceAmount');
    final rawMedia = json['media'];
    final rawMediaCount = json['mediaCount'];
    final rawCategory = json['category'];
    final rawSeller = json['seller'];
    if (title.isEmpty ||
        title.length > 120 ||
        description.isEmpty ||
        description.length > 5000 ||
        currencyCode.length != 3 ||
        countryCode.length != 2 ||
        !_conditions.contains(condition) ||
        !_availabilityStatuses.contains(availability) ||
        priceAmount < 0 ||
        rawMedia is! List ||
        rawMedia.length > 8 ||
        rawMediaCount is! int ||
        rawMediaCount < rawMedia.length ||
        rawMediaCount > 8) {
      throw const FormatException('Invalid listing metadata');
    }

    final media = rawMedia.map((item) {
      if (item is! Map) throw const FormatException('Invalid listing media');
      return CatalogMediaDto.fromJson(
        Map<String, dynamic>.from(item),
        baseUrl,
        listingId: id,
      );
    }).toList(growable: false);

    return CatalogListingDto(
      id: id,
      title: title,
      description: description,
      priceAmount: priceAmount,
      currencyCode: currencyCode.toUpperCase(),
      condition: condition,
      availabilityStatus: availability,
      availableQuantity: _asInt(json['availableQuantity']),
      unitLabel: json['unitLabel']?.toString(),
      countryCode: countryCode.toUpperCase(),
      region: json['region']?.toString(),
      city: json['city']?.toString(),
      suburb: json['suburb']?.toString(),
      allowPickup: json['allowPickup'] == true,
      allowDelivery: json['allowDelivery'] == true,
      media: media,
      mediaCount: rawMediaCount,
      category: rawCategory is Map
          ? CatalogCategoryDto(
              id: _requiredUuid(
                rawCategory['id']?.toString() ?? '',
                'category.id',
              ),
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

  factory CatalogMediaDto.fromJson(
    Map<String, dynamic> json,
    Uri baseUrl, {
    required String listingId,
  }) {
    final id = _requiredUuid(json['id']?.toString() ?? '', 'media.id');
    final rawUrl = json['url']?.toString() ?? '';
    final parsed = Uri.tryParse(rawUrl);
    final expectedPath = '/v1/listings/$listingId/media/$id';
    if (parsed == null ||
        parsed.isAbsolute ||
        rawUrl != expectedPath ||
        parsed.hasQuery ||
        parsed.hasFragment) {
      throw const FormatException('Invalid listing media URL');
    }
    final mimeType = json['mimeType']?.toString() ?? '';
    if (!_mediaTypes.contains(mimeType)) {
      throw const FormatException('Invalid listing media type');
    }

    return CatalogMediaDto(
      id: id,
      url: baseUrl.resolve(rawUrl).toString(),
      mimeType: mimeType,
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
    final id = _requiredUuid(json['id']?.toString() ?? '', 'seller.id');
    final displayName = json['displayName']?.toString().trim() ?? '';
    final status = json['status']?.toString() ?? '';
    if (displayName.isEmpty || displayName.length > 160 || status.isEmpty) {
      throw const FormatException('Invalid seller metadata');
    }
    return CatalogSellerDto(
      id: id,
      displayName: displayName,
      status: status,
      trustScore: _asInt(json['trustScore']),
      isBusiness: json['isBusiness'] == true,
      businessName: json['businessName']?.toString(),
      city: json['city']?.toString(),
      countryCode: json['countryCode']?.toString(),
    );
  }
}

void _validateText(String? value, String name, int maximumLength) {
  if (value == null) return;
  final normalized = value.trim();
  if (normalized.isEmpty || normalized.length > maximumLength) {
    throw ArgumentError.value(value, name, 'Invalid value');
  }
}

String _requiredUuid(String value, String name) {
  final normalized = value.trim();
  if (!_uuidPattern.hasMatch(normalized)) {
    throw ArgumentError.value(value, name, 'Must be a UUID');
  }
  return normalized;
}

double _strictDouble(Object? value, String label) {
  final parsed = value is num ? value.toDouble() : double.tryParse('$value');
  if (parsed == null || !parsed.isFinite) {
    throw FormatException('Invalid $label');
  }
  return parsed;
}

int? _asInt(Object? value) {
  if (value is int) return value;
  if (value is num) return value.toInt();
  return int.tryParse(value?.toString() ?? '');
}
