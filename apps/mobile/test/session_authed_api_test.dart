import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:suqnaa/src/api/auth_api.dart';
import 'package:suqnaa/src/api/session_api.dart';
import 'package:suqnaa/src/api/session_authed_api.dart';
import 'package:suqnaa/src/session/access_state.dart';
import 'package:suqnaa/src/session/app_session.dart';
import 'package:suqnaa/src/session/session_vault.dart';

String tokenWithExpiry(int expiryEpochSeconds, String marker) {
  final header = base64Url.encode(utf8.encode(jsonEncode({
    'alg': 'HS256',
    'typ': 'JWT',
  }))).replaceAll('=', '');
  final payload = base64Url.encode(utf8.encode(jsonEncode({
    'sub': 'user-123',
    'exp': expiryEpochSeconds,
    'marker': marker,
  }))).replaceAll('=', '');

  return '$header.$payload.signature';
}

class FakeAuthApi extends AuthApi {
  FakeAuthApi({required this.result})
      : super(baseUrl: Uri.parse('http://localhost'));

  final AuthResult result;
  int refreshCalls = 0;

  @override
  Future<AuthResult> refresh(String refreshToken) async {
    refreshCalls += 1;
    return result;
  }
}

class FakeSessionApi extends SessionApi {
  FakeSessionApi() : super(baseUrl: Uri.parse('http://localhost'));

  @override
  Future<void> revoke({required String refreshToken}) async {}
}

class FakeVault implements SessionVault {
  String? value;

  @override
  Future<String?> readRefreshToken() async => value;

  @override
  Future<void> writeRefreshToken(String refreshToken) async {
    value = refreshToken;
  }

  @override
  Future<void> clear() async {
    value = null;
  }
}

void main() {
  test('refreshes once and retries an authenticated request after 401', () async {
    final expiry = DateTime.now().toUtc().add(const Duration(hours: 1));
    final oldAccess = tokenWithExpiry(
      expiry.millisecondsSinceEpoch ~/ 1000,
      'old',
    );
    final newAccess = tokenWithExpiry(
      expiry.millisecondsSinceEpoch ~/ 1000,
      'new',
    );
    final authApi = FakeAuthApi(
      result: AuthResult(
        user: const AccountUser(
          id: 'user-123',
          email: 'user@example.com',
          displayName: 'Test User',
          status: 'active',
        ),
        accessToken: newAccess,
        session: const AuthSession(
          sessionId: 'session-2',
          refreshToken: 'refresh-token-2-abcdefghijklmnopqrstuvwxyz123456',
          expiresAt: '2030-01-01T00:00:00.000Z',
        ),
      ),
    );
    final session = AppSession(
      authApi: authApi,
      sessionApi: FakeSessionApi(),
      vault: FakeVault(),
    );
    addTearDown(session.dispose);
    await session.establish(
      access: AccessState.fromToken(oldAccess),
      refreshToken: 'refresh-token-1-abcdefghijklmnopqrstuvwxyz123456',
      userId: 'user-123',
      displayName: 'Test User',
    );

    final seenTokens = <String>[];
    final client = MockClient((request) async {
      final token = request.headers['authorization']?.replaceFirst('Bearer ', '');
      seenTokens.add(token ?? '');
      if (seenTokens.length == 1) {
        return http.Response('{"error":"expired"}', 401);
      }
      return http.Response('{"ok":true}', 200);
    });
    final api = SessionAuthedApi(
      baseUrl: Uri.parse('http://localhost:4000'),
      sessionProvider: () => session,
      client: client,
    );

    final response = await api.get('/v1/account/me', oldAccess);

    expect(response['ok'], isTrue);
    expect(authApi.refreshCalls, 1);
    expect(seenTokens, [oldAccess, newAccess]);
    expect(
      session.refreshToken,
      'refresh-token-2-abcdefghijklmnopqrstuvwxyz123456',
    );
  });
}
