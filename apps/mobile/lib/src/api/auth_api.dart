import 'dart:convert';
import 'package:http/http.dart' as http;

class AuthApi {
  AuthApi({required this.baseUrl, http.Client? client}) : _client = client ?? http.Client();

  final Uri baseUrl;
  final http.Client _client;

  Future<Map<String, dynamic>> register(Map<String, dynamic> input) async {
    final response = await _client.post(
      baseUrl.resolve('/v1/auth/register'),
      headers: {'content-type': 'application/json'},
      body: jsonEncode(input),
    );

    if (response.statusCode != 201) {
      throw StateError('Unable to register');
    }

    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> login(Map<String, dynamic> input) async {
    final response = await _client.post(
      baseUrl.resolve('/v1/auth/login'),
      headers: {'content-type': 'application/json'},
      body: jsonEncode(input),
    );

    if (response.statusCode != 200) {
      throw StateError('Unable to login');
    }

    return jsonDecode(response.body) as Map<String, dynamic>;
  }
}
