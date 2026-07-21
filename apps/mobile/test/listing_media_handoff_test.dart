import 'package:flutter_test/flutter_test.dart';
import 'package:suqnaa/src/navigation/secure_web_handoff.dart';

class FakeCombinedHandoff
    implements SecureWebHandoffGateway, SecureListingMediaWebHandoffGateway {
  int mediaCalls = 0;
  String? locale;

  @override
  Future<bool> openListingMediaManager({required String locale}) async {
    mediaCalls += 1;
    this.locale = locale;
    return true;
  }

  @override
  Future<bool> openOrder({
    required String locale,
    required String orderId,
  }) async {
    throw UnimplementedError();
  }

  @override
  Future<bool> openOrders({required String locale}) async {
    throw UnimplementedError();
  }
}

class FakeOrderOnlyHandoff implements SecureWebHandoffGateway {
  @override
  Future<bool> openOrder({
    required String locale,
    required String orderId,
  }) async {
    throw UnimplementedError();
  }

  @override
  Future<bool> openOrders({required String locale}) async {
    throw UnimplementedError();
  }
}

void main() {
  test('builds the exact localized listing media manager URL', () {
    expect(
      buildSecureListingMediaManagerUri(
        Uri.parse('https://suqnaa.test/base'),
        'en',
      ).toString(),
      'https://suqnaa.test/base/en/sell/media',
    );
    expect(
      buildSecureListingMediaManagerUri(
        Uri.parse('https://suqnaa.test'),
        'AR',
      ).toString(),
      'https://suqnaa.test/ar/sell/media',
    );
  });

  test('dispatches through the dedicated listing media handoff interface', () async {
    final implementation = FakeCombinedHandoff();
    final SecureWebHandoffGateway gateway = implementation;

    final opened = await gateway.openListingMediaManager(locale: 'ar');

    expect(opened, isTrue);
    expect(implementation.mediaCalls, 1);
    expect(implementation.locale, 'ar');
  });

  test('fails closed when an order-only handoff lacks media capability', () async {
    final SecureWebHandoffGateway gateway = FakeOrderOnlyHandoff();

    final opened = await gateway.openListingMediaManager(locale: 'en');

    expect(opened, isFalse);
  });

  test('listing media handoff never retains query, fragment, or credentials', () {
    expect(
      () => buildSecureListingMediaManagerUri(
        Uri.parse('https://user:pass@suqnaa.test'),
        'en',
      ),
      throwsArgumentError,
    );
    expect(
      () => buildSecureListingMediaManagerUri(
        Uri.parse('https://suqnaa.test?token=secret'),
        'en',
      ),
      throwsArgumentError,
    );
    expect(
      () => buildSecureListingMediaManagerUri(
        Uri.parse('https://suqnaa.test#secret'),
        'en',
      ),
      throwsArgumentError,
    );
  });

  test('rejects unsupported locale and non-local insecure origins', () {
    expect(
      () => buildSecureListingMediaManagerUri(
        Uri.parse('https://suqnaa.test'),
        'fr',
      ),
      throwsArgumentError,
    );
    expect(
      () => buildSecureListingMediaManagerUri(
        Uri.parse('http://suqnaa.test'),
        'en',
      ),
      throwsArgumentError,
    );
    expect(
      buildSecureListingMediaManagerUri(
        Uri.parse('http://10.0.2.2:3000'),
        'en',
      ).toString(),
      'http://10.0.2.2:3000/en/sell/media',
    );
  });
}
