import 'dart:convert';
import 'dart:typed_data';
import 'package:http/http.dart' as http;
import '../session/app_session.dart';
import 'authed_api.dart';

class SessionRequestException implements Exception {
  const SessionRequestException({
    required this.statusCode,
    required this.path,
    this.responseBody,
  });

  final int statusCode;
  final String path;
  final String? responseBody;

  @override
  String toString() => 'SessionRequestException($statusCode, $path)';
}

class SessionAuthedApi extends AuthedApi {
  factory SessionAuthedApi({
    required Uri baseUrl,
    required AppSession Function() sessionProvider,
    http.Client? client,
  }) {
    final resolvedClient = client ?? http.Client();
    return SessionAuthedApi._(
      baseUrl: baseUrl,
      sessionProvider: sessionProvider,
      client: resolvedClient,
    );
  }

  SessionAuthedApi._({
    required Uri baseUrl,
    required AppSession Function() sessionProvider,
    required http.Client client,
  })  : _baseUrl = baseUrl,
        _sessionProvider = sessionProvider,
        _client = client,
        super(baseUrl: baseUrl, client: client);

  final Uri _baseUrl;
  final AppSession Function() _sessionProvider;
  final http.Client _client;

  @override
  Future<Map<String, dynamic>> get(String path, String accessToken) {
    return _execute(
      path,
      (token) => _client.get(
        _baseUrl.resolve(path),
        headers: {'authorization': 'Bearer $token'},
      ),
    );
  }

  @override
  Future<Map<String, dynamic>> post(
    String path,
    String accessToken,
    Map<String, dynamic> body,
  ) {
    return postWithHeaders(path, accessToken, body);
  }

  @override
  Future<Map<String, dynamic>> postWithHeaders(
    String path,
    String accessToken,
    Map<String, dynamic> body, {
    Map<String, String> extraHeaders = const {},
  }) {
    final encodedBody = jsonEncode(body);
    return _execute(
      path,
      (token) => _client.post(
        _baseUrl.resolve(path),
        headers: {
          ...extraHeaders,
          'authorization': 'Bearer $token',
          'content-type': 'application/json',
        },
        body: encodedBody,
      ),
    );
  }

  @override
  Future<Map<String, dynamic>> postBinaryWithHeaders(
    String path,
    String accessToken,
    Uint8List body, {
    required String contentType,
    Map<String, String> extraHeaders = const {},
  }) {
    return _execute(
      path,
      (token) => _client.post(
        _baseUrl.resolve(path),
        headers: {
          ...extraHeaders,
          'authorization': 'Bearer $token',
          'content-type': contentType,
        },
        body: body,
      ),
    );
  }

  Future<Map<String, dynamic>> _execute(
    String path,
    Future<http.Response> Function(String token) request,
  ) async {
    final session = _sessionProvider();
    await session.ensureFreshAccess();

    var token = session.access.value;
    if (token.isEmpty) {
      throw const SessionRequestException(
        statusCode: 401,
        path: 'session',
      );
    }

    var response = await request(token);
    if (response.statusCode == 401) {
      await session.ensureFreshAccess(force: true);
      token = session.access.value;
      if (token.isEmpty) {
        throw SessionRequestException(
          statusCode: response.statusCode,
          path: path,
          responseBody: response.body.isEmpty ? null : response.body,
        );
      }
      response = await request(token);
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw SessionRequestException(
        statusCode: response.statusCode,
        path: path,
        responseBody: response.body.isEmpty ? null : response.body,
      );
    }

    if (response.body.isEmpty) {
      return const {};
    }

    final decoded = jsonDecode(response.body);
    if (decoded is! Map) {
      throw SessionRequestException(
        statusCode: response.statusCode,
        path: path,
        responseBody: response.body,
      );
    }

    return Map<String, dynamic>.from(decoded);
  }
}
