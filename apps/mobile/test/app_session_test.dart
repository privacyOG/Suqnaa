import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:suqnaa/src/api/auth_api.dart';
import 'package:suqnaa/src/api/session_api.dart';
import 'package:suqnaa/src/session/access_state.dart';
import 'package:suqnaa/src/session/app_session.dart';

String tokenWithExpiry(int expiryEpochSeconds) {
  final header = base64Url.encode(utf8.encode(jsonEncode({
    'alg': 'HS256',
    'typ': 'JWT',
  }))).replaceAll('=', '');
  final payload = base64Url.encode(utf8.encode(jsonEncode({
    'sub': 'user-123',
    'exp': expiryEpochSeconds,
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

  String? revokedToken;

  @override
  Future<void> revoke({required String refreshToken}) async {
    revokedToken = refreshToken;
  }
}

void main() {
  test('force refresh rotates access and refresh credentials', () async {
    final futureExpiry = DateTime.now().toUtc().add(const Duration(hours: 1));
    final rotatedAccess = tokenWithExpiry(
      futureExpiry.millisecondsSinceEpoch ~/ 1000,
    );
    final authApi = FakeAuthApi(
      result: AuthResult(
        user: const AccountUser(
          id: 'user-123',
          email: 'user@example.com',
          displayName: 'Test User',
          status: 'active',
        ),
        accessToken: rotatedAccess,
        session: const AuthSession(
          sessionId: 'session-2',
          refreshToken: 'refresh-token-2-abcdefghijklmnopqrstuvwxyz123456',
          expiresAt: '2030-01-01T00:00:00.000Z',
        ),
      ),
    );
    final sessionApi = FakeSessionApi();
    final session = AppSession(authApi: authApi, sessionApi: sessionApi);
    addTearDown(session.dispose);

    session.establish(
      access: AccessState.fromToken(tokenWithExpiry(1)),
      refreshToken: 'refresh-token-1-abcdefghijklmnopqrstuvwxyz123456',
      userId: 'user-123',
      displayName: 'Test User',
    );

    await session.ensureFreshAccess(force: true);

    expect(authApi.refreshCalls, 1);
    expect(session.access.value, rotatedAccess);
    expect(
      session.refreshToken,
      'refresh-token-2-abcdefghijklmnopqrstuvwxyz123456',
    );
    expect(session.isSignedIn, isTrue);
  });

  test('sign out revokes refresh token and clears local state', () async {
    final authApi = FakeAuthApi(
      result: AuthResult(
        user: const AccountUser(
          id: 'user-123',
          email: 'user@example.com',
          displayName: 'Test User',
          status: 'active',
        ),
        accessToken: tokenWithExpiry(2000000000),
        session: const AuthSession(
          sessionId: 'session-2',
          refreshToken: 'refresh-token-2-abcdefghijklmnopqrstuvwxyz123456',
          expiresAt: '2030-01-01T00:00:00.000Z',
        ),
      ),
    );
    final sessionApi = FakeSessionApi();
    final session = AppSession(authApi: authApi, sessionApi: sessionApi);
    addTearDown(session.dispose);

    session.establish(
      access: AccessState.fromToken(tokenWithExpiry(2000000000)),
      refreshToken: 'refresh-token-1-abcdefghijklmnopqrstuvwxyz123456',
      userId: 'user-123',
      displayName: 'Test User',
    );

    await session.signOut();

    expect(
      sessionApi.revokedToken,
      'refresh-token-1-abcdefghijklmnopqrstuvwxyz123456',
    );
    expect(session.isSignedIn, isFalse);
    expect(session.refreshToken, isNull);
    expect(session.userId, isNull);
  });
}
