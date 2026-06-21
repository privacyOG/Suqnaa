import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:suqnaa/src/api/auth_api.dart';
import 'package:suqnaa/src/api/session_api.dart';
import 'package:suqnaa/src/session/access_state.dart';
import 'package:suqnaa/src/session/app_session.dart';
import 'package:suqnaa/src/session/session_vault.dart';

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

AuthResult authResult({
  required String accessToken,
  required String refreshToken,
}) {
  return AuthResult(
    user: const AccountUser(
      id: 'user-123',
      email: 'user@example.com',
      displayName: 'Test User',
      status: 'active',
    ),
    accessToken: accessToken,
    session: AuthSession(
      sessionId: 'session-2',
      refreshToken: refreshToken,
      expiresAt: '2030-01-01T00:00:00.000Z',
    ),
  );
}

class FakeAuthApi extends AuthApi {
  FakeAuthApi({required this.result})
      : super(baseUrl: Uri.parse('http://localhost'));

  final AuthResult result;
  int refreshCalls = 0;
  String? lastRefreshToken;

  @override
  Future<AuthResult> refresh(String refreshToken) async {
    refreshCalls += 1;
    lastRefreshToken = refreshToken;
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

class FakeSessionVault implements SessionVault {
  FakeSessionVault({this.value});

  String? value;
  int writeCalls = 0;
  int clearCalls = 0;

  @override
  Future<String?> readRefreshToken() async => value;

  @override
  Future<void> writeRefreshToken(String refreshToken) async {
    value = refreshToken;
    writeCalls += 1;
  }

  @override
  Future<void> clear() async {
    value = null;
    clearCalls += 1;
  }
}

void main() {
  test('establish persists the rotating refresh credential', () async {
    final futureExpiry = DateTime.now().toUtc().add(const Duration(hours: 1));
    final vault = FakeSessionVault();
    final session = AppSession(
      authApi: FakeAuthApi(
        result: authResult(
          accessToken: tokenWithExpiry(futureExpiry.millisecondsSinceEpoch ~/ 1000),
          refreshToken: 'unused-refresh-token-abcdefghijklmnopqrstuvwxyz123456',
        ),
      ),
      sessionApi: FakeSessionApi(),
      vault: vault,
    );
    addTearDown(session.dispose);

    await session.establish(
      access: AccessState.fromToken(
        tokenWithExpiry(futureExpiry.millisecondsSinceEpoch ~/ 1000),
      ),
      refreshToken: 'refresh-token-1-abcdefghijklmnopqrstuvwxyz123456',
      userId: 'user-123',
      displayName: 'Test User',
    );

    expect(vault.value, 'refresh-token-1-abcdefghijklmnopqrstuvwxyz123456');
    expect(vault.writeCalls, 1);
    expect(session.isSignedIn, isTrue);
  });

  test('force refresh rotates access and persisted refresh credentials', () async {
    final futureExpiry = DateTime.now().toUtc().add(const Duration(hours: 1));
    final rotatedAccess = tokenWithExpiry(
      futureExpiry.millisecondsSinceEpoch ~/ 1000,
    );
    final authApi = FakeAuthApi(
      result: authResult(
        accessToken: rotatedAccess,
        refreshToken: 'refresh-token-2-abcdefghijklmnopqrstuvwxyz123456',
      ),
    );
    final vault = FakeSessionVault();
    final session = AppSession(
      authApi: authApi,
      sessionApi: FakeSessionApi(),
      vault: vault,
    );
    addTearDown(session.dispose);

    await session.establish(
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
    expect(
      vault.value,
      'refresh-token-2-abcdefghijklmnopqrstuvwxyz123456',
    );
    expect(session.isSignedIn, isTrue);
  });

  test('restore exchanges the stored token and rotates the vault', () async {
    final futureExpiry = DateTime.now().toUtc().add(const Duration(hours: 1));
    final accessToken = tokenWithExpiry(
      futureExpiry.millisecondsSinceEpoch ~/ 1000,
    );
    final authApi = FakeAuthApi(
      result: authResult(
        accessToken: accessToken,
        refreshToken: 'refresh-token-2-abcdefghijklmnopqrstuvwxyz123456',
      ),
    );
    final vault = FakeSessionVault(
      value: 'refresh-token-1-abcdefghijklmnopqrstuvwxyz123456',
    );
    final session = AppSession(
      authApi: authApi,
      sessionApi: FakeSessionApi(),
      vault: vault,
    );
    addTearDown(session.dispose);

    await session.restore();

    expect(authApi.lastRefreshToken, 'refresh-token-1-abcdefghijklmnopqrstuvwxyz123456');
    expect(session.access.value, accessToken);
    expect(session.userId, 'user-123');
    expect(vault.value, 'refresh-token-2-abcdefghijklmnopqrstuvwxyz123456');
    expect(session.isRestoring, isFalse);
  });

  test('sign out revokes refresh token and clears secure state', () async {
    final futureExpiry = DateTime.now().toUtc().add(const Duration(hours: 1));
    final sessionApi = FakeSessionApi();
    final vault = FakeSessionVault();
    final session = AppSession(
      authApi: FakeAuthApi(
        result: authResult(
          accessToken: tokenWithExpiry(futureExpiry.millisecondsSinceEpoch ~/ 1000),
          refreshToken: 'refresh-token-2-abcdefghijklmnopqrstuvwxyz123456',
        ),
      ),
      sessionApi: sessionApi,
      vault: vault,
    );
    addTearDown(session.dispose);

    await session.establish(
      access: AccessState.fromToken(
        tokenWithExpiry(futureExpiry.millisecondsSinceEpoch ~/ 1000),
      ),
      refreshToken: 'refresh-token-1-abcdefghijklmnopqrstuvwxyz123456',
      userId: 'user-123',
      displayName: 'Test User',
    );

    await session.signOut();

    expect(
      sessionApi.revokedToken,
      'refresh-token-1-abcdefghijklmnopqrstuvwxyz123456',
    );
    expect(vault.value, isNull);
    expect(vault.clearCalls, 1);
    expect(session.isSignedIn, isFalse);
    expect(session.refreshToken, isNull);
    expect(session.userId, isNull);
  });
}
