import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:suqnaa/l10n/app_localizations.dart';
import 'package:suqnaa/src/api/catalog_api.dart';
import 'package:suqnaa/src/features/catalog/listing_detail_screen.dart';
import 'package:suqnaa/src/features/home/home_screen.dart';

void main() {
  const captureEnabled = bool.fromEnvironment('CAPTURE_STORE_SCREENSHOTS');

  for (final scenario in const [
    _CaptureScenario(TargetPlatform.android, Locale('en'), 'android/en'),
    _CaptureScenario(TargetPlatform.android, Locale('ar'), 'android/ar'),
    _CaptureScenario(TargetPlatform.iOS, Locale('en'), 'ios/en'),
    _CaptureScenario(TargetPlatform.iOS, Locale('ar'), 'ios/ar'),
  ]) {
    testWidgets('captures catalogue ${scenario.outputDirectory}', (tester) async {
      if (!captureEnabled) return;
      final gateway = _StoreCaptureCatalogGateway();
      final boundaryKey = await _pumpCapture(
        tester,
        scenario,
        HomeScreen(catalogApi: gateway),
      );
      await tester.pumpAndSettle();

      expect(find.text('Mirrorless camera'), findsOneWidget);
      if (scenario.locale.languageCode == 'ar') {
        expect(Directionality.of(tester.element(find.byType(HomeScreen))), TextDirection.rtl);
      }

      await _writeCapture(boundaryKey, scenario, '01-catalogue.png');
    });

    testWidgets('captures listing detail ${scenario.outputDirectory}', (tester) async {
      if (!captureEnabled) return;
      final gateway = _StoreCaptureCatalogGateway();
      final boundaryKey = await _pumpCapture(
        tester,
        scenario,
        ListingDetailScreen(
          api: gateway,
          listingId: _StoreCaptureCatalogGateway.listing.id,
          initialListing: _StoreCaptureCatalogGateway.listing,
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Mirrorless camera'), findsOneWidget);
      expect(find.textContaining('899'), findsWidgets);
      if (scenario.locale.languageCode == 'ar') {
        expect(Directionality.of(tester.element(find.byType(ListingDetailScreen))), TextDirection.rtl);
      }

      await _writeCapture(boundaryKey, scenario, '02-listing-detail.png');
    });
  }
}

Future<GlobalKey> _pumpCapture(
  WidgetTester tester,
  _CaptureScenario scenario,
  Widget screen,
) async {
  tester.view.physicalSize = const Size(1080, 1920);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  final boundaryKey = GlobalKey();
  await tester.pumpWidget(
    MaterialApp(
      locale: scenario.locale,
      theme: ThemeData(platform: scenario.platform),
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ],
      supportedLocales: AppLocalizations.supportedLocales,
      home: RepaintBoundary(key: boundaryKey, child: screen),
    ),
  );
  return boundaryKey;
}

Future<void> _writeCapture(
  GlobalKey boundaryKey,
  _CaptureScenario scenario,
  String fileName,
) async {
  final boundary = boundaryKey.currentContext!.findRenderObject()! as RenderRepaintBoundary;
  final image = await boundary.toImage(pixelRatio: 1);
  final byteData = await image.toByteData(format: ui.ImageByteFormat.png);
  expect(byteData, isNotNull);

  final output = File(
    'build/store-screenshot-candidates/${scenario.outputDirectory}/$fileName',
  );
  output.parent.createSync(recursive: true);
  output.writeAsBytesSync(byteData!.buffer.asUint8List(), flush: true);
  expect(output.lengthSync(), greaterThan(1024));
}

class _CaptureScenario {
  const _CaptureScenario(this.platform, this.locale, this.outputDirectory);

  final TargetPlatform platform;
  final Locale locale;
  final String outputDirectory;
}

class _StoreCaptureCatalogGateway implements CatalogGateway {
  static const listing = CatalogListingDto(
    id: '123e4567-e89b-42d3-a456-426614174000',
    title: 'Mirrorless camera',
    description: 'Camera body in excellent condition with two batteries and charger.',
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
      displayName: 'Suqnaa Test Seller',
      status: 'active',
    ),
  );

  @override
  Future<List<CatalogCategoryDto>> fetchCategories() async => const [
        CatalogCategoryDto(
          id: '223e4567-e89b-42d3-a456-426614174000',
          slug: 'electronics',
          nameEn: 'Electronics',
          nameAr: 'إلكترونيات',
        ),
      ];

  @override
  Future<CatalogListingDto> fetchListing(String listingId) async => listing;

  @override
  Future<CatalogPageDto> search(CatalogSearchOptions options) async => CatalogPageDto(
        listings: const [listing],
        hasMore: false,
        nextCursor: null,
      );
}
