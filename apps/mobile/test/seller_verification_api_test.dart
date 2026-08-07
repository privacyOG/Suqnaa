import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:suqnaa/src/api/authed_api.dart';
import 'package:suqnaa/src/api/seller_verification_api.dart';

class FakeAuthedApi extends AuthedApi {
  FakeAuthedApi() : super(baseUrl: Uri.parse('https://api.example.test'));

  String? method;
  String? path;
  Map<String, dynamic>? body;

  @override
  Future<Map<String, dynamic>> get(String path, String accessToken) async {
    method = 'GET';
    this.path = path;
    return {
      'verification': {
        'providerEnabled': true,
        'eligibleLevel': 'business',
        'profile': {
          'isBusiness': true,
          'businessName': 'Example Trading',
          'countryCode': 'AU',
        },
        'current': {
          'id': '123e4567-e89b-42d3-a456-426614174000',
          'level': 'business',
          'status': 'pending',
          'providerResult': 'passed',
          'countryCode': 'AU',
          'reasonCode': null,
          'submittedAt': '2026-08-08T00:00:00.000Z',
          'verifiedAt': null,
          'expiresAt': null,
          'sessionExpiresAt': null,
        },
      },
    };
  }

  @override
  Future<Map<String, dynamic>> post(
    String path,
    String accessToken,
    Map<String, dynamic> body,
  ) async {
    method = 'POST';
    this.path = path;
    this.body = body;
    return {
      'session': {
        'checkId': '223e4567-e89b-42d3-a456-426614174000',
        'action': 'create',
        'hostedUrl': 'https://verify.example.test/session/abc',
        'sessionExpiresAt': '2026-08-08T00:30:00.000Z',
      },
    };
  }
}

void main() {
  test('loads status and starts verification through protected paths', () async {
    final transport = FakeAuthedApi();
    final api = SellerVerificationApi(authedApi: transport);

    final status = await api.fetchStatus('access');
    expect(transport.method, 'GET');
    expect(transport.path, sellerVerificationPath);
    expect(status.providerEnabled, isTrue);
    expect(status.eligibleLevel, 'business');
    expect(status.businessName, 'Example Trading');
    expect(status.current?.providerResult, 'passed');

    final session = await api.start(
      'access',
      level: 'business',
      countryCode: 'AU',
    );
    expect(transport.method, 'POST');
    expect(transport.path, sellerVerificationStartPath);
    expect(transport.body, {'level': 'business', 'countryCode': 'AU'});
    expect(session.hostedUrl.toString(), 'https://verify.example.test/session/abc');
  });

  test('rejects a non-HTTPS hosted verification URL', () {
    expect(
      () => MobileSellerVerificationSession.fromJson({
        'checkId': '223e4567-e89b-42d3-a456-426614174000',
        'action': 'create',
        'hostedUrl': 'http://verify.example.test/session/abc',
        'sessionExpiresAt': '2026-08-08T00:30:00.000Z',
      }),
      throwsFormatException,
    );
  });

  test('mobile account exposes seller verification and bounded handoff', () {
    final account = File('lib/src/features/account/account_screen.dart').readAsStringSync();
    final screen = File('lib/src/features/account/seller_verification_screen.dart').readAsStringSync();
    final handoff = File('lib/src/navigation/secure_web_handoff.dart').readAsStringSync();

    expect(account, contains('seller-verification-account-tile'));
    expect(account, contains('SellerVerificationScreen'));
    expect(screen, contains('openSellerVerification'));
    expect(screen, contains("uri.scheme != 'https'"));
    expect(screen, contains('final approval requires operations review'));
    expect(handoff, contains("'seller-verification'"));
  });
}
