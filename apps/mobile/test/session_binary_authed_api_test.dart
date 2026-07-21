import 'dart:convert';
import 'dart:typed_data';
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
  final header = base64Url
      .encode(utf8.encode(jsonEncode({'alg': 'HS256', 'typ': 'JWT'})))
      .replaceAll('=', '');
  final payload = base64Url
      .encode(utf8.encode(jsonEncode({
        'sub': 'user-123',
        'exp': expiryEpochSeconds,
        'marker': marker,
      })))
      .replaceAll('=', '');
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

AuthResult refreshedResult(String accessToken) {
  return AuthResult(
    user: const AccountUser(
      id: 'user-123',
      email: 'user@example.com',
      displayName: 'Test User',
      status: 'active',
    ),
    accessToken: accessToken,
    session: const AuthSession(
      sessionId: 'session-2',
      refreshToken: 'refresh-token-2-abcdefghijklmnopqrstuvwxyz123456',
      expiresAt: '2030-01-01T00:00:00.000Z',
    ),
  );
}

Future<AppSession> createSession({
  required FakeAuthApi authApi,
  required String oldAccess,
}) async {
  final session = AppSession(
    authApi: authApi,
    sessionApi: FakeSessionApi(),
    vault: FakeVault(),
  );
  await session.establish(
    access: AccessState.fromToken(oldAccess),
    refreshToken: 'refresh-token-1-abcdefghijklmnopqrstuvwxyz123456',
    userId: 'user-123',
    displayName: 'Test User',
  );
  return session;
}

void main() {
  test('refreshes once and retries an identical protected binary upload', () async {
    final expiry = DateTime.now().toUtc().add(const Duration(hours: 1));
    final oldAccess = tokenWithExpiry(
      expiry.millisecondsSinceEpoch ~/ 1000,
      'old-binary',
    );
    final newAccess = tokenWithExpiry(
      expiry.millisecondsSinceEpoch ~/ 1000,
      'new-binary',
    );
    final authApi = FakeAuthApi(result: refreshedResult(newAccess));
    final session = await createSession(
      authApi: authApi,
      oldAccess: oldAccess,
    );
    addTearDown(session.dispose);

    final seenTokens = <String>[];
    final seenBodies = <List<int>>[];
    final seenContentTypes = <String>[];
    final seenChecks = <String>[];
    final client = MockClient((request) async {
      seenTokens.add(
        request.headers['authorization']?.replaceFirst('Bearer ', '') ?? '',
      );
      seenBodies.add(List<int>.from(request.bodyBytes));
      seenContentTypes.add(request.headers['content-type'] ?? '');
      seenChecks.add(request.headers['x-suqnaa-human-check'] ?? '');
      if (seenTokens.length == 1) {
        return http.Response('{"error":"expired"}', 401);
      }
      return http.Response(
        '{"media":{"id":"223e4567-e89b-42d3-a456-426614174000"},"mediaCount":1}',
        201,
      );
    });
    final api = SessionAuthedApi(
      baseUrl: Uri.parse('http://localhost:4000'),
      sessionProvider: () => session,
      client: client,
    );
    final body = Uint8List.fromList([0xff, 0xd8, 0xff, 0xd9]);

    final response = await api.postBinaryWithHeaders(
      '/v1/listings/123e4567-e89b-42d3-a456-426614174000/media/upload',
      oldAccess,
      body,
      contentType: 'image/jpeg',
      extraHeaders: const {
        'x-suqnaa-human-check': 'media-check',
        'authorization': 'Bearer attacker-controlled',
        'content-type': 'text/plain',
      },
    );

    expect(response['mediaCount'], 1);
    expect(authApi.refreshCalls, 1);
    expect(seenTokens, [oldAccess, newAccess]);
    expect(seenBodies, [body, body]);
    expect(seenContentTypes, ['image/jpeg', 'image/jpeg']);
    expect(seenChecks, ['media-check', 'media-check']);
  });
}
