import 'authed_api.dart';
import 'catalog_api.dart';

final _discoveryUuid = RegExp(
  r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
);

abstract interface class DiscoveryGateway {
  Future<DiscoveryListingState> getListingState(String accessToken, String listingId);
  Future<void> saveListing(String accessToken, String listingId);
  Future<void> removeSavedListing(String accessToken, String listingId);
  Future<void> watchListing(String accessToken, String listingId);
  Future<void> removeWatchedListing(String accessToken, String listingId);
  Future<void> recordView(String accessToken, String listingId);
  Future<List<DiscoveryRelationshipItem>> getSavedListings(String accessToken);
  Future<List<DiscoveryRelationshipItem>> getWatchlist(String accessToken);
  Future<List<DiscoveryRelationshipItem>> getRecentlyViewed(String accessToken);
  Future<List<DiscoverySavedSearch>> getSavedSearches(String accessToken);
  Future<DiscoverySavedSearch> createSavedSearch(
    String accessToken, {
    required String name,
    required CatalogSearchOptions filters,
  });
  Future<DiscoverySavedSearch> setSavedSearchActive(
    String accessToken, {
    required String searchId,
    required bool active,
  });
  Future<void> deleteSavedSearch(String accessToken, String searchId);
  Future<List<DiscoveryNotification>> getNotifications(
    String accessToken, {
    bool unreadOnly = false,
  });
  Future<void> markNotificationRead(String accessToken, String notificationId);
  Future<void> markAllNotificationsRead(String accessToken);
}

class DiscoveryApi implements DiscoveryGateway {
  DiscoveryApi({required AuthedApi authedApi}) : _authedApi = authedApi;
  final AuthedApi _authedApi;

  String _uuid(String value, String field) {
    final normalized = value.trim();
    if (!_discoveryUuid.hasMatch(normalized)) {
      throw ArgumentError.value(value, field, 'Invalid UUID');
    }
    return normalized;
  }

  @override
  Future<DiscoveryListingState> getListingState(String accessToken, String listingId) async {
    final id = _uuid(listingId, 'listingId');
    final payload = await _authedApi.get('/v1/discovery/listings/$id/state', accessToken);
    final state = payload['state'];
    if (state is! Map) throw const FormatException('Invalid discovery state');
    return DiscoveryListingState.fromJson(Map<String, dynamic>.from(state), expectedId: id);
  }

  Future<void> _listingAction(String accessToken, String listingId, String path) async {
    final id = _uuid(listingId, 'listingId');
    await _authedApi.post('/v1/discovery/$path/$id/${path == 'saved-listings' ? 'save' : path == 'watchlist' ? 'watch' : 'view'}', accessToken, const {});
  }

  @override
  Future<void> saveListing(String accessToken, String listingId) =>
      _listingAction(accessToken, listingId, 'saved-listings');

  @override
  Future<void> watchListing(String accessToken, String listingId) =>
      _listingAction(accessToken, listingId, 'watchlist');

  @override
  Future<void> recordView(String accessToken, String listingId) =>
      _listingAction(accessToken, listingId, 'recently-viewed');

  @override
  Future<void> removeSavedListing(String accessToken, String listingId) async {
    final id = _uuid(listingId, 'listingId');
    await _authedApi.post('/v1/discovery/saved-listings/$id/remove', accessToken, const {});
  }

  @override
  Future<void> removeWatchedListing(String accessToken, String listingId) async {
    final id = _uuid(listingId, 'listingId');
    await _authedApi.post('/v1/discovery/watchlist/$id/remove', accessToken, const {});
  }

  Future<List<DiscoveryRelationshipItem>> _relationshipList(
    String accessToken,
    String path,
  ) async {
    final payload = await _authedApi.get('/v1/discovery/$path?limit=50', accessToken);
    final items = payload['items'];
    if (items is! List || items.length > 50) {
      throw const FormatException('Invalid discovery list');
    }
    return items.map((item) {
      if (item is! Map) throw const FormatException('Invalid discovery item');
      return DiscoveryRelationshipItem.fromJson(Map<String, dynamic>.from(item));
    }).toList(growable: false);
  }

  @override
  Future<List<DiscoveryRelationshipItem>> getSavedListings(String accessToken) =>
      _relationshipList(accessToken, 'saved-listings');

  @override
  Future<List<DiscoveryRelationshipItem>> getWatchlist(String accessToken) =>
      _relationshipList(accessToken, 'watchlist');

  @override
  Future<List<DiscoveryRelationshipItem>> getRecentlyViewed(String accessToken) =>
      _relationshipList(accessToken, 'recently-viewed');

