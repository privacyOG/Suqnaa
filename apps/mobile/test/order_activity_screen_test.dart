import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:suqnaa/l10n/app_localizations.dart';
import 'package:suqnaa/src/api/order_activity_api.dart';
import 'package:suqnaa/src/features/orders/order_activity_screen.dart';

const orderId = '123e4567-e89b-42d3-a456-426614174000';
const listingId = '223e4567-e89b-42d3-a456-426614174000';
const buyerId = '323e4567-e89b-42d3-a456-426614174000';
const sellerId = '423e4567-e89b-42d3-a456-426614174000';
const offerId = '523e4567-e89b-42d3-a456-426614174000';

OrderActivity testOrder() {
  return OrderActivity.fromJson({
    'id': orderId,
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
    'role': 'buyer',
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
      'title': 'Test phone',
      'status': 'reserved',
      'priceAmount': '100.00',
      'currencyCode': 'AUD',
    },
    'counterpart': {
      'id': sellerId,
      'displayName': 'Test Seller',
      'status': 'active',
    },
    'offer': {
      'id': offerId,
      'status': 'accepted',
      'message': 'Can collect tomorrow.',
      'createdAt': '2026-07-19T01:00:00.000Z',
      'updatedAt': '2026-07-20T01:00:00.000Z',
    },
  });
}

class FakeOrderGateway implements OrderActivityGateway {
  FakeOrderGateway(this.order);

  final OrderActivity order;
  int pageCalls = 0;
  int detailCalls = 0;

  @override
  Future<OrderActivityPage> fetchPage(
    String accessToken, {
    OrderActivityStatus? status,
    int limit = 20,
    String? before,
  }) async {
    pageCalls += 1;
    return OrderActivityPage(
      orders: [order],
      hasMore: false,
      nextCursor: null,
    );
  }

  @override
  Future<OrderActivity> fetchDetail(
    String accessToken, {
    required String orderId,
  }) async {
    detailCalls += 1;
    return order;
  }
}

Widget testApp(Widget home) {
  return MaterialApp(
    locale: const Locale('en'),
    localizationsDelegates: const [
      AppLocalizations.delegate,
      GlobalMaterialLocalizations.delegate,
      GlobalCupertinoLocalizations.delegate,
      GlobalWidgetsLocalizations.delegate,
    ],
    supportedLocales: AppLocalizations.supportedLocales,
    home: home,
  );
}

void main() {
  testWidgets('renders order history and opens refreshed order details', (
    tester,
  ) async {
    final gateway = FakeOrderGateway(testOrder());
    await tester.pumpWidget(
      testApp(
        OrderActivityScreen(
          gateway: gateway,
          accessToken: 'access-token',
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Order history'), findsOneWidget);
    expect(find.text('Test phone'), findsOneWidget);
    expect(find.text('Payment pending'), findsOneWidget);
    expect(find.text('Test Seller'), findsOneWidget);
    expect(find.text('View order details'), findsOneWidget);
    expect(gateway.pageCalls, 1);

    await tester.tap(find.text('View order details'));
    await tester.pumpAndSettle();

    expect(find.text('Order details'), findsOneWidget);
    expect(find.text('Order ID'), findsOneWidget);
    expect(find.text(orderId), findsOneWidget);
    expect(find.text('Bank transfer'), findsOneWidget);
    expect(find.text('Order progress'), findsOneWidget);

    await tester.scrollUntilVisible(
      find.text('Offer message'),
      300,
      scrollable: find.byType(Scrollable).last,
    );
    await tester.pumpAndSettle();

    expect(find.text('Offer message'), findsOneWidget);
    expect(find.text('Can collect tomorrow.'), findsOneWidget);
    expect(gateway.detailCalls, 1);
  });

  testWidgets('renders localized Arabic order labels', (tester) async {
    final gateway = FakeOrderGateway(testOrder());
    await tester.pumpWidget(
      MaterialApp(
        locale: const Locale('ar'),
        localizationsDelegates: const [
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
        ],
        supportedLocales: AppLocalizations.supportedLocales,
        home: OrderActivityScreen(
          gateway: gateway,
          accessToken: 'access-token',
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('سجل الطلبات'), findsOneWidget);
    expect(find.text('بانتظار الدفع'), findsOneWidget);
    expect(find.text('المشتري'), findsOneWidget);
    expect(find.text('عرض تفاصيل الطلب'), findsOneWidget);
  });
}
