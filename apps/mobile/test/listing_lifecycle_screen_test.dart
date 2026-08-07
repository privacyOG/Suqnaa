import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:suqnaa/src/api/seller_listing_api.dart';
import 'package:suqnaa/src/features/sell/listing_lifecycle_screen.dart';

const listingId = '123e4567-e89b-42d3-a456-426614174000';

class FakeLifecycleGateway implements SellerListingLifecycleGateway {
  FakeLifecycleGateway({
    this.status = 'active',
    this.availabilityStatus = 'limited',
    this.availableQuantity = 2,
    this.renewable = true,
  });

  String status;
  String availabilityStatus;
  int? availableQuantity;
  bool renewable;
  int version = 7;
  int renewCalls = 0;
  int? submittedVersion;

  Map<String, dynamic> snapshot() => {
    'listing': {
      'id': listingId,
      'title': 'Lifecycle listing',
      'status': status,
      'availabilityStatus': availabilityStatus,
      'availableQuantity': availableQuantity,
      'expiresAt': '2026-09-07T00:00:00.000Z',
      'lastRenewedAt': null,
      'version': version,
      'updatedAt': '2026-08-08T00:00:00.000Z',
    },
    'renewable': renewable,
    'renewalAvailableAt': '2026-08-31T00:00:00.000Z',
    'activeDays': 30,
  };

  @override
  Future<Map<String, dynamic>> getLifecycle(
    String accessToken, {
    required String listingId,
  }) async => snapshot();

  @override
  Future<Map<String, dynamic>> renewLifecycle(
    String accessToken, {
    required String listingId,
    required int version,
  }) async {
    final wasExpired = status == 'expired';
    renewCalls += 1;
    submittedVersion = version;
    this.version += 1;
    if (wasExpired) status = 'active';
    renewable = false;
    return {
      'listing': snapshot()['listing'],
      'reactivated': wasExpired,
    };
  }
}

Widget app(FakeLifecycleGateway gateway) => MaterialApp(
  locale: const Locale('en'),
  home: ListingLifecycleScreen(
    listingId: listingId,
    lifecycleGateway: gateway,
    accessToken: 'access-token',
  ),
);

void main() {
  testWidgets('renews using the loaded version and reloads lifecycle state', (tester) async {
    final gateway = FakeLifecycleGateway();
    await tester.pumpWidget(app(gateway));
    await tester.pumpAndSettle();

    expect(find.text('Lifecycle listing'), findsOneWidget);
    expect(find.text('State version'), findsOneWidget);
    expect(find.text('7'), findsOneWidget);
    final renew = find.byKey(const Key('renew-listing-lifecycle'));
    expect(renew, findsOneWidget);

    await tester.tap(renew);
    await tester.pumpAndSettle();

    expect(gateway.renewCalls, 1);
    expect(gateway.submittedVersion, 7);
    expect(find.text('8'), findsOneWidget);
  });

  testWidgets('out-of-stock expired listing cannot reactivate', (tester) async {
    final gateway = FakeLifecycleGateway(
      status: 'expired',
      availabilityStatus: 'out_of_stock',
      availableQuantity: 0,
      renewable: false,
    );
    await tester.pumpWidget(app(gateway));
    await tester.pumpAndSettle();

    expect(find.textContaining('Add available inventory'), findsOneWidget);
    final button = tester.widget<FilledButton>(
      find.byKey(const Key('renew-listing-lifecycle')),
    );
    expect(button.onPressed, isNull);
  });

  test('my listings exposes lifecycle navigation', () {
    final source = File(
      'lib/src/features/sell/my_listings_screen.dart',
    ).readAsStringSync();
    expect(source, contains("import 'listing_lifecycle_screen.dart';"));
    expect(source, contains('ListingLifecycleScreen(listingId: listingId)'));
    expect(source, contains("Key('lifecycle-listing-\${data['id']}')"));
  });
}