  @override
  Future<List<DiscoverySavedSearch>> getSavedSearches(String accessToken) async {
    final payload = await _authedApi.get('/v1/discovery/saved-searches', accessToken);
    final searches = payload['searches'];
    if (searches is! List || searches.length > 500) {
      throw const FormatException('Invalid saved search list');
    }
    return searches.map((item) {
      if (item is! Map) throw const FormatException('Invalid saved search');
      return DiscoverySavedSearch.fromJson(Map<String, dynamic>.from(item));
    }).toList(growable: false);
  }

  Map<String, dynamic> _filterBody(CatalogSearchOptions options) {
    final query = options.withCursor(null).toQueryParameters()..remove('limit')..remove('before')..remove('sort');
    return {
      if (query['q'] != null) 'q': query['q'],
      if (query['categoryId'] != null) 'categoryId': query['categoryId'],
      if (query['condition'] != null) 'condition': query['condition'],
      if (query['availabilityStatus'] != null) 'availabilityStatus': query['availabilityStatus'],
      if (query['minPrice'] != null) 'minPrice': double.parse(query['minPrice']!),
      if (query['maxPrice'] != null) 'maxPrice': double.parse(query['maxPrice']!),
      if (query['currency'] != null) 'currency': query['currency'],
      if (query['country'] != null) 'country': query['country'],
      if (query['region'] != null) 'region': query['region'],
      if (query['city'] != null) 'city': query['city'],
      if (query['suburb'] != null) 'suburb': query['suburb'],
      if (query['fulfilment'] != null) 'fulfilment': query['fulfilment'],
      if (query['nearLat'] != null) 'nearLat': double.parse(query['nearLat']!),
      if (query['nearLon'] != null) 'nearLon': double.parse(query['nearLon']!),
      if (query['radiusKm'] != null) 'radiusKm': double.parse(query['radiusKm']!),
    };
  }

  @override
  Future<DiscoverySavedSearch> createSavedSearch(
    String accessToken, {
    required String name,
    required CatalogSearchOptions filters,
  }) async {
    final normalizedName = name.trim();
    if (normalizedName.isEmpty || normalizedName.length > 120) {
      throw ArgumentError.value(name, 'name', 'Invalid saved search name');
    }
    final payload = await _authedApi.post('/v1/discovery/saved-searches', accessToken, {
      'name': normalizedName,
      'filters': _filterBody(filters),
    });
    final raw = payload['search'];
    if (raw is! Map) throw const FormatException('Invalid saved search response');
    return DiscoverySavedSearch.fromJson(Map<String, dynamic>.from(raw));
  }

  @override
  Future<DiscoverySavedSearch> setSavedSearchActive(
    String accessToken, {
    required String searchId,
    required bool active,
  }) async {
    final id = _uuid(searchId, 'searchId');
    final payload = await _authedApi.post('/v1/discovery/saved-searches/$id/update', accessToken, {'active': active});
    final raw = payload['search'];
    if (raw is! Map) throw const FormatException('Invalid saved search response');
    final search = DiscoverySavedSearch.fromJson(Map<String, dynamic>.from(raw));
    if (search.id != id || search.active != active) {
      throw const FormatException('Saved search response mismatch');
    }
    return search;
  }

  @override
  Future<void> deleteSavedSearch(String accessToken, String searchId) async {
    final id = _uuid(searchId, 'searchId');
    await _authedApi.post('/v1/discovery/saved-searches/$id/delete', accessToken, const {});
  }

  @override
  Future<List<DiscoveryNotification>> getNotifications(
    String accessToken, {
    bool unreadOnly = false,
  }) async {
    final payload = await _authedApi.get(
      '/v1/discovery/notifications?limit=50&unreadOnly=${unreadOnly ? 'true' : 'false'}',
      accessToken,
    );
    final notifications = payload['notifications'];
    if (notifications is! List || notifications.length > 50) {
      throw const FormatException('Invalid discovery notifications');
    }
    return notifications.map((item) {
      if (item is! Map) throw const FormatException('Invalid discovery notification');
      return DiscoveryNotification.fromJson(Map<String, dynamic>.from(item));
    }).toList(growable: false);
  }

  @override
  Future<void> markNotificationRead(String accessToken, String notificationId) async {
    final id = _uuid(notificationId, 'notificationId');
    await _authedApi.post('/v1/discovery/notifications/$id/read', accessToken, const {});
  }

  @override
  Future<void> markAllNotificationsRead(String accessToken) =>
      _authedApi.post('/v1/discovery/notifications/read-all', accessToken, const {});
}

class DiscoveryListingState {
  const DiscoveryListingState({required this.listingId, required this.saved, required this.watching});
  final String listingId;
  final bool saved;
  final bool watching;

