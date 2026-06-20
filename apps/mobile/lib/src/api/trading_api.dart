import 'dart:convert';
import 'package:http/http.dart' as http;

class TradingApi {
  TradingApi({required this.baseUrl, http.Client? client}) : _client = client ?? http.Client();

  final Uri baseUrl;
  final http.Client _client;

  Future<Map<String, dynamic>> createTimedSale(String accessToken, Map<String, dynamic> input) async {
    return _post('/v1/market/timed-sale', accessToken, input);
  }

  Future<Map<String, dynamic>> submitOffer(String accessToken, Map<String, dynamic> input) async {
    return _post('/v1/market/offers', accessToken, input);
  }

  Future<Map<String, dynamic>> _post(String path, String accessToken, Map<String, dynamic> input) async {
    final response = await _client.post(
      baseUrl.resolve(path),
      headers: {
        'authorization': 'Bearer $accessToken',
        'content-type': 'application/json',
      },
      body: jsonEncode(input),
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw StateError('Unable to submit trading request');
    }

    return jsonDecode(response.body) as Map<String, dynamic>;
  }
}
