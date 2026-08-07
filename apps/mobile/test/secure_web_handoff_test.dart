import 'package:flutter_test/flutter_test.dart';
import 'package:suqnaa/src/navigation/secure_web_handoff.dart';

const resourceId = '123e4567-e89b-42d3-a456-426614174000';

void main() {
  test('builds localized order history URLs without credentials', () {
    expect(
      buildSecureOrdersUri(Uri.parse('https://suqnaa.example/app/'), 'AR').toString(),
      'https://suqnaa.example/app/ar/activity/orders',
    );
  });

  test('builds an order detail URL from a validated identifier', () {
    expect(
      buildSecureOrderUri(
        Uri.parse('https://suqnaa.example'),
        'en',
        '  $resourceId  ',
      ).toString(),
      'https://suqnaa.example/en/activity/orders/$resourceId',
    );
  });

  test('builds exact listing edit URL without credentials or edit state', () {
    final uri = buildSecureListingEditUri(
      Uri.parse('https://suqnaa.example/app/'),
      'AR',
      '  $resourceId  ',
    );
    expect(
      uri.toString(),
      'https://suqnaa.example/app/ar/sell/manage/$resourceId/edit',
    );
    expect(uri.hasQuery, isFalse);
    expect(uri.hasFragment, isFalse);
    expect(uri.userInfo, isEmpty);
  });

  test('builds password recovery URL without account secrets', () {
    expect(
      buildSecurePasswordRecoveryUri(Uri.parse('https://suqnaa.example'), 'ar').toString(),
      'https://suqnaa.example/ar/account/forgot-password',
    );
  });

  test('builds account profile URL without account data or credentials', () {
    final uri = buildSecureAccountProfileUri(
      Uri.parse('https://suqnaa.example/app/'),
      'AR',
    );
    expect(uri.toString(), 'https://suqnaa.example/app/ar/account/profile');
    expect(uri.hasQuery, isFalse);
    expect(uri.hasFragment, isFalse);
    expect(uri.userInfo, isEmpty);
  });

  test('builds seller verification URL without account or provider data', () {
    final uri = buildSecureSellerVerificationUri(
      Uri.parse('https://suqnaa.example/app/'),
      'en',
    );
    expect(uri.toString(), 'https://suqnaa.example/app/en/account/seller-verification');
    expect(uri.hasQuery, isFalse);
    expect(uri.hasFragment, isFalse);
    expect(uri.userInfo, isEmpty);
  });

  test('uses the injected external launcher for listing edits', () async {
    Uri? launched;
    final gateway = BrowserSecureWebHandoff(
      webBaseUrl: Uri.parse('https://suqnaa.example'),
      launcher: (uri) async {
        launched = uri;
        return true;
      },
    );

    final opened = await gateway.openListingEdit(
      locale: 'en',
      listingId: resourceId,
    );

    expect(opened, isTrue);
    expect(
      launched.toString(),
      'https://suqnaa.example/en/sell/manage/$resourceId/edit',
    );
  });

  test('allows explicit emulator HTTP development origin', () {
    expect(
      buildSecureOrdersUri(Uri.parse('http://10.0.2.2:3000'), 'en').toString(),
      'http://10.0.2.2:3000/en/activity/orders',
    );
  });

  test('rejects public HTTP, credentials and hidden URL state', () {
    expect(
      () => buildSecureOrdersUri(Uri.parse('http://suqnaa.example'), 'en'),
      throwsArgumentError,
    );
    expect(
      () => buildSecureOrdersUri(Uri.parse('https://user:secret@suqnaa.example'), 'en'),
      throwsArgumentError,
    );
    expect(
      () => buildSecureOrdersUri(Uri.parse('https://suqnaa.example?token=secret'), 'en'),
      throwsArgumentError,
    );
    expect(
      () => buildSecureOrdersUri(Uri.parse('https://suqnaa.example#secret'), 'en'),
      throwsArgumentError,
    );
  });

  test('rejects unsupported locales and malformed resource identifiers', () {
    expect(
      () => buildSecureOrdersUri(Uri.parse('https://suqnaa.example'), '../en'),
      throwsArgumentError,
    );
    expect(
      () => buildSecureOrderUri(Uri.parse('https://suqnaa.example'), 'en', 'not-an-order'),
      throwsArgumentError,
    );
    expect(
      () => buildSecureListingEditUri(
        Uri.parse('https://suqnaa.example'),
        'en',
        'not-a-listing',
      ),
      throwsArgumentError,
    );
  });
}
