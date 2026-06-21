import 'authed_api.dart';

class ConversationApi {
  ConversationApi({required AuthedApi authedApi}) : _authedApi = authedApi;

  final AuthedApi _authedApi;

  Future<Map<String, dynamic>> getConversationPage(
    String accessToken, {
    int limit = 20,
    String? before,
  }) {
    return _authedApi.get(
      _pagedPath('/v1/conversations', limit: limit, before: before),
      accessToken,
    );
  }

  Future<Map<String, dynamic>> getConversationHistory(
    String accessToken,
    String conversationId, {
    int limit = 50,
    String? before,
  }) {
    final encodedId = Uri.encodeComponent(conversationId);
    return _authedApi.get(
      _pagedPath(
        '/v1/conversations/$encodedId/messages',
        limit: limit,
        before: before,
      ),
      accessToken,
    );
  }

  Future<Map<String, dynamic>> createEntry(
    String accessToken, {
    required String recipientId,
    required String body,
    String? listingId,
    String? clientMessageId,
  }) {
    return _authedApi.post('/v1/messages', accessToken, {
      'recipientId': recipientId,
      'body': body,
      if (listingId != null) 'listingId': listingId,
      if (clientMessageId != null) 'clientMessageId': clientMessageId,
    });
  }

  Future<Map<String, dynamic>> acknowledge(
    String accessToken,
    String conversationId,
  ) {
    final encodedId = Uri.encodeComponent(conversationId);
    return _authedApi.post(
      '/v1/conversations/$encodedId/read',
      accessToken,
      const {},
    );
  }

  String _pagedPath(
    String path, {
    required int limit,
    String? before,
  }) {
    final query = <String, String>{
      'limit': limit.toString(),
      if (before != null && before.isNotEmpty) 'before': before,
    };
    return Uri(path: path, queryParameters: query).toString();
  }
}
