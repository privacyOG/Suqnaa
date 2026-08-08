import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:suqnaa/l10n/app_localizations.dart';
import 'package:suqnaa/src/api/challenge_config_api.dart';
import 'package:suqnaa/src/api/seller_listing_api.dart';
import 'package:suqnaa/src/features/sell/listing_location_screen.dart';
import 'package:suqnaa/src/navigation/secure_web_handoff.dart';

const listingId = '123e4567-e89b-42d3-a456-426614174000';

class _LocationGateway implements SellerListingLocationGateway {
  int version = 4;
  int updates = 0;
  Map<String, double>? submittedLocation;

  @override
  Future<Map<String, dynamic>> getLocation(
    String accessToken, {
    required String listingId,
  }) async => {
        'listing': {
          'listingId': listingId,
          'status': 'active',
          'version': version,
          'approximateLocation': {
            'latitude': -33.87,
            'longitude': 151.21,
          },
          'editable': true,
        }
      };

  @override
  Future<Map<String, dynamic>> updateLocation(
    String accessToken, {
    required String listingId,
    required int version,
    required Map<String, double>? approximateLocation,
  }) async {
    updates += 1;
    submittedLocation = approximateLocation;
    this.version += 1;
    return {
      'listing': {
        'listingId': listingId,
        'status': 'active',
        'version': this.version,
        'approximateLocation': approximateLocation,
        'editable': true,
      },
      'unchanged': false,
    };
  }
}

class _ChallengeGateway implements ChallengeConfigurationGateway {
  _ChallengeGateway(this.enabled);
  final bool enabled;

  @override
  Future<MobileChallengeConfiguration> fetch() async => MobileChallengeConfiguration(
        enabled: enabled,
        provider: enabled ? 'turnstile' : 'none',
        siteKey: enabled ? 'site-key' : null,
        paymentCheckoutAction: 'payment_checkout',
        listingEditAction: 'listing_edit',
      );
}

class _Handoff implements SecureListingEditWebHandoffGateway {
  int opens = 0;

  @override
  Future<bool> openListingEdit({required String locale, required String listingId}) async {
    opens += 1;
    return true;
  }
}

Widget _app({
  required SellerListingLocationGateway location,
  required ChallengeConfigurationGateway challenge,
  required SecureListingEditWebHandoffGateway handoff,
}) {
  return MaterialApp(
    locale: const Locale('en'),
    localizationsDelegates: const [
      AppLocalizations.delegate,
      GlobalMaterialLocalizations.delegate,
      GlobalWidgetsLocalizations.delegate,
      GlobalCupertinoLocalizations.delegate,
    ],
    supportedLocales: AppLocalizations.supportedLocales,
    home: ListingLocationScreen(
      listingId: listingId,
      locationGateway: location,
      challengeGateway: challenge,
      secureWebHandoffGateway: handoff,
      accessToken: 'token',
    ),
  );
}

void main() {
  testWidgets('challenge-disabled listing location saves natively', (tester) async {
    final location = _LocationGateway();
    final handoff = _Handoff();
    await tester.pumpWidget(_app(
      location: location,
      challenge: _ChallengeGateway(false),
      handoff: handoff,
    ));
    await tester.pumpAndSettle();

    expect(find.text('Nearby search without publishing coordinates'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('listing-location-latitude')), '-33.881');
    await tester.enterText(find.byKey(const Key('listing-location-longitude')), '151.199');
    await tester.tap(find.byKey(const Key('save-listing-location')));
    await tester.pumpAndSettle();

    expect(location.updates, 1);
    expect(location.submittedLocation, {
      'latitude': -33.881,
      'longitude': 151.199,
    });
    expect(handoff.opens, 0);
  });

  testWidgets('challenge-enabled listing location uses secure web only', (tester) async {
    final location = _LocationGateway();
    final handoff = _Handoff();
    await tester.pumpWidget(_app(
      location: location,
      challenge: _ChallengeGateway(true),
      handoff: handoff,
    ));
    await tester.pumpAndSettle();

    expect(find.text('Security verification is enabled. Location changes continue only on the secure web editor.'), findsOneWidget);
    await tester.tap(find.byKey(const Key('save-listing-location')));
    await tester.pumpAndSettle();

    expect(location.updates, 0);
    expect(handoff.opens, 1);
  });
}
