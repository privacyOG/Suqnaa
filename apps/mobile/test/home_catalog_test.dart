import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:suqnaa/l10n/app_localizations.dart';
import 'package:suqnaa/src/api/catalog_api.dart';
import 'package:suqnaa/src/features/home/home_screen.dart';

void main() {
  testWidgets('home loads live listings and submits search text', (tester) async {
    tester.view.physicalSize = const Size(1080, 1920);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final gateway = _FakeCatalogGateway();
    await tester.pumpWidget(
      MaterialApp(
        localizationsDelegates: const [
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
        ],
        supportedLocales: AppLocalizations.supportedLocales,
        home: HomeScreen(catalogApi: gateway),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Mirrorless camera'), findsOneWidget);
    expect(find.text('Electronics'), findsOneWidget);
    expect(gateway.searches, hasLength(1));

    await tester.enterText(
      find.byType(TextField).first,
      'camera',
    );
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await tester.pumpAndSettle();

    expect(gateway.searches, hasLength(2));
    expect(gateway.searches.last.query, 'camera');
  });
}

class _FakeCatalogGateway implements CatalogGateway {
  final List<CatalogSearchOptions> searches = [];

  final CatalogListingDto listing = const CatalogListingDto(
    id: '123e4567-e89b-42d3-a456-426614174000',
    title: 'Mirrorless camera',
    description: 'Camera body in excellent condition.',
    priceAmount: 899.5,
    currencyCode: 'AUD',
    condition: 'like_new',
    availabilityStatus: 'in_stock',
    countryCode: 'AU',
    region: 'NSW',
    city: 'Sydney',
    suburb: 'Greenacre',
    allowPickup: true,
    allowDelivery: false,
    media: [],
    mediaCount: 0,
    seller: CatalogSellerDto(
      id: '323e4567-e89b-42d3-a456-426614174000',
      displayName: 'Seller',
      status: 'active',
    ),
  );

  @override
  Future<List<CatalogCategoryDto>> fetchCategories() async {
    return const [
      CatalogCategoryDto(
        id: '223e4567-e89b-42d3-a456-426614174000',
        slug: 'electronics',
        nameEn: 'Electronics',
        nameAr: 'إلكترونيات',
      ),
    ];
  }

  @override
  Future<CatalogListingDto> fetchListing(String listingId) async => listing;

  @override
  Future<CatalogPageDto> search(CatalogSearchOptions options) async {
    searches.add(options);
    return CatalogPageDto(
      listings: [listing],
      hasMore: false,
      nextCursor: null,
    );
  }
}
