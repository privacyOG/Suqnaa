import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:integration_test/integration_test.dart';
import 'package:suqnaa/l10n/app_localizations.dart';
import 'package:suqnaa/src/api/auth_api.dart';
import 'package:suqnaa/src/api/catalog_api.dart';
import 'package:suqnaa/src/api/trading_api.dart';
import 'package:suqnaa/src/features/account/account_login_screen.dart';
import 'package:suqnaa/src/features/account/account_screen.dart';
import 'package:suqnaa/src/features/conversations/session_conversation_inbox.dart';
import 'package:suqnaa/src/features/home/home_screen.dart';
import 'package:suqnaa/src/features/orders/order_activity_screen.dart';
import 'package:suqnaa/src/features/orders/order_fulfilment_screen.dart';
import 'package:suqnaa/src/features/orders/payment_preparation_screen.dart';
import 'package:suqnaa/src/features/sell/listing_media_manager_screen.dart';
import 'package:suqnaa/src/features/sell/my_listings_screen.dart';
import 'package:suqnaa/src/session/access_state.dart';
import 'package:suqnaa/src/session/app_session.dart';
import 'package:suqnaa/src/session/session_scope.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('authentication establishes the native app session', (tester) async {
    final session = AppSession();
    await tester.pumpWidget(_harness(
      session: session,
      child: AccountLoginScreen(authApi: _FixtureAuthApi()),
    ));

    await tester.enterText(find.byType(TextFormField).at(0), 'buyer@example.test');
    await tester.enterText(find.byType(TextFormField).at(1), 'integration-password');
    await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await tester.pumpAndSettle();

    expect(session.isSignedIn, isTrue);
    expect(session.userId, '11111111-1111-4111-8111-111111111111');
    expect(session.displayName, 'Integration Buyer');
    session.dispose();
  });

  testWidgets('catalogue renders through the mobile catalogue gateway', (tester) async {
    final session = AppSession(initial: const AccessState(value: 'integration-access'));
    await tester.pumpWidget(_harness(
      session: session,
      child: HomeScreen(catalogApi: _EmptyCatalogGateway()),
    ));
    await tester.pumpAndSettle();

    expect(find.byType(HomeScreen), findsOneWidget);
    expect(find.byType(TextField), findsWidgets);
    session.dispose();
  });

  testWidgets('offers use the authenticated mobile trading transport', (tester) async {
    final client = MockClient((request) async {
      expect(request.method, 'POST');
      expect(request.url.path, '/v1/market/offers');
      expect(request.headers['authorization'], 'Bearer integration-access-token');
      expect(request.headers['content-type'], contains('application/json'));
      expect(jsonDecode(request.body), {
        'listingId': '33333333-3333-4333-8333-333333333333',
        'amountMinor': 12500,
        'currency': 'AUD',
      });
      return http.Response(
        jsonEncode({
          'offer': {'id': '44444444-4444-4444-8444-444444444444', 'status': 'pending'}
        }),
        201,
        headers: {'content-type': 'application/json'},
      );
    });
    final api = TradingApi(baseUrl: Uri.parse('https://integration.invalid'), client: client);

    final result = await api.submitOffer('integration-access-token', {
      'listingId': '33333333-3333-4333-8333-333333333333',
      'amountMinor': 12500,
      'currency': 'AUD',
    });

    expect((result['offer'] as Map<String, dynamic>)['status'], 'pending');
  });

  testWidgets('signed-in marketplace surfaces open on a native device', (tester) async {
    final session = AppSession(initial: const AccessState(value: 'integration-access'));
    await tester.pumpWidget(_harness(session: session, child: const AccountScreen()));
    await tester.pump();

    await _openSurface<SessionConversationInbox>(tester, Icons.forum_outlined);
    await _openSurface<OrderActivityScreen>(tester, Icons.receipt_long_outlined);
    await _openSurface<OrderFulfilmentScreen>(tester, Icons.local_shipping_outlined);
    await _openSurface<PaymentPreparationScreen>(tester, Icons.payments_outlined);
    await _openSurface<MyListingsScreen>(tester, Icons.storefront_outlined);
    await _openSurface<ListingMediaManagerScreen>(tester, Icons.photo_library_outlined);

    session.dispose();
  });
}

Widget _harness({required AppSession session, required Widget child}) {
  return SessionScope(
    session: session,
    child: MaterialApp(
      debugShowCheckedModeBanner: false,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ],
      supportedLocales: AppLocalizations.supportedLocales,
      home: child,
    ),
  );
}

Future<void> _openSurface<T extends Widget>(WidgetTester tester, IconData icon) async {
  final iconFinder = find.byIcon(icon);
  await tester.scrollUntilVisible(
    iconFinder,
    240,
    scrollable: find.byType(Scrollable).first,
  );
  final tile = find.ancestor(of: iconFinder, matching: find.byType(ListTile));
  expect(tile, findsOneWidget);
  await tester.tap(tile);
  await tester.pump(const Duration(milliseconds: 250));
  expect(find.byType(T), findsOneWidget);
  Navigator.of(tester.element(find.byType(T))).pop();
  await tester.pump(const Duration(milliseconds: 250));
}

class _FixtureAuthApi extends AuthApi {
  _FixtureAuthApi() : super(baseUrl: Uri.parse('https://integration.invalid'));

  @override
  Future<AuthResult> login(Map<String, dynamic> input) async {
    expect(input['email'], 'buyer@example.test');
    expect(input['password'], 'integration-password');
    return const AuthResult(
      user: AccountUser(
        id: '11111111-1111-4111-8111-111111111111',
        email: 'buyer@example.test',
        displayName: 'Integration Buyer',
        status: 'active',
      ),
      accessToken: 'integration-access-token',
      session: AuthSession(
        sessionId: '22222222-2222-4222-8222-222222222222',
        refreshToken: 'integration-refresh-token',
        expiresAt: '2030-01-01T00:00:00.000Z',
      ),
    );
  }
}

class _EmptyCatalogGateway implements CatalogGateway {
  @override
  Future<List<CatalogCategoryDto>> fetchCategories() async => const [];

  @override
  Future<CatalogPageDto> search(CatalogSearchOptions options) async => const CatalogPageDto(
        listings: [],
        hasMore: false,
        nextCursor: null,
      );

  @override
  Future<CatalogListingDto> fetchListing(String listingId) {
    throw UnsupportedError('Listing detail is not used by this integration fixture.');
  }
}
