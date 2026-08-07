import 'dart:convert';
import 'package:http/http.dart' as http;
import 'authed_api.dart';

class PasswordRecoveryException implements Exception {
  const PasswordRecoveryException(this.statusCode, [this.responseBody]);
  final int statusCode;
  final String? responseBody;
}

class PasswordSecurityApi {
  PasswordSecurityApi({
    required this.baseUrl,
    AuthedApi? authedApi,
    http.Client? client,
  })  : _authedApi = authedApi ?? AuthedApi(baseUrl: baseUrl),
        _client = client ?? http.Client();

  final Uri baseUrl;
  final AuthedApi _authedApi;
  final http.Client _client;

  Future<void> requestPasswordReset(String email) {
    return _requestPasswordReset({'email': email.trim().toLowerCase()});
  }

  Future<void> requestPhonePasswordReset(String phone) {
    return _requestPasswordReset({'phone': phone.trim()});
  }

  Future<void> _requestPasswordReset(Map<String, String> contact) async {
    final response = await _client.post(
      baseUrl.resolve('/v1/auth/password/forgot'),
      headers: {'content-type': 'application/json'},
      body: jsonEncode(contact),
    );
    if (response.statusCode != 202) {
      throw PasswordRecoveryException(
        response.statusCode,
        response.body.isEmpty ? null : response.body,
      );
    }
  }

  Future<void> resetPassword(String token, String newPassword) async {
    final response = await _client.post(
      baseUrl.resolve('/v1/auth/password/reset'),
      headers: {'content-type': 'application/json'},
      body: jsonEncode({
        'token': token.trim(),
        'newPassword': newPassword,
      }),
    );
    if (response.statusCode != 200) {
      throw PasswordRecoveryException(
        response.statusCode,
        response.body.isEmpty ? null : response.body,
      );
    }
  }

  Future<List<SecuritySessionRecord>> listSessions(String accessToken) async {
    final payload = await _authedApi.get(
      '/v1/account/security/sessions',
      accessToken,
    );
    final values = payload['sessions'];
    if (values is! List) {
      throw const FormatException('Invalid security sessions response');
    }
    return values
        .map((value) => SecuritySessionRecord.fromJson(
              Map<String, dynamic>.from(value as Map),
            ))
        .toList(growable: false);
  }

  Future<int> changePassword(
    String accessToken,
    String currentPassword,
    String newPassword,
  ) async {
    final payload = await _authedApi.post(
      '/v1/account/security/password',
      accessToken,
      {
        'currentPassword': currentPassword,
        'newPassword': newPassword,
      },
    );
    return (payload['revokedSessions'] as num?)?.toInt() ?? 0;
  }

  Future<void> revokeSession(String accessToken, String sessionId) async {
    await _authedApi.post(
      '/v1/account/security/sessions/$sessionId/revoke',
      accessToken,
      const {},
    );
  }

  Future<int> revokeAllSessions(String accessToken) async {
    final payload = await _authedApi.post(
      '/v1/account/security/sessions/revoke-all',
      accessToken,
      const {},
    );
    return (payload['revokedSessions'] as num?)?.toInt() ?? 0;
  }
}

class SecuritySessionRecord {
  const SecuritySessionRecord({
    required this.id,
    required this.userAgent,
    required this.ipAddress,
    required this.createdAt,
    required this.expiresAt,
  });

  final String id;
  final String? userAgent;
  final String? ipAddress;
  final DateTime createdAt;
  final DateTime expiresAt;

  factory SecuritySessionRecord.fromJson(Map<String, dynamic> json) {
    return SecuritySessionRecord(
      id: json['id'] as String,
      userAgent: json['userAgent'] as String?,
      ipAddress: json['ipAddress'] as String?,
      createdAt: DateTime.parse(json['createdAt'].toString()).toUtc(),
      expiresAt: DateTime.parse(json['expiresAt'].toString()).toUtc(),
    );
  }
}
