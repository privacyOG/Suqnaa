import 'dart:convert';
import 'package:http/http.dart' as http;

class AuthedApi {
  AuthedApi({required this.baseUrl, http.Client? client}) : _client = client ?? http.Client();

  final Uri baseUrl;
  final http.Client _client;

  Future<Map<String, dynamic>> post(String path, String accessToken, Map<String, dynamic> body) async {
    final response = await _client.post(
      baseUrl.resolve(path),
      headers: {
        'authorization': 'Bearer $accessToken',
        'content-type': 'application/json',
      },
      body: jsonEncode(body),
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw StateError('Request failed');
    }

    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> get(String path, String accessToken) async {
    final response = await _client.get(
      baseUrl.resolve(path),
      headers: {'authorization': 'Bearer $accessToken'},
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw StateError('Request failed');
    }

    return jsonDecode(response.body) as Map<String, dynamic>;
  }
}
