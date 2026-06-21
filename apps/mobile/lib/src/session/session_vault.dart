import 'package:flutter_secure_storage/flutter_secure_storage.dart';

abstract interface class SessionVault {
  Future<String?> readRefreshToken();
  Future<void> writeRefreshToken(String refreshToken);
  Future<void> clear();
}

class SecureSessionVault implements SessionVault {
  SecureSessionVault({FlutterSecureStorage? storage})
      : _storage = storage ?? FlutterSecureStorage();

  static const _refreshTokenKey = 'suqnaa.refresh_token';

  final FlutterSecureStorage _storage;

  @override
  Future<String?> readRefreshToken() {
    return _storage.read(key: _refreshTokenKey);
  }

  @override
  Future<void> writeRefreshToken(String refreshToken) {
    return _storage.write(
      key: _refreshTokenKey,
      value: refreshToken,
    );
  }

  @override
  Future<void> clear() {
    return _storage.delete(key: _refreshTokenKey);
  }
}
