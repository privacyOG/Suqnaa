import 'package:flutter_test/flutter_test.dart';
import 'package:suqnaa/src/navigation/secure_web_handoff.dart';

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
