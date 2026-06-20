import 'dart:convert';
import 'package:http/http.dart' as http;

class ProfileCheckApi {
  ProfileCheckApi({required this.baseUrl, http.Client? client}) : _client = client ?? http.Client();

  final Uri baseUrl;
  final http.Client _client;

  Future<Map<String, dynamic>> start(String accessToken, Map<String, dynamic> input) async {
    final response = await _client.post(
      baseUrl.resolve('/v1/market/identity-checks'),
      headers: {
        'authorization': 'Bearer $accessToken',
        'content-type': 'application/json',
      },
      body: jsonEncode(input),
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw StateError('Unable to start profile check');
    }

    return jsonDecode(response.body) as Map<String, dynamic>;
  }
}
