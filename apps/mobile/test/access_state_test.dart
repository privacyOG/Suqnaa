import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:suqnaa/src/session/access_state.dart';

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

void main() {
  test('derives access expiry from token payload', () {
    const expiry = 2000000000;
    final access = AccessState.fromToken(tokenWithExpiry(expiry));

    expect(access.expiresAtTime?.millisecondsSinceEpoch, expiry * 1000);
  });

  test('requests refresh inside lead-time window', () {
    final expiry = DateTime.now().toUtc().add(const Duration(seconds: 30));
    final access = AccessState.fromToken(
      tokenWithExpiry(expiry.millisecondsSinceEpoch ~/ 1000),
    );

    expect(access.shouldRefresh(), isTrue);
  });

  test('does not refresh a comfortably valid token', () {
    final expiry = DateTime.now().toUtc().add(const Duration(hours: 1));
    final access = AccessState.fromToken(
      tokenWithExpiry(expiry.millisecondsSinceEpoch ~/ 1000),
    );

    expect(access.shouldRefresh(), isFalse);
  });

  test('handles malformed tokens without throwing', () {
    final access = AccessState.fromToken('not-a-token');

    expect(access.expiresAtTime, isNull);
    expect(access.shouldRefresh(), isFalse);
  });
}
