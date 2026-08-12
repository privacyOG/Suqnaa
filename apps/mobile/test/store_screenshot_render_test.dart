import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:suqnaa/l10n/app_localizations.dart';
import 'package:suqnaa/src/api/catalog_api.dart';
import 'package:suqnaa/src/api/challenge_config_api.dart';
import 'package:suqnaa/src/api/order_activity_api.dart';
import 'package:suqnaa/src/api/order_fulfilment_api.dart';
import 'package:suqnaa/src/features/catalog/listing_detail_screen.dart';
import 'package:suqnaa/src/features/conversations/session_conversation_inbox.dart';
import 'package:suqnaa/src/features/home/home_screen.dart';
import 'package:suqnaa/src/features/orders/order_activity_screen.dart';
import 'package:suqnaa/src/features/orders/order_fulfilment_screen.dart';
import 'package:suqnaa/src/features/sell/create_listing_screen.dart';
import 'package:suqnaa/src/navigation/secure_web_handoff.dart';
import 'package:suqnaa/src/session/access_state.dart';
import 'package:suqnaa/src/session/app_session.dart';
import 'package:suqnaa/src/session/session_scope.dart';

void main() {
  const enabled = bool.fromEnvironment('CAPTURE_STORE_SCREENSHOTS');

  for (final scenario in const [
    _Scenario(TargetPlatform.android, Locale('en'), 'android/en'),
    _Scenario(TargetPlatform.android, Locale('ar'), 'android/ar'),
    _Scenario(TargetPlatform.iOS, Locale('en'), 'ios/en'),
    _Scenario(TargetPlatform.iOS, Locale('ar'), 'ios/ar'),
  ]) {
    testWidgets('store renders ${scenario.output}', (tester) async {
      if (!enabled) return;
      final ar = scenario.locale.languageCode == 'ar';
      final catalogue = _CatalogGateway();
      final screens = <(String, Widget)>[
        ('01-catalogue.png', HomeScreen(catalogApi: catalogue)),
        (
          '02-listing-detail.png',
          ListingDetailScreen(
            api: catalogue,
            listingId: _CatalogGateway.listing.id,
            initialListing: _CatalogGateway.listing,
          ),
        ),
        ('03-sell-listing.png', const CreateListingScreen()),
        (
          '04-messages.png',
          SessionConversationInbox(
            pageLoader: (token, {limit = 20, before}) async {
              expect(token, 'store-capture-token');
              return {
                'conversations': [
                  {
                    'id': '723e4567-e89b-42d3-a456-426614174000',
                    'listingId': _CatalogGateway.listing.id,
                    'counterpart': {
                      'id': '823e4567-e89b-42d3-a456-426614174000',
                      'displayName': ar ? 'مشتري تجريبي' : 'Sample buyer',
                    },
                    'latestMessage': {
                      'body': ar
                          ? 'مرحباً، هل الكاميرا ما زالت متاحة للاستلام؟'
                          : 'Hi, is the camera still available for pickup?',
                    },
                    'unreadCount': 2,
                    'safety': {'muted': false, 'messagingAvailable': true},
                  },
                ],
                'pagination': {'hasMore': false, 'nextCursor': null},
              };
            },
          ),
        ),
        (
          '05-offer-order.png',
          OrderActivityScreen(
            gateway: _OrderGateway(),
            accessToken: 'store-capture-token',
          ),
        ),
        (
          '06-fulfilment-safety.png',
          OrderFulfilmentScreen(
            orderGateway: _OrderGateway(),
            fulfilmentGateway: _FulfilmentGateway(),
            challengeGateway: _ChallengeGateway(),
            secureWebHandoffGateway: _SecureWebHandoff(),
            accessToken: 'store-capture-token',
          ),
        ),
      ];

      for (final (fileName, screen) in screens) {
        final boundary = await _pump(tester, scenario, screen);
        await _settle(tester);
        if (ar) {
          expect(Directionality.of(boundary.currentContext!), TextDirection.rtl);
        }
        await _capture(tester, boundary, scenario.output, fileName);
      }
    });
  }
}

