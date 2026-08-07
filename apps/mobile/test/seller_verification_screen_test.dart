import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:suqnaa/src/api/challenge_config_api.dart';
import 'package:suqnaa/src/api/seller_verification_api.dart';
import 'package:suqnaa/src/features/account/seller_verification_screen.dart';
import 'package:suqnaa/src/navigation/secure_web_handoff.dart';

class FakeSellerVerificationGateway implements SellerVerificationGateway {
  FakeSellerVerificationGateway(this.status);

  final MobileSellerVerificationStatus status;
  int starts = 0;
  String? lastLevel;
  String? lastCountry;

  @override
  Future<MobileSellerVerificationStatus> fetchStatus(String accessToken) async {
    return status;
  }

  @override
  Future<MobileSellerVerificationSession> start(
    String accessToken, {
    required String level,
    required String countryCode,
  }) async {
    starts += 1;
    lastLevel = level;
    lastCountry = countryCode;
    return MobileSellerVerificationSession(
      checkId: '123e4567-e89b-42d3-a456-426614174000',
      action: 'create',
      hostedUrl: Uri.parse('https://verify.example.test/session/abc'),
      sessionExpiresAt: DateTime.utc(2026, 8, 8, 1),
    );
  }
}

class FakeChallengeGateway implements ChallengeConfigurationGateway {
  FakeChallengeGateway(this.configuration);
  final MobileChallengeConfiguration configuration;

  @override
  Future<MobileChallengeConfiguration> fetch() async => configuration;
}

class FakeHandoff
    implements SecureWebHandoffGateway, SecureSellerVerificationWebHandoffGateway {
  int sellerOpens = 0;

  @override
  Future<bool> openSellerVerification({required String locale}) async {
    sellerOpens += 1;
    return true;
  }

  @override
  Future<bool> openOrder({required String locale, required String orderId}) async => true;

  @override
  Future<bool> openOrders({required String locale}) async => true;
}

MobileSellerVerificationStatus status() => const MobileSellerVerificationStatus(
      providerEnabled: true,
      eligibleLevel: 'seller',
      isBusiness: false,
      businessName: null,
      profileCountryCode: 'AU',
      current: null,
    );

Widget app({
  required FakeSellerVerificationGateway verification,
  required MobileChallengeConfiguration challenge,
  required FakeHandoff handoff,
  HostedVerificationLauncher? launcher,
}) {
  return MaterialApp(
    home: SellerVerificationScreen(
      verificationGateway: verification,
      challengeGateway: FakeChallengeGateway(challenge),
      secureWebHandoffGateway: handoff,
      hostedLauncher: launcher,
      accessToken: 'access-token',
    ),
  );
}

void main() {
  testWidgets('challenge-enabled verification uses exact secure web handoff', (tester) async {
    final verification = FakeSellerVerificationGateway(status());
    final handoff = FakeHandoff();
    await tester.pumpWidget(app(
      verification: verification,
      challenge: const MobileChallengeConfiguration(
        enabled: true,
        provider: 'turnstile',
        siteKey: 'site-key',
        paymentCheckoutAction: 'payment_checkout_prepare',
      ),
      handoff: handoff,
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('seller-verification-start-button')));
    await tester.pumpAndSettle();

    expect(handoff.sellerOpens, 1);
    expect(verification.starts, 0);
  });

  testWidgets('challenge-disabled verification opens server hosted HTTPS session', (tester) async {
    final verification = FakeSellerVerificationGateway(status());
    final handoff = FakeHandoff();
    Uri? launched;
    await tester.pumpWidget(app(
      verification: verification,
      challenge: const MobileChallengeConfiguration(
        enabled: false,
        provider: 'none',
        siteKey: null,
        paymentCheckoutAction: 'payment_checkout_prepare',
      ),
      handoff: handoff,
      launcher: (uri) async {
        launched = uri;
        return true;
      },
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('seller-verification-start-button')));
    await tester.pumpAndSettle();

    expect(verification.starts, 1);
    expect(verification.lastLevel, 'seller');
    expect(verification.lastCountry, 'AU');
    expect(launched.toString(), 'https://verify.example.test/session/abc');
    expect(handoff.sellerOpens, 0);
  });
}
