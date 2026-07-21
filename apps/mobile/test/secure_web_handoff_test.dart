import 'package:flutter_test/flutter_test.dart';
import 'package:suqnaa/src/navigation/secure_web_handoff.dart';

const orderId = '123e4567-e89b-42d3-a456-426614174000';

void main() {
  test('builds localized order history URLs without credentials', () {
    expect(
      buildSecureOrdersUri(
        Uri.parse('https://suqnaa.example/app/'),
        'AR',
      ).toString(),
      'https://suqnaa.example/app/ar/activity/orders',
    );
  });

  test('builds an order detail URL from a validated identifier', () {
    expect(
      buildSecureOrderUri(
        Uri.parse('https://suqnaa.example'),
        'en',
        '  $orderId  ',
      ).toString(),
      'https://suqnaa.example/en/activity/orders/$orderId',
    );
  });

  test('uses the injected external launcher', () async {
    Uri? launched;
    final gateway = BrowserSecureWebHandoff(
      webBaseUrl: Uri.parse('https://suqnaa.example'),
      launcher: (uri) async {
        launched = uri;
        return true;
      },
    );

    final opened = await gateway.openOrders(locale: 'en');

    expect(opened, isTrue);
    expect(
      launched.toString(),
      'https://suqnaa.example/en/activity/orders',
    );
  });

  test('allows explicit emulator HTTP development origin', () {
    expect(
      buildSecureOrdersUri(
        Uri.parse('http://10.0.2.2:3000'),
        'en',
      ).toString(),
      'http://10.0.2.2:3000/en/activity/orders',
    );
  });

  test('rejects public HTTP, credentials and hidden URL state', () {
    expect(
      () => buildSecureOrdersUri(
        Uri.parse('http://suqnaa.example'),
        'en',
      ),
      throwsArgumentError,
    );
    expect(
      () => buildSecureOrdersUri(
        Uri.parse('https://user:secret@suqnaa.example'),
        'en',
      ),
      throwsArgumentError,
    );
    expect(
      () => buildSecureOrdersUri(
        Uri.parse('https://suqnaa.example?token=secret'),
        'en',
      ),
      throwsArgumentError,
    );
    expect(
      () => buildSecureOrdersUri(
        Uri.parse('https://suqnaa.example#secret'),
        'en',
      ),
      throwsArgumentError,
    );
  });

  test('rejects unsupported locales and malformed order identifiers', () {
    expect(
      () => buildSecureOrdersUri(
        Uri.parse('https://suqnaa.example'),
        '../en',
      ),
      throwsArgumentError,
    );
    expect(
      () => buildSecureOrderUri(
        Uri.parse('https://suqnaa.example'),
        'en',
        'not-an-order',
      ),
      throwsArgumentError,
    );
  });
}
