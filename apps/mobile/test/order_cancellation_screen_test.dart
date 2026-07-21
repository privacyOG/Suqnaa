import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:suqnaa/l10n/app_localizations.dart';
import 'package:suqnaa/src/api/challenge_config_api.dart';
import 'package:suqnaa/src/api/order_activity_api.dart';
import 'package:suqnaa/src/api/order_cancellation_api.dart';
import 'package:suqnaa/src/features/orders/order_cancellation_screen.dart';
import 'package:suqnaa/src/navigation/secure_web_handoff.dart';

const buyerOrderId = '123e4567-e89b-42d3-a456-426614174000';
const sellerOrderId = '223e4567-e89b-42d3-a456-426614174000';
const buyerListingId = '323e4567-e89b-42d3-a456-426614174000';
const sellerListingId = '423e4567-e89b-42d3-a456-426614174000';
const buyerId = '523e4567-e89b-42d3-a456-426614174000';
const sellerId = '623e4567-e89b-42d3-a456-426614174000';
const buyerOfferId = '723e4567-e89b-42d3-a456-426614174000';
const sellerOfferId = '823e4567-e89b-42d3-a456-426614174000';

OrderActivity testOrder({
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
    'status': 'pending',
    'paymentMethod': 'bank_transfer',
    'createdAt': '2026-07-20T01:00:00.000Z',
    'updatedAt': '2026-07-21T01:00:00.000Z',
    'role': role,
    'progress': {
      'stage': 'payment_pending',
      'percent': 25,
      'terminal': false,
      'steps': [
        {'key': 'created', 'state': 'complete'},
        {'key': 'paid', 'state': 'current'},
        {'key': 'fulfilment', 'state': 'upcoming'},
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
  bool cancelled = false;
  int calls = 0;

  @override
  Future<OrderActivityPage> fetchPage(
    String accessToken, {
    OrderActivityStatus? status,
    int limit = 20,
    String? before,
  }) async {
    calls += 1;
    expect(status, OrderActivityStatus.pending);
    return OrderActivityPage(
      orders: cancelled ? const [] : orders,
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

class FakeCancellationGateway implements OrderCancellationGateway {
  FakeCancellationGateway(this.orders);

  final FakeOrderGateway orders;
  int calls = 0;

  @override
  Future<OrderCancellationResult> cancel(
    String accessToken, {
    required String orderId,
    String? challengeResponse,
  }) async {
    calls += 1;
    expect(accessToken, 'access-token');
    expect(orderId, buyerOrderId);
    expect(challengeResponse, isNull);
    orders.cancelled = true;
    return OrderCancellationResult(
      orderId: orderId,
      updatedAt: DateTime.parse('2026-07-21T10:30:00.000Z'),
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
  required FakeCancellationGateway cancellation,
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
    home: OrderCancellationScreen(
      orderGateway: orders,
      cancellationGateway: cancellation,
      challengeGateway: challenge,
      secureWebHandoffGateway: secureWeb,
      accessToken: 'access-token',
    ),
  );
}

void main() {
  testWidgets('shows buyer orders only and cancels after confirmation', (
    tester,
  ) async {
    final orders = FakeOrderGateway([
      testOrder(
        id: buyerOrderId,
        listingId: buyerListingId,
        offerId: buyerOfferId,
        title: 'Buyer phone',
        role: 'buyer',
      ),
      testOrder(
        id: sellerOrderId,
        listingId: sellerListingId,
        offerId: sellerOfferId,
        title: 'Seller laptop',
        role: 'seller',
      ),
    ]);
    final cancellation = FakeCancellationGateway(orders);
    final secureWeb = FakeSecureWebHandoff();

    await tester.pumpWidget(
      testApp(
        orders: orders,
        cancellation: cancellation,
        challenge: FakeChallengeGateway(enabled: false),
        secureWeb: secureWeb,
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Buyer phone'), findsOneWidget);
    expect(find.text('Seller laptop'), findsNothing);
    expect(cancellation.calls, 0);

    await tester.tap(find.text('Cancel order').last);
    await tester.pumpAndSettle();

    expect(find.text('Confirm cancellation'), findsWidgets);
    expect(cancellation.calls, 0);

    final dialog = find.byType(AlertDialog);
    await tester.tap(
      find.descendant(
        of: dialog,
        matching: find.text('Confirm cancellation'),
      ).last,
    );
    await tester.pumpAndSettle();

    expect(cancellation.calls, 1);
    expect(find.text('No purchases are waiting for payment preparation.'),
        findsOneWidget);
  });

  testWidgets('uses secure web handoff when browser verification is required', (
    tester,
  ) async {
    final orders = FakeOrderGateway([
      testOrder(
        id: buyerOrderId,
        listingId: buyerListingId,
        offerId: buyerOfferId,
        title: 'Buyer phone',
        role: 'buyer',
      ),
    ]);
    final cancellation = FakeCancellationGateway(orders);
    final secureWeb = FakeSecureWebHandoff();

    await tester.pumpWidget(
      testApp(
        orders: orders,
        cancellation: cancellation,
        challenge: FakeChallengeGateway(enabled: true),
        secureWeb: secureWeb,
      ),
    );
    await tester.pumpAndSettle();

    expect(
      find.textContaining('Browser security verification is required'),
      findsOneWidget,
    );
    expect(find.text('Open secure website'), findsOneWidget);

    await tester.tap(find.text('Open secure website'));
    await tester.pumpAndSettle();

    expect(secureWeb.orderCalls, 1);
    expect(secureWeb.locale, 'en');
    expect(secureWeb.orderId, buyerOrderId);
    expect(cancellation.calls, 0);
  });

  testWidgets('renders Arabic cancellation labels', (tester) async {
    final orders = FakeOrderGateway([
      testOrder(
        id: buyerOrderId,
        listingId: buyerListingId,
        offerId: buyerOfferId,
        title: 'هاتف تجريبي',
        role: 'buyer',
      ),
    ]);

    await tester.pumpWidget(
      testApp(
        orders: orders,
        cancellation: FakeCancellationGateway(orders),
        challenge: FakeChallengeGateway(enabled: false),
        secureWeb: FakeSecureWebHandoff(),
        locale: const Locale('ar'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('إلغاء الطلب'), findsWidgets);
    expect(find.text('هاتف تجريبي'), findsOneWidget);
  });
}
