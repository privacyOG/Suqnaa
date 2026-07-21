import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:suqnaa/l10n/app_localizations.dart';
import 'package:suqnaa/src/api/challenge_config_api.dart';
import 'package:suqnaa/src/api/order_activity_api.dart';
import 'package:suqnaa/src/api/order_fulfilment_api.dart';
import 'package:suqnaa/src/features/orders/order_fulfilment_screen.dart';
import 'package:suqnaa/src/navigation/secure_web_handoff.dart';

const sellerOrderId = '123e4567-e89b-42d3-a456-426614174000';
const buyerOrderId = '223e4567-e89b-42d3-a456-426614174000';
const sellerListingId = '323e4567-e89b-42d3-a456-426614174000';
const buyerListingId = '423e4567-e89b-42d3-a456-426614174000';
const buyerId = '523e4567-e89b-42d3-a456-426614174000';
const sellerId = '623e4567-e89b-42d3-a456-426614174000';
const sellerOfferId = '723e4567-e89b-42d3-a456-426614174000';
const buyerOfferId = '823e4567-e89b-42d3-a456-426614174000';
const intentId = '923e4567-e89b-42d3-a456-426614174000';
const fulfilmentId = 'a23e4567-e89b-42d3-a456-426614174000';

OrderActivity paidOrder({
  required String id,
  required String listingId,
  required String offerId,
  required String title,
  required String role,
}) {
  return OrderActivity.fromJson({
    'id': id,
    'offerId': offerId,
    'listingId': listingId,
    'buyerId': buyerId,
    'sellerId': sellerId,
    'amount': '80.00',
    'currencyCode': 'AUD',
    'status': 'paid',
    'paymentMethod': 'card',
    'createdAt': '2026-07-20T01:00:00.000Z',
    'updatedAt': '2026-07-21T01:00:00.000Z',
    'role': role,
    'progress': {
      'stage': 'fulfilment',
      'percent': 60,
      'terminal': false,
      'steps': [
        {'key': 'created', 'state': 'complete'},
        {'key': 'paid', 'state': 'complete'},
        {'key': 'fulfilment', 'state': 'current'},
        {'key': 'complete', 'state': 'upcoming'},
      ],
    },
    'listing': {
      'id': listingId,
      'title': title,
      'status': 'reserved',
      'priceAmount': '100.00',
      'currencyCode': 'AUD',
    },
    'counterpart': {
      'id': role == 'buyer' ? sellerId : buyerId,
      'displayName': role == 'buyer' ? 'Test Seller' : 'Test Buyer',
      'status': 'active',
    },
    'offer': {
      'id': offerId,
      'status': 'accepted',
      'message': null,
      'createdAt': '2026-07-19T01:00:00.000Z',
      'updatedAt': '2026-07-20T01:00:00.000Z',
    },
  });
}

class FakeOrderGateway implements OrderActivityGateway {
  FakeOrderGateway(this.orders);

  final List<OrderActivity> orders;
  int calls = 0;

  @override
  Future<OrderActivityPage> fetchPage(
    String accessToken, {
    OrderActivityStatus? status,
    int limit = 20,
    String? before,
  }) async {
    calls += 1;
    expect(accessToken, 'access-token');
    expect(status, OrderActivityStatus.paid);
    return OrderActivityPage(
      orders: orders,
      hasMore: false,
      nextCursor: null,
    );
  }

  @override
  Future<OrderActivity> fetchDetail(
    String accessToken, {
    required String orderId,
  }) async {
    throw UnimplementedError();
  }
}

class FakeFulfilmentGateway implements OrderFulfilmentGateway {
  FakeFulfilmentGateway(this.statusByOrder);

  final Map<String, MobileFulfilmentStatus> statusByOrder;
  int updateCalls = 0;
  MobileFulfilmentAction? lastAction;
  String? lastCarrier;
  String? lastTracking;

