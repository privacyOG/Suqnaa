import 'dart:convert';
import 'package:http/http.dart' as http;

class AuthApi {
  AuthApi({required this.baseUrl, http.Client? client}) : _client = client ?? http.Client();

  final Uri baseUrl;
  final http.Client _client;

  Future<AuthResult> register(Map<String, dynamic> input) async {
    final response = await _client.post(
      baseUrl.resolve('/v1/auth/register'),
      headers: {'content-type': 'application/json'},
      body: jsonEncode(input),
    );

    if (response.statusCode != 201) {
      throw StateError('Unable to register');
    }

    return AuthResult.fromJson(jsonDecode(response.body) as Map<String, dynamic>);
  }

  Future<AuthResult> login(Map<String, dynamic> input) async {
    final response = await _client.post(
      baseUrl.resolve('/v1/auth/login'),
      headers: {'content-type': 'application/json'},
      body: jsonEncode(input),
    );

    if (response.statusCode != 200) {
      throw StateError('Unable to login');
    }

    return AuthResult.fromJson(jsonDecode(response.body) as Map<String, dynamic>);
  }

  Future<AuthResult> refresh(String refreshToken) async {
    final response = await _client.post(
      baseUrl.resolve('/v1/auth/refresh'),
      headers: {'content-type': 'application/json'},
      body: jsonEncode({'refreshToken': refreshToken}),
    );

    if (response.statusCode != 200) {
      throw StateError('Unable to refresh session');
    }

    return AuthResult.fromJson(jsonDecode(response.body) as Map<String, dynamic>);
  }
}

class AuthResult {
  const AuthResult({required this.user, required this.accessToken, required this.session});

  final AccountUser user;
  final String accessToken;
  final AuthSession session;

  factory AuthResult.fromJson(Map<String, dynamic> json) {
    return AuthResult(
      user: AccountUser.fromJson(json['user'] as Map<String, dynamic>),
      accessToken: json['accessToken'] as String,
      session: AuthSession.fromJson(json['session'] as Map<String, dynamic>),
    );
  }
}

class AccountUser {
  const AccountUser({required this.id, this.email, required this.displayName, required this.status});

  final String id;
  final String? email;
  final String displayName;
  final String status;

  factory AccountUser.fromJson(Map<String, dynamic> json) {
    return AccountUser(
      id: json['id'] as String,
      email: json['email'] as String?,
      displayName: json['displayName'] as String,
      status: json['status'] as String,
    );
  }
}

class AuthSession {
  const AuthSession({required this.sessionId, required this.refreshToken, required this.expiresAt});

  final String sessionId;
  final String refreshToken;
  final String expiresAt;

  factory AuthSession.fromJson(Map<String, dynamic> json) {
    return AuthSession(
      sessionId: json['sessionId'] as String,
      refreshToken: json['refreshToken'] as String,
      expiresAt: json['expiresAt'].toString(),
    );
  }
}
