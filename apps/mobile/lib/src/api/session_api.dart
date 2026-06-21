import 'dart:convert';
import 'package:http/http.dart' as http;

class SessionApi {
  SessionApi({required this.baseUrl, http.Client? client})
      : _client = client ?? http.Client();

  final Uri baseUrl;
  final http.Client _client;

  Future<void> revoke({required String refreshToken}) async {
    final response = await _client.post(
      baseUrl.resolve('/v1/auth/logout'),
      headers: {'content-type': 'application/json'},
      body: jsonEncode({'refreshToken': refreshToken}),
    );

    if (response.statusCode != 204) {
      throw StateError('Unable to revoke session');
    }
  }
}
