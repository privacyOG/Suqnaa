import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:suqnaa/src/api/account_verification_api.dart';
import 'package:suqnaa/src/api/authed_api.dart';

class FakeAuthedApi extends AuthedApi {
  FakeAuthedApi() : super(baseUrl: Uri.parse('https://example.test'));

  String? lastPath;
  Map<String, dynamic>? lastBody;

  @override
  Future<Map<String, dynamic>> get(String path, String accessToken) async {
    lastPath = path;
    return {
      'verification': {
        'status': 'pending',
        'channels': [
          {
            'channel': 'email',
            'available': true,
            'destination': 'pe****@example.test',
            'verifiedAt': null,
          },
          {
            'channel': 'phone',
            'available': true,
            'destination': '*******5678',
            'verifiedAt': '2026-08-07T09:00:00.000Z',
          },
        ],
      },
    };
  }

  @override
  Future<Map<String, dynamic>> post(
    String path,
    String accessToken,
    Map<String, dynamic> body,
  ) async {
    lastPath = path;
    lastBody = body;
    if (path.endsWith('/request')) {
      return {
        'expiresAt': '2026-08-07T09:10:00.000Z',
        'resendAfterSeconds': 60,
      };
    }
    return {
      'verified': true,
      'verifiedAt': '2026-08-07T09:01:00.000Z',
      'status': 'active',
    };
  }
}

void main() {
  test('parses contact verification state and submits protected actions', () async {
    final transport = FakeAuthedApi();
    final api = AccountVerificationApi(api: transport);

    final state = await api.load('token');
    expect(transport.lastPath, '/v1/account/verification');
    expect(state.status, 'pending');
    expect(state.channels.length, 2);
    expect(state.channels.first.channel, VerificationChannel.email);
    expect(state.channels.first.isVerified, isFalse);
    expect(state.channels.last.channel, VerificationChannel.phone);
    expect(state.channels.last.isVerified, isTrue);

    final requested = await api.requestCode('token', VerificationChannel.email);
    expect(transport.lastPath, '/v1/account/verification/request');
    expect(transport.lastBody, {'channel': 'email'});
    expect(requested.resendAfterSeconds, 60);

    final confirmed = await api.confirmCode(
      'token',
      VerificationChannel.email,
      '123456',
    );
    expect(transport.lastPath, '/v1/account/verification/confirm');
    expect(transport.lastBody, {'channel': 'email', 'code': '123456'});
    expect(confirmed.status, 'active');
  });

  test('mobile account exposes the verification screen and registration handoff', () {
    final accountSource = File(
      'lib/src/features/account/account_screen.dart',
    ).readAsStringSync();
    final registrationSource = File(
      'lib/src/features/account/register_screen.dart',
    ).readAsStringSync();
    final verificationSource = File(
      'lib/src/features/account/account_verification_screen.dart',
    ).readAsStringSync();

    expect(accountSource, contains('account-contact-verification-tile'));
    expect(accountSource, contains('AccountVerificationScreen'));
    expect(registrationSource, contains('pushReplacement'));
    expect(registrationSource, contains('AccountVerificationScreen'));
    expect(verificationSource, contains('AutofillHints.oneTimeCode'));
    expect(verificationSource, contains('إرسال رمز'));
  });
}
