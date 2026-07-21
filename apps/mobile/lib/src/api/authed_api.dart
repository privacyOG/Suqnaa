import 'dart:convert';
import 'dart:typed_data';
import 'package:http/http.dart' as http;

class AuthedApi {
  AuthedApi({required this.baseUrl, http.Client? client})
      : _client = client ?? http.Client();

  final Uri baseUrl;
  final http.Client _client;

  Future<Map<String, dynamic>> post(
    String path,
    String accessToken,
    Map<String, dynamic> body,
  ) {
    return postWithHeaders(path, accessToken, body);
  }

  Future<Map<String, dynamic>> postWithHeaders(
    String path,
    String accessToken,
    Map<String, dynamic> body, {
    Map<String, String> extraHeaders = const {},
  }) async {
    final response = await _client.post(
      baseUrl.resolve(path),
      headers: {
        ...extraHeaders,
        'authorization': 'Bearer $accessToken',
        'content-type': 'application/json',
      },
      body: jsonEncode(body),
    );

    return _decodeJsonResponse(response);
  }

  Future<Map<String, dynamic>> postBinaryWithHeaders(
    String path,
    String accessToken,
    Uint8List body, {
    required String contentType,
    Map<String, String> extraHeaders = const {},
  }) async {
    final response = await _client.post(
      baseUrl.resolve(path),
      headers: {
        ...extraHeaders,
        'authorization': 'Bearer $accessToken',
        'content-type': contentType,
      },
      body: body,
    );

    return _decodeJsonResponse(response);
  }

  Future<Map<String, dynamic>> get(String path, String accessToken) async {
    final response = await _client.get(
      baseUrl.resolve(path),
      headers: {'authorization': 'Bearer $accessToken'},
    );

    return _decodeJsonResponse(response);
  }

  Map<String, dynamic> _decodeJsonResponse(http.Response response) {
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw StateError('Request failed');
    }
    if (response.body.isEmpty) {
      return const {};
    }

    final decoded = jsonDecode(response.body);
    if (decoded is! Map) {
      throw const FormatException('Invalid API response');
    }
    return Map<String, dynamic>.from(decoded);
  }
}
