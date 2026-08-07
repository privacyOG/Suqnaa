import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:suqnaa/src/api/authed_api.dart';
import 'package:suqnaa/src/api/password_security_api.dart';

class FakeAuthedApi extends AuthedApi {
  FakeAuthedApi() : super(baseUrl: Uri.parse('https://example.test'));

  String? lastPath;
  Map<String, dynamic>? lastBody;

  @override
  Future<Map<String, dynamic>> get(String path, String accessToken) async {
    lastPath = path;
    return {
      'sessions': [
        {
          'id': '123e4567-e89b-42d3-a456-426614174000',
          'userAgent': 'Test device',
          'ipAddress': '127.0.0.1',
          'createdAt': '2026-08-07T09:00:00.000Z',
          'expiresAt': '2026-09-06T09:00:00.000Z',
        },
      ],
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
    if (path.endsWith('/password')) {
      return {'changed': true, 'revokedSessions': 2};
    }
    if (path.endsWith('/revoke-all')) {
      return {'revokedSessions': 3};
    }
    return const {};
  }
}

void main() {
  test('submits email and phone recovery without exposing account state', () async {
    final requests = <http.Request>[];
    final client = MockClient((request) async {
      requests.add(request);
      if (request.url.path.endsWith('/forgot')) {
        return http.Response(jsonEncode({'accepted': true}), 202);
      }
      return http.Response(jsonEncode({'reset': true, 'revokedSessions': 1}), 200);
    });
    final api = PasswordSecurityApi(
      baseUrl: Uri.parse('https://example.test'),
      client: client,
    );

    await api.requestPasswordReset(' Person@Example.com ');
    await api.requestPhonePasswordReset(' +61 412 345 678 ');
    await api.resetPassword(
      'abcdefghijklmnopqrstuvwxyzABCDEFGH123456789',
      'Replacement-password-456',
    );

    expect(requests[0].url.path, '/v1/auth/password/forgot');
    expect(jsonDecode(requests[0].body), {'email': 'person@example.com'});
    expect(requests[1].url.path, '/v1/auth/password/forgot');
    expect(jsonDecode(requests[1].body), {'phone': '+61 412 345 678'});
    expect(requests[2].url.path, '/v1/auth/password/reset');
    expect(
      jsonDecode(requests[2].body),
      containsPair('newPassword', 'Replacement-password-456'),
    );
  });

  test('parses and submits authenticated session security actions', () async {
    final transport = FakeAuthedApi();
    final api = PasswordSecurityApi(
      baseUrl: Uri.parse('https://example.test'),
      authedApi: transport,
    );

    final sessions = await api.listSessions('access');
    expect(transport.lastPath, '/v1/account/security/sessions');
    expect(sessions.single.userAgent, 'Test device');
    expect(sessions.single.ipAddress, '127.0.0.1');

    expect(
      await api.changePassword('access', 'old-password', 'new-password-123'),
      2,
    );
    expect(transport.lastPath, '/v1/account/security/password');
    expect(transport.lastBody, {
      'currentPassword': 'old-password',
      'newPassword': 'new-password-123',
    });

    await api.revokeSession(
      'access',
      '123e4567-e89b-42d3-a456-426614174000',
    );
    expect(
      transport.lastPath,
      '/v1/account/security/sessions/123e4567-e89b-42d3-a456-426614174000/revoke',
    );

    expect(await api.revokeAllSessions('access'), 3);
    expect(transport.lastPath, '/v1/account/security/sessions/revoke-all');
  });

  test('mobile account surfaces expose phone authentication and recovery', () {
    final accountSource = File(
      'lib/src/features/account/account_screen.dart',
    ).readAsStringSync();
    final loginSource = File(
      'lib/src/features/account/account_login_screen.dart',
    ).readAsStringSync();
    final registerSource = File(
      'lib/src/features/account/register_screen.dart',
    ).readAsStringSync();
    final recoverySource = File(
      'lib/src/features/account/password_recovery_screen.dart',
    ).readAsStringSync();
    final securitySource = File(
      'lib/src/features/account/account_security_screen.dart',
    ).readAsStringSync();

    expect(accountSource, contains('password-recovery-account-tile'));
    expect(accountSource, contains('account-security-tile'));
    expect(loginSource, contains("'phone': contact"));
    expect(loginSource, contains('International phone number'));
    expect(registerSource, contains("'phone': contact"));
    expect(registerSource, contains('AccountVerificationScreen'));
    expect(recoverySource, contains('requestPhonePasswordReset'));
    expect(recoverySource, contains('AutofillHints.oneTimeCode'));
    expect(recoverySource, contains('openPasswordRecovery'));
    expect(recoverySource, contains('لن نؤكد'));
    expect(securitySource, contains('revokeAllSessions'));
    expect(securitySource, contains('session.clear()'));
  });
}
