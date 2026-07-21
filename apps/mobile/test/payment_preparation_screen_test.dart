import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:suqnaa/l10n/app_localizations.dart';
import 'package:suqnaa/src/api/challenge_config_api.dart';
import 'package:suqnaa/src/api/order_activity_api.dart';
import 'package:suqnaa/src/api/order_checkout_api.dart';
import 'package:suqnaa/src/features/orders/payment_preparation_screen.dart';

const buyerOrderId = '123e4567-e89b-42d3-a456-426614174000';
const sellerOrderId = '223e4567-e89b-42d3-a456-426614174000';
const buyerListingId = '323e4567-e89b-42d3-a456-426614174000';
const sellerListingId = '423e4567-e89b-42d3-a456-426614174000';
const buyerId = '523e4567-e89b-42d3-a456-426614174000';
const sellerId = '623e4567-e89b-42d3-a456-426614174000';

OrderActivity testOrder({
  required String id,
  required String listingId,
  required String title,
  required String role,
}) {
  return OrderActivity.fromJson({
    'id': id,
    'offerId': null,
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
    'offer': null,
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
    expect(status, OrderActivityStatus.pending);
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
    );
  }
}

class FakeCheckoutGateway implements OrderCheckoutGateway {
  int calls = 0;

  @override
  Future<CheckoutPreparation> prepare(
    String accessToken, {
    required String orderId,
    String? challengeResponse,
  }) async {
    calls += 1;
    expect(accessToken, 'access-token');
    expect(orderId, buyerOrderId);
    expect(challengeResponse, isNull);
    return const CheckoutPreparation(
      order: CheckoutOrderSnapshot(
        id: buyerOrderId,
        listingId: buyerListingId,
        amount: '80.00',
        currencyCode: 'AUD',
        paymentMethod: CheckoutPaymentMethod.bankTransfer,
      ),
      nextAction: CheckoutNextAction.configureBankTransferInstructions,
    );
  }
}

Widget testApp({
  required OrderActivityGateway orderGateway,
  required OrderCheckoutGateway checkoutGateway,
  required ChallengeConfigurationGateway challengeGateway,
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
    home: PaymentPreparationScreen(
      orderGateway: orderGateway,
      checkoutGateway: checkoutGateway,
      challengeGateway: challengeGateway,
      accessToken: 'access-token',
    ),
  );
}

void main() {
  testWidgets('shows buyer orders only and prepares after confirmation', (
    tester,
  ) async {
    final orders = FakeOrderGateway([
      testOrder(
        id: buyerOrderId,
        listingId: buyerListingId,
        title: 'Buyer phone',
        role: 'buyer',
      ),
      testOrder(
        id: sellerOrderId,
        listingId: sellerListingId,
        title: 'Seller laptop',
        role: 'seller',
      ),
    ]);
    final checkout = FakeCheckoutGateway();

    await tester.pumpWidget(
      testApp(
        orderGateway: orders,
        checkoutGateway: checkout,
        challengeGateway: FakeChallengeGateway(enabled: false),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Payment preparation'), findsOneWidget);
    expect(find.text('Buyer phone'), findsOneWidget);
    expect(find.text('Seller laptop'), findsNothing);
    expect(checkout.calls, 0);

    await tester.tap(find.text('Prepare payment'));
    await tester.pumpAndSettle();

    expect(find.text('Confirm payment preparation'), findsOneWidget);
    expect(
      find.text(
        'This checks the stored order only. No funds are sent and the order status does not change.',
      ),
      findsOneWidget,
    );
    expect(checkout.calls, 0);

    final dialog = find.byType(AlertDialog);
    await tester.tap(
      find.descendant(of: dialog, matching: find.text('Prepare payment')),
    );
    await tester.pumpAndSettle();

    expect(checkout.calls, 1);
    expect(find.text('Payment provider setup required'), findsOneWidget);
    expect(
      find.text(
        'Configure verified bank-transfer instructions before accepting funds.',
      ),
      findsOneWidget,
    );
  });

  testWidgets('blocks checkout when browser verification is required', (
    tester,
  ) async {
    final checkout = FakeCheckoutGateway();

    await tester.pumpWidget(
      testApp(
        orderGateway: FakeOrderGateway([
          testOrder(
            id: buyerOrderId,
            listingId: buyerListingId,
            title: 'Buyer phone',
            role: 'buyer',
          ),
        ]),
        checkoutGateway: checkout,
        challengeGateway: FakeChallengeGateway(enabled: true),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Security verification required'), findsOneWidget);
    expect(
      find.textContaining('will not bypass this check'),
      findsOneWidget,
    );
    expect(find.text('Prepare payment'), findsOneWidget);
    await tester.tap(find.text('Prepare payment'), warnIfMissed: false);
    await tester.pump();
    expect(find.text('Confirm payment preparation'), findsNothing);
    expect(checkout.calls, 0);
  });

  testWidgets('renders Arabic payment preparation labels', (tester) async {
    await tester.pumpWidget(
      testApp(
        orderGateway: FakeOrderGateway([
          testOrder(
            id: buyerOrderId,
            listingId: buyerListingId,
            title: 'هاتف تجريبي',
            role: 'buyer',
          ),
        ]),
        checkoutGateway: FakeCheckoutGateway(),
        challengeGateway: FakeChallengeGateway(enabled: false),
        locale: const Locale('ar'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('إعداد الدفع'), findsWidgets);
    expect(find.text('هاتف تجريبي'), findsOneWidget);
    expect(find.textContaining('تحويل بنكي'), findsOneWidget);
  });
}
