import 'dart:convert';
import 'package:http/http.dart' as http;

class AccountApi {
  AccountApi({required this.baseUrl, http.Client? client}) : _client = client ?? http.Client();

  final Uri baseUrl;
  final http.Client _client;

  Future<Map<String, dynamic>> currentAccount(String accessToken) async {
    final response = await _client.get(
      baseUrl.resolve('/v1/account/me'),
      headers: {'authorization': 'Bearer $accessToken'},
    );

    if (response.statusCode != 200) {
      throw StateError('Unable to load current account');
    }

    return jsonDecode(response.body) as Map<String, dynamic>;
  }
}