  factory DiscoveryListingState.fromJson(Map<String, dynamic> json, {required String expectedId}) {
    final id = json['listingId']?.toString() ?? '';
    final saved = json['saved'];
    final watching = json['watching'];
    if (id != expectedId || !_discoveryUuid.hasMatch(id) || saved is! bool || watching is! bool) {
      throw const FormatException('Invalid discovery state');
    }
    return DiscoveryListingState(listingId: id, saved: saved, watching: watching);
  }
}

class DiscoveryListingSummary {
  const DiscoveryListingSummary({required this.id, required this.title, required this.priceAmount, required this.currencyCode, this.city, this.countryCode});
  final String id;
  final String title;
  final double priceAmount;
  final String currencyCode;
  final String? city;
  final String? countryCode;

  factory DiscoveryListingSummary.fromJson(Map<String, dynamic> json) {
    final id = json['id']?.toString() ?? '';
    final title = json['title']?.toString().trim() ?? '';
    final price = double.tryParse(json['priceAmount']?.toString() ?? '');
    final currency = json['currencyCode']?.toString().trim().toUpperCase() ?? '';
    final city = json['city']?.toString().trim();
    final country = json['countryCode']?.toString().trim().toUpperCase();
    if (!_discoveryUuid.hasMatch(id) || title.isEmpty || title.length > 160 || price == null || !price.isFinite || price < 0 || currency.length != 3 || (country != null && country.length != 2)) {
      throw const FormatException('Invalid discovery listing summary');
    }
    return DiscoveryListingSummary(id: id, title: title, priceAmount: price, currencyCode: currency, city: city?.isEmpty == true ? null : city, countryCode: country?.isEmpty == true ? null : country);
  }
}

class DiscoveryRelationshipItem {
  const DiscoveryRelationshipItem({required this.listingId, required this.available, required this.listing, this.viewCount});
  final String listingId;
  final bool available;
  final DiscoveryListingSummary? listing;
  final int? viewCount;

  factory DiscoveryRelationshipItem.fromJson(Map<String, dynamic> json) {
    final id = json['listingId']?.toString() ?? '';
    final available = json['available'];
    final rawListing = json['listing'];
    final rawCount = json['viewCount'];
    if (!_discoveryUuid.hasMatch(id) || available is! bool || (rawCount != null && (rawCount is! num || rawCount.toInt() < 1))) {
      throw const FormatException('Invalid discovery relationship');
    }
    final listing = rawListing == null
        ? null
        : rawListing is Map
            ? DiscoveryListingSummary.fromJson(Map<String, dynamic>.from(rawListing))
            : throw const FormatException('Invalid discovery listing');
    if ((listing != null) != available || (listing != null && listing.id != id)) {
      throw const FormatException('Discovery relationship mismatch');
    }
    return DiscoveryRelationshipItem(listingId: id, available: available, listing: listing, viewCount: rawCount?.toInt());
  }
}

class DiscoverySavedSearch {
  const DiscoverySavedSearch({required this.id, required this.name, required this.filters, required this.active});
  final String id;
  final String name;
  final Map<String, dynamic> filters;
  final bool active;

  factory DiscoverySavedSearch.fromJson(Map<String, dynamic> json) {
    final id = json['id']?.toString() ?? '';
    final name = json['name']?.toString().trim() ?? '';
    final filters = json['filters'];
    final active = json['active'];
    if (!_discoveryUuid.hasMatch(id) || name.isEmpty || name.length > 120 || filters is! Map || active is! bool) {
      throw const FormatException('Invalid saved search');
    }
    return DiscoverySavedSearch(id: id, name: name, filters: Map<String, dynamic>.from(filters), active: active);
  }
}

class DiscoveryNotification {
  const DiscoveryNotification({required this.id, required this.searchName, required this.listingId, required this.read, required this.available, required this.listing});
  final String id;
  final String searchName;
  final String listingId;
  final bool read;
  final bool available;
  final DiscoveryListingSummary? listing;

  factory DiscoveryNotification.fromJson(Map<String, dynamic> json) {
    final id = json['id']?.toString() ?? '';
    final listingId = json['listingId']?.toString() ?? '';
    final searchName = json['searchName']?.toString().trim() ?? '';
    final available = json['available'];
    final rawListing = json['listing'];
    if (!_discoveryUuid.hasMatch(id) || !_discoveryUuid.hasMatch(listingId) || searchName.isEmpty || searchName.length > 120 || available is! bool) {
      throw const FormatException('Invalid discovery notification');
    }
    final listing = rawListing == null
        ? null
        : rawListing is Map
            ? DiscoveryListingSummary.fromJson(Map<String, dynamic>.from(rawListing))
            : throw const FormatException('Invalid discovery notification listing');
    if ((listing != null) != available || (listing != null && listing.id != listingId)) {
      throw const FormatException('Discovery notification mismatch');
    }
    return DiscoveryNotification(id: id, searchName: searchName, listingId: listingId, read: json['readAt'] != null, available: available, listing: listing);
  }
}