  @override
  Future<OrderFulfilmentContext> fetchContext(
    String accessToken, {
    required String orderId,
  }) async {
    return OrderFulfilmentContext(
      orderId: orderId,
      paymentIntentId: intentId,
      paymentStatus: MobilePaymentContextStatus.held,
      providerConfigured: true,
      fulfilmentId: fulfilmentId,
      fulfilmentStatus: statusByOrder[orderId]!,
      releaseEnabled: false,
    );
  }

  @override
  Future<OrderFulfilmentResult> update(
    String accessToken, {
    required String orderId,
    required MobileFulfilmentAction action,
    String? carrier,
    String? trackingReference,
    String? challengeResponse,
  }) async {
    updateCalls += 1;
    lastAction = action;
    lastCarrier = carrier;
    lastTracking = trackingReference;
    expect(accessToken, 'access-token');
    expect(challengeResponse, isNull);
    final status = switch (action) {
      MobileFulfilmentAction.readyForPickup =>
        MobileFulfilmentStatus.readyForPickup,
      MobileFulfilmentAction.shipped => MobileFulfilmentStatus.shipped,
      MobileFulfilmentAction.confirmReceived =>
        MobileFulfilmentStatus.receivedConfirmed,
    };
    statusByOrder[orderId] = status;
    return OrderFulfilmentResult(
      orderId: orderId,
      fulfilmentId: fulfilmentId,
      status: status,
      carrier: carrier?.trim(),
      trackingReference: trackingReference?.trim(),
      shippedAt: action == MobileFulfilmentAction.shipped
          ? DateTime.parse('2026-07-21T11:00:00.000Z')
          : null,
      deliveredAt: null,
      buyerConfirmedAt: action == MobileFulfilmentAction.confirmReceived
          ? DateTime.parse('2026-07-21T11:00:00.000Z')
          : null,
      updatedAt: DateTime.parse('2026-07-21T11:00:00.000Z'),
      unchanged: false,
    );
  }
}

class FakeChallengeGateway implements ChallengeConfigurationGateway {
  FakeChallengeGateway({required this.enabled});

  final bool enabled;

  @override
  Future<MobileChallengeConfiguration> fetch() async {
    return MobileChallengeConfiguration(
      enabled: enabled,
      provider: enabled ? 'turnstile' : 'none',
      siteKey: enabled ? 'site-key' : null,
      paymentCheckoutAction: 'payment_checkout_prepare',
      orderCancelAction: 'order_cancel',
      fulfilmentManageAction: 'fulfilment_manage',
      fulfilmentConfirmAction: 'fulfilment_confirm',
    );
  }
}

class FakeSecureWebHandoff implements SecureWebHandoffGateway {
  int orderCalls = 0;
  String? locale;
  String? orderId;

  @override
  Future<bool> openOrder({
    required String locale,
    required String orderId,
  }) async {
    orderCalls += 1;
    this.locale = locale;
    this.orderId = orderId;
    return true;
  }

  @override
  Future<bool> openOrders({required String locale}) async {
    throw UnimplementedError();
  }
}

Widget testApp({
  required FakeOrderGateway orders,
  required FakeFulfilmentGateway fulfilment,
  required FakeChallengeGateway challenge,
  required FakeSecureWebHandoff secureWeb,
  Locale locale = const Locale('en'),
}) {
  return MaterialApp(
    locale: locale,
    localizationsDelegates: const [
      AppLocalizations.delegate,
      GlobalMaterialLocalizations.delegate,
      GlobalCupertinoLocalizations.delegate,
      GlobalWidgetsLocalizations.delegate,
    ],
    supportedLocales: AppLocalizations.supportedLocales,
    home: OrderFulfilmentScreen(
      orderGateway: orders,
      fulfilmentGateway: fulfilment,
      challengeGateway: challenge,
      secureWebHandoffGateway: secureWeb,
      accessToken: 'access-token',
    ),
  );
}

