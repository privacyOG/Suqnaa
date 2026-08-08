import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:suqnaa/l10n/app_localizations.dart';
import 'package:suqnaa/src/api/catalog_api.dart';
import 'package:suqnaa/src/api/discovery_api.dart';
import 'package:suqnaa/src/features/catalog/listing_detail_screen.dart';
import 'package:suqnaa/src/features/discovery/discovery_screen.dart';

const listingId = '123e4567-e89b-42d3-a456-426614174000';
const searchId = '223e4567-e89b-42d3-a456-426614174000';
const notificationId = '323e4567-e89b-42d3-a456-426614174000';

Widget app(Widget home) => MaterialApp(
  localizationsDelegates: const [
    AppLocalizations.delegate,
    GlobalMaterialLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
  ],
  supportedLocales: AppLocalizations.supportedLocales,
  home: home,
);

void main() {
  testWidgets('listing detail records view and toggles saved and watch state', (tester) async {
    final discovery = _FakeDiscoveryGateway();
    final catalog = _FakeCatalogGateway();
    await tester.pumpWidget(app(ListingDetailScreen(
      api: catalog,
      listingId: listingId,
      initialListing: catalog.listing,
      discoveryGateway: discovery,
      accessToken: 'token',
    )));
    await tester.pumpAndSettle();

    expect(discovery.views, 1);
    expect(find.byKey(const Key('listing-save-action')), findsOneWidget);
    expect(find.byKey(const Key('listing-watch-action')), findsOneWidget);

    await tester.tap(find.byKey(const Key('listing-save-action')));
    await tester.pumpAndSettle();
    expect(discovery.saves, 1);

    await tester.tap(find.byKey(const Key('listing-watch-action')));
    await tester.pumpAndSettle();
    expect(discovery.watches, 1);
  });

  testWidgets('discovery centre displays all durable discovery collections', (tester) async {
    final discovery = _FakeDiscoveryGateway();
    await tester.pumpWidget(app(DiscoveryScreen(
      gateway: discovery,
      accessToken: 'token',
    )));
    await tester.pumpAndSettle();

    expect(find.text('Saved listings'), findsOneWidget);
    expect(find.text('Watchlist'), findsOneWidget);
    expect(find.textContaining('Notifications'), findsOneWidget);
    expect(find.byKey(const Key('discovery-read-all')), findsOneWidget);

    await tester.scrollUntilVisible(
      find.text('Saved searches'),
      350,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();

    expect(find.text('Recently viewed'), findsOneWidget);
    expect(find.text('Saved searches'), findsOneWidget);
    expect(find.text('Camera'), findsWidgets);
    expect(find.text('Sydney camera'), findsWidgets);
  });
}

class _FakeCatalogGateway implements CatalogGateway {
  final listing = const CatalogListingDto(
    id: listingId,
    title: 'Camera',
    description: 'Camera listing',
    priceAmount: 899.5,
    currencyCode: 'AUD',
    condition: 'good',
    availabilityStatus: 'in_stock',
    countryCode: 'AU',
    city: 'Sydney',
    allowPickup: true,
    allowDelivery: true,
    media: [],
    mediaCount: 0,
    seller: CatalogSellerDto(
      id: '423e4567-e89b-42d3-a456-426614174000',
      displayName: 'Seller',
      status: 'active',
    ),
  );

  @override
  Future<List<CatalogCategoryDto>> fetchCategories() async => const [];
  @override
  Future<CatalogListingDto> fetchListing(String id) async => listing;
  @override
  Future<CatalogPageDto> search(CatalogSearchOptions options) async => CatalogPageDto(listings: [listing], hasMore: false, nextCursor: null);
}

class _FakeDiscoveryGateway implements DiscoveryGateway {
  int views = 0;
  int saves = 0;
  int watches = 0;
  var state = const DiscoveryListingState(listingId: listingId, saved: false, watching: false);

  DiscoveryListingSummary get summary => const DiscoveryListingSummary(
    id: listingId,
    title: 'Camera',
    priceAmount: 899.5,
    currencyCode: 'AUD',
    city: 'Sydney',
    countryCode: 'AU',
  );

  @override
  Future<DiscoveryListingState> getListingState(String accessToken, String listingId) async => state;
  @override
  Future<void> recordView(String accessToken, String listingId) async { views += 1; }
  @override
  Future<void> saveListing(String accessToken, String listingId) async { saves += 1; state = DiscoveryListingState(listingId: listingId, saved: true, watching: state.watching); }
  @override
  Future<void> removeSavedListing(String accessToken, String listingId) async { state = DiscoveryListingState(listingId: listingId, saved: false, watching: state.watching); }
  @override
  Future<void> watchListing(String accessToken, String listingId) async { watches += 1; state = DiscoveryListingState(listingId: listingId, saved: state.saved, watching: true); }
  @override
  Future<void> removeWatchedListing(String accessToken, String listingId) async { state = DiscoveryListingState(listingId: listingId, saved: state.saved, watching: false); }

  DiscoveryRelationshipItem get relationship => DiscoveryRelationshipItem(
    listingId: listingId,
    available: true,
    listing: summary,
    viewCount: 2,
  );

  @override
  Future<List<DiscoveryRelationshipItem>> getSavedListings(String accessToken) async => [relationship];
  @override
  Future<List<DiscoveryRelationshipItem>> getWatchlist(String accessToken) async => [relationship];
  @override
  Future<List<DiscoveryRelationshipItem>> getRecentlyViewed(String accessToken) async => [relationship];
  @override
  Future<List<DiscoverySavedSearch>> getSavedSearches(String accessToken) async => const [
    DiscoverySavedSearch(id: searchId, name: 'Sydney camera', filters: {'q': 'camera'}, active: true),
  ];
  @override
  Future<DiscoverySavedSearch> createSavedSearch(String accessToken, {required String name, required CatalogSearchOptions filters}) async => DiscoverySavedSearch(id: searchId, name: name, filters: const {}, active: true);
  @override
  Future<DiscoverySavedSearch> setSavedSearchActive(String accessToken, {required String searchId, required bool active}) async => DiscoverySavedSearch(id: searchId, name: 'Sydney camera', filters: const {'q': 'camera'}, active: active);
  @override
  Future<void> deleteSavedSearch(String accessToken, String searchId) async {}
  @override
  Future<List<DiscoveryNotification>> getNotifications(String accessToken, {bool unreadOnly = false}) async => [
    DiscoveryNotification(id: notificationId, searchName: 'Sydney camera', listingId: listingId, read: false, available: true, listing: summary),
  ];
  @override
  Future<void> markNotificationRead(String accessToken, String notificationId) async {}
  @override
  Future<void> markAllNotificationsRead(String accessToken) async {}
}
