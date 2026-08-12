import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:suqnaa/l10n/app_localizations.dart';
import 'package:suqnaa/src/api/catalog_api.dart';
import 'package:suqnaa/src/api/order_activity_api.dart';
import 'package:suqnaa/src/features/catalog/listing_detail_screen.dart';
import 'package:suqnaa/src/features/home/home_screen.dart';
import 'package:suqnaa/src/features/orders/order_activity_screen.dart';
import 'package:suqnaa/src/features/sell/create_listing_screen.dart';
import 'package:suqnaa/src/session/access_state.dart';
import 'package:suqnaa/src/session/app_session.dart';
import 'package:suqnaa/src/session/session_scope.dart';

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
      final boundaryKey = await _pumpCapture(tester, scenario, HomeScreen(catalogApi: gateway));
      await _pumpCaptureFrames(tester);

      expect(find.text('Mirrorless camera'), findsOneWidget);
      if (scenario.locale.languageCode == 'ar') {
        expect(Directionality.of(tester.element(find.byType(HomeScreen))), TextDirection.rtl);
      }
      await _writeCapture(tester, boundaryKey, scenario, '01-catalogue.png');
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
      await _pumpCaptureFrames(tester);

      expect(find.text('Mirrorless camera'), findsOneWidget);
      expect(find.textContaining('899'), findsWidgets);
      if (scenario.locale.languageCode == 'ar') {
        expect(Directionality.of(tester.element(find.byType(ListingDetailScreen))), TextDirection.rtl);
      }
      await _writeCapture(tester, boundaryKey, scenario, '02-listing-detail.png');
    });

    testWidgets('captures listing management ${scenario.outputDirectory}', (tester) async {
      if (!captureEnabled) return;
      final boundaryKey = await _pumpCapture(tester, scenario, const CreateListingScreen());
      await _pumpCaptureFrames(tester);

      final heading = scenario.locale.languageCode == 'ar' ? 'بِع على سوقنا' : 'Sell on Suqnaa';
      expect(find.text(heading), findsOneWidget);
      if (scenario.locale.languageCode == 'ar') {
        expect(Directionality.of(tester.element(find.byType(CreateListingScreen))), TextDirection.rtl);
      }
      await _writeCapture(tester, boundaryKey, scenario, '03-sell-listing.png');
    });

    testWidgets('captures offer and order ${scenario.outputDirectory}', (tester) async {
      if (!captureEnabled) return;
      final boundaryKey = await _pumpCapture(
        tester,
        scenario,
        OrderActivityScreen(
          gateway: _StoreCaptureOrderGateway(),
          accessToken: 'store-capture-token',
        ),
      );
      await _pumpCaptureFrames(tester);

      expect(find.text('Mirrorless camera'), findsOneWidget);
      if (scenario.locale.languageCode == 'ar') {
        expect(Directionality.of(tester.element(find.byType(OrderActivityScreen))), TextDirection.rtl);
      }
      await _writeCapture(tester, boundaryKey, scenario, '05-offer-order.png');
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

  final session = AppSession(initial: const AccessState(value: 'store-capture-token'));
  addTearDown(session.dispose);
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
      home: SessionScope(
        session: session,
        child: RepaintBoundary(key: boundaryKey, child: screen),
      ),
    ),
  );
  return boundaryKey;
}

Future<void> _pumpCaptureFrames(WidgetTester tester) async {
  for (var frame = 0; frame < 6; frame += 1) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

Future<void> _writeCapture(
  WidgetTester tester,
  GlobalKey boundaryKey,
  _CaptureScenario scenario,
  String fileName,
) async {
  final bytes = await tester.runAsync(() async {
    final boundary = boundaryKey.currentContext!.findRenderObject()! as RenderRepaintBoundary;
    final image = await boundary.toImage(pixelRatio: 1);
    try {
      final byteData = await image.toByteData(format: ui.ImageByteFormat.png);
      if (byteData == null) {
        throw StateError('Flutter engine returned no PNG bytes for $fileName');
      }
      return byteData.buffer.asUint8List();
    } finally {
      image.dispose();
    }
  });
  expect(bytes, isNotNull);

  final output = File('build/store-screenshot-candidates/${scenario.outputDirectory}/$fileName');
  output.parent.createSync(recursive: true);
  output.writeAsBytesSync(bytes!, flush: true);
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

class _StoreCaptureOrderGateway implements OrderActivityGateway {
  static const order = OrderActivity(
    id: '423e4567-e89b-42d3-a456-426614174000',
    offerId: '523e4567-e89b-42d3-a456-426614174000',
    listingId: '123e4567-e89b-42d3-a456-426614174000',
    buyerId: '623e4567-e89b-42d3-a456-426614174000',
    sellerId: '323e4567-e89b-42d3-a456-426614174000',
    amount: '825.00',
    currencyCode: 'AUD',
    status: OrderActivityStatus.paid,
    paymentMethod: 'protected_card',
    createdAt: '2026-08-10T02:00:00Z',
    updatedAt: '2026-08-11T04:30:00Z',
    role: OrderRole.buyer,
    progress: OrderProgress(
      stage: OrderProgressStage.fulfilment,
      percent: 55,
      terminal: false,
      steps: [
        OrderProgressStep(key: OrderProgressStepKey.created, state: OrderProgressStepState.complete),
        OrderProgressStep(key: OrderProgressStepKey.paid, state: OrderProgressStepState.complete),
        OrderProgressStep(key: OrderProgressStepKey.fulfilment, state: OrderProgressStepState.current),
        OrderProgressStep(key: OrderProgressStepKey.complete, state: OrderProgressStepState.upcoming),
      ],
    ),
    listing: OrderListingSummary(
      id: '123e4567-e89b-42d3-a456-426614174000',
      title: 'Mirrorless camera',
      status: 'sold',
      priceAmount: '899.50',
      currencyCode: 'AUD',
    ),
    counterpart: OrderCounterpartSummary(
      id: '323e4567-e89b-42d3-a456-426614174000',
      displayName: 'Suqnaa Test Seller',
      status: 'active',
    ),
    offer: OrderOfferSummary(
      id: '523e4567-e89b-42d3-a456-426614174000',
      status: 'accepted',
      message: 'Can collect this weekend.',
      createdAt: '2026-08-10T02:00:00Z',
      updatedAt: '2026-08-10T02:15:00Z',
    ),
  );

  @override
  Future<OrderActivityPage> fetchPage(
    String accessToken, {
    OrderActivityStatus? status,
    int limit = 20,
    String? before,
  }) async => const OrderActivityPage(orders: [order], hasMore: false, nextCursor: null);

  @override
  Future<OrderActivity> fetchDetail(
    String accessToken, {
    required String orderId,
  }) async => order;
}
