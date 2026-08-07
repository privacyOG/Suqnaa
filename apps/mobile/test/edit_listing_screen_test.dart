import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:suqnaa/src/api/challenge_config_api.dart';
import 'package:suqnaa/src/api/seller_listing_api.dart';
import 'package:suqnaa/src/features/sell/edit_listing_screen.dart';
import 'package:suqnaa/src/navigation/secure_web_handoff.dart';

const listingId = '123e4567-e89b-42d3-a456-426614174000';
const categoryId = '223e4567-e89b-42d3-a456-426614174000';

Map<String, dynamic> snapshot({int version = 5, String status = 'draft'}) => {
  'listing': {
    'id': listingId,
    'categoryId': categoryId,
    'title': 'Seller phone',
    'description': 'A complete seller listing description for editing.',
    'priceAmount': '100.00',
    'currencyCode': 'AUD',
    'condition': 'good',
    'availabilityStatus': 'in_stock',
    'availableQuantity': 2,
    'unitLabel': 'items',
    'status': status,
    'countryCode': 'AU',
    'region': 'NSW',
    'city': 'Sydney',
    'suburb': 'Greenacre',
    'allowPickup': true,
    'allowDelivery': false,
    'version': version,
  },
  'editable': const {'draft', 'active', 'expired'}.contains(status),
};

class FakeListingGateway implements SellerListingEditGateway {
  FakeListingGateway({this.status = 'draft'});

  String status;
  Map<String, dynamic>? lastInput;
  int updateCalls = 0;

  @override
  Future<Map<String, dynamic>> getForEdit(
    String accessToken, {
    required String listingId,
  }) async => snapshot(status: status);

  @override
  Future<Map<String, dynamic>> getCategories(String accessToken) async => {
    'categories': [
      {
        'id': categoryId,
        'name_en': 'Phones',
        'name_ar': 'هواتف',
        'sort_order': 1,
      }
    ]
  };

  @override
  Future<Map<String, dynamic>> updateDetails(
    String accessToken, {
    required String listingId,
    required Map<String, dynamic> input,
  }) async {
    updateCalls += 1;
    lastInput = Map<String, dynamic>.from(input);
    return {
      'listing': {
        ...snapshot(version: 6, status: status)['listing'] as Map<String, dynamic>,
        ...input,
        'id': listingId,
        'version': 6,
        'status': status,
      },
      'unchanged': false,
    };
  }
}

class FakeChallengeGateway implements ChallengeConfigurationGateway {
  FakeChallengeGateway(this.enabled);
  final bool enabled;

  @override
  Future<MobileChallengeConfiguration> fetch() async => MobileChallengeConfiguration(
    enabled: enabled,
    provider: enabled ? 'turnstile' : 'none',
    siteKey: enabled ? 'site-key' : null,
    paymentCheckoutAction: 'payment_checkout_prepare',
    listingEditAction: 'listing_edit',
  );
}

class FakeEditHandoff implements SecureListingEditWebHandoffGateway {
  int calls = 0;
  String? locale;
  String? openedListingId;

  @override
  Future<bool> openListingEdit({
    required String locale,
    required String listingId,
  }) async {
    calls += 1;
    this.locale = locale;
    openedListingId = listingId;
    return true;
  }
}

Widget app({
  required FakeListingGateway listingGateway,
  required bool challengeEnabled,
  required FakeEditHandoff handoff,
}) {
  return MaterialApp(
    locale: const Locale('en'),
    home: EditListingScreen(
      listingId: listingId,
      listingGateway: listingGateway,
      challengeGateway: FakeChallengeGateway(challengeEnabled),
      secureWebHandoffGateway: handoff,
      accessToken: 'access-token',
    ),
  );
}

void main() {
  testWidgets('native edit submits every field with the loaded version', (tester) async {
    final listingGateway = FakeListingGateway();
    final handoff = FakeEditHandoff();
    await tester.pumpWidget(app(
      listingGateway: listingGateway,
      challengeEnabled: false,
      handoff: handoff,
    ));
    await tester.pumpAndSettle();

    expect(find.textContaining('Version: 5'), findsOneWidget);
    expect(find.byKey(const Key('save-listing-edit')), findsOneWidget);

    await tester.tap(find.byKey(const Key('save-listing-edit')));
    await tester.pumpAndSettle();

    expect(listingGateway.updateCalls, 1);
    expect(listingGateway.lastInput?['version'], 5);
    expect(listingGateway.lastInput?['title'], 'Seller phone');
    expect(listingGateway.lastInput?['categoryId'], categoryId);
    expect(listingGateway.lastInput?['availabilityStatus'], 'in_stock');
    expect(listingGateway.lastInput?['allowPickup'], isTrue);
    expect(listingGateway.lastInput?['allowDelivery'], isFalse);
    expect(handoff.calls, 0);
    expect(find.textContaining('Version: 6'), findsOneWidget);
  });

  testWidgets('challenge-enabled edit uses secure web handoff instead of native mutation', (tester) async {
    final listingGateway = FakeListingGateway();
    final handoff = FakeEditHandoff();
    await tester.pumpWidget(app(
      listingGateway: listingGateway,
      challengeEnabled: true,
      handoff: handoff,
    ));
    await tester.pumpAndSettle();

    expect(find.text('Continue on secure web page'), findsOneWidget);
    await tester.tap(find.byKey(const Key('save-listing-edit')));
    await tester.pumpAndSettle();

    expect(listingGateway.updateCalls, 0);
    expect(handoff.calls, 1);
    expect(handoff.locale, 'en');
    expect(handoff.openedListingId, listingId);
  });

  testWidgets('reserved listing is read-only', (tester) async {
    final listingGateway = FakeListingGateway(status: 'reserved');
    final handoff = FakeEditHandoff();
    await tester.pumpWidget(app(
      listingGateway: listingGateway,
      challengeEnabled: false,
      handoff: handoff,
    ));
    await tester.pumpAndSettle();

    expect(find.textContaining('cannot be edited'), findsOneWidget);
    final button = tester.widget<FilledButton>(find.byKey(const Key('save-listing-edit')));
    expect(button.onPressed, isNull);
  });
}