Future<GlobalKey> _pump(
  WidgetTester tester,
  _Scenario scenario,
  Widget screen,
) async {
  tester.view.physicalSize = const Size(1080, 1920);
  tester.view.devicePixelRatio = 1;
  final session = AppSession(
    initial: const AccessState(value: 'store-capture-token'),
  );
  final boundary = GlobalKey();

  await tester.pumpWidget(
    MaterialApp(
      locale: scenario.locale,
      theme: ThemeData(
        platform: scenario.platform,
        fontFamily: 'StoreCapture',
      ),
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ],
      supportedLocales: AppLocalizations.supportedLocales,
      home: SessionScope(
        session: session,
        child: RepaintBoundary(key: boundary, child: screen),
      ),
    ),
  );

  addTearDown(() {
    session.dispose();
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });
  return boundary;
}

Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 8; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

Future<void> _capture(
  WidgetTester tester,
  GlobalKey boundaryKey,
  String output,
  String fileName,
) async {
  final bytes = await tester.runAsync(() async {
    final render =
        boundaryKey.currentContext!.findRenderObject()! as RenderRepaintBoundary;
    final image = await render.toImage(pixelRatio: 1);
    try {
      final data = await image.toByteData(format: ui.ImageByteFormat.png);
      if (data == null) throw StateError('No PNG bytes for $fileName');
      return data.buffer.asUint8List();
    } finally {
      image.dispose();
    }
  });
  final file = File('build/store-screenshot-candidates/$output/$fileName');
  file.parent.createSync(recursive: true);
  file.writeAsBytesSync(bytes!, flush: true);
  expect(file.lengthSync(), greaterThan(1024));
}

class _Scenario {
  const _Scenario(this.platform, this.locale, this.output);
  final TargetPlatform platform;
  final Locale locale;
  final String output;
}

class _CatalogGateway implements CatalogGateway {
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
  Future<CatalogPageDto> search(CatalogSearchOptions options) async =>
      const CatalogPageDto(
        listings: [listing],
        hasMore: false,
        nextCursor: null,
      );
}

class _OrderGateway implements OrderActivityGateway {
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
        OrderProgressStep(
          key: OrderProgressStepKey.created,
          state: OrderProgressStepState.complete,
        ),
        OrderProgressStep(
          key: OrderProgressStepKey.paid,
          state: OrderProgressStepState.complete,
        ),
        OrderProgressStep(
          key: OrderProgressStepKey.fulfilment,
          state: OrderProgressStepState.current,
        ),
        OrderProgressStep(
          key: OrderProgressStepKey.complete,
          state: OrderProgressStepState.upcoming,
        ),
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
    String token, {
    OrderActivityStatus? status,
    int limit = 20,
    String? before,
  }) async => const OrderActivityPage(
        orders: [order],
        hasMore: false,
        nextCursor: null,
      );

  @override
  Future<OrderActivity> fetchDetail(
    String token, {
    required String orderId,
  }) async => order;
}

class _FulfilmentGateway implements OrderFulfilmentGateway {
  @override
  Future<OrderFulfilmentContext> fetchContext(
    String token, {
    required String orderId,
  }) async => const OrderFulfilmentContext(
        orderId: '423e4567-e89b-42d3-a456-426614174000',
        paymentIntentId: '923e4567-e89b-42d3-a456-426614174000',
        paymentStatus: MobilePaymentContextStatus.held,
        providerConfigured: true,
        fulfilmentId: 'a23e4567-e89b-42d3-a456-426614174000',
        fulfilmentStatus: MobileFulfilmentStatus.shipped,
        releaseEnabled: false,
      );

  @override
  Future<OrderFulfilmentResult> update(
    String token, {
    required String orderId,
    required MobileFulfilmentAction action,
    String? carrier,
    String? trackingReference,
    String? challengeResponse,
  }) => throw UnimplementedError();
}

class _ChallengeGateway implements ChallengeConfigurationGateway {
  @override
  Future<MobileChallengeConfiguration> fetch() async =>
      const MobileChallengeConfiguration(
        enabled: false,
        provider: 'none',
        siteKey: null,
        paymentCheckoutAction: 'payment_checkout_prepare',
        orderCancelAction: 'order_cancel',
        fulfilmentManageAction: 'fulfilment_manage',
        fulfilmentConfirmAction: 'fulfilment_confirm',
      );
}

class _SecureWebHandoff implements SecureWebHandoffGateway {
  @override
  Future<bool> openOrder({required String locale, required String orderId}) async =>
      true;

  @override
  Future<bool> openOrders({required String locale}) async => true;
}