void main() {
  testWidgets('seller records ready-for-pickup only after confirmation', (
    tester,
  ) async {
    final orders = FakeOrderGateway([
      paidOrder(
        id: sellerOrderId,
        listingId: sellerListingId,
        offerId: sellerOfferId,
        title: 'Seller laptop',
        role: 'seller',
      ),
    ]);
    final fulfilment = FakeFulfilmentGateway({
      sellerOrderId: MobileFulfilmentStatus.notStarted,
    });

    await tester.pumpWidget(
      testApp(
        orders: orders,
        fulfilment: fulfilment,
        challenge: FakeChallengeGateway(enabled: false),
        secureWeb: FakeSecureWebHandoff(),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Seller laptop'), findsOneWidget);
    expect(
      find.byKey(const Key('fulfilment-ready_for_pickup-$sellerOrderId')),
      findsOneWidget,
    );
    expect(
      find.byKey(const Key('fulfilment-shipped-$sellerOrderId')),
      findsOneWidget,
    );
    expect(fulfilment.updateCalls, 0);

    await tester.tap(
      find.byKey(const Key('fulfilment-ready_for_pickup-$sellerOrderId')),
    );
    await tester.pumpAndSettle();
    expect(fulfilment.updateCalls, 0);

    await tester.tap(
      find.byKey(const Key('confirm-fulfilment-ready_for_pickup')),
    );
    await tester.pumpAndSettle();

    expect(fulfilment.updateCalls, 1);
    expect(fulfilment.lastAction, MobileFulfilmentAction.readyForPickup);
    expect(
      find.text('No paid orders currently require a fulfilment action.'),
      findsOneWidget,
    );
  });

  testWidgets('uses secure web order when browser verification is enabled', (
    tester,
  ) async {
    final orders = FakeOrderGateway([
      paidOrder(
        id: sellerOrderId,
        listingId: sellerListingId,
        offerId: sellerOfferId,
        title: 'Seller laptop',
        role: 'seller',
      ),
    ]);
    final fulfilment = FakeFulfilmentGateway({
      sellerOrderId: MobileFulfilmentStatus.notStarted,
    });
    final secureWeb = FakeSecureWebHandoff();

    await tester.pumpWidget(
      testApp(
        orders: orders,
        fulfilment: fulfilment,
        challenge: FakeChallengeGateway(enabled: true),
        secureWeb: secureWeb,
      ),
    );
    await tester.pumpAndSettle();

    expect(
      find.textContaining('Browser security verification is required'),
      findsOneWidget,
    );
    expect(
      find.byKey(const Key('fulfilment-ready_for_pickup-$sellerOrderId')),
      findsNothing,
    );

    await tester.tap(
      find.byKey(const Key('open-secure-fulfilment-$sellerOrderId')),
    );
    await tester.pumpAndSettle();

    expect(secureWeb.orderCalls, 1);
    expect(secureWeb.locale, 'en');
    expect(secureWeb.orderId, sellerOrderId);
    expect(fulfilment.updateCalls, 0);
  });

  testWidgets('buyer confirmation is rendered in Arabic', (tester) async {
    final orders = FakeOrderGateway([
      paidOrder(
        id: buyerOrderId,
        listingId: buyerListingId,
        offerId: buyerOfferId,
        title: 'هاتف تجريبي',
        role: 'buyer',
      ),
    ]);
    final fulfilment = FakeFulfilmentGateway({
      buyerOrderId: MobileFulfilmentStatus.shipped,
    });

    await tester.pumpWidget(
      testApp(
        orders: orders,
        fulfilment: fulfilment,
        challenge: FakeChallengeGateway(enabled: false),
        secureWeb: FakeSecureWebHandoff(),
        locale: const Locale('ar'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('هاتف تجريبي'), findsOneWidget);
    expect(find.text('تأكيد الاستلام'), findsOneWidget);
    expect(find.text('تأكيد الاستلام لا يحرر الأموال تلقائياً.'), findsWidgets);
  });
}
