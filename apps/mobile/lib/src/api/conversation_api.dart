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

  Future<Map<String, dynamic>> getConversationSync(
    String accessToken,
    String conversationId, {
    int limit = 50,
    String? cursor,
  }) {
    final encodedId = Uri.encodeComponent(conversationId);
    final query = <String, String>{
      'limit': limit.toString(),
      if (cursor != null && cursor.isNotEmpty) 'cursor': cursor,
    };
    return _authedApi.get(
      Uri(
        path: '/v1/conversations/$encodedId/sync',
        queryParameters: query,
      ).toString(),
      accessToken,
    );
  }

  Future<Map<String, dynamic>> getSafety(
    String accessToken,
    String conversationId,
  ) {
    final encodedId = Uri.encodeComponent(conversationId);
    return _authedApi.get(
      '/v1/conversations/$encodedId/safety',
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
      'attachments': const <dynamic>[],
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

  Future<Map<String, dynamic>> setMuted(
    String accessToken,
    String conversationId, {
    required bool muted,
  }) {
    final encodedId = Uri.encodeComponent(conversationId);
    return _authedApi.post(
      '/v1/conversations/$encodedId/mute',
      accessToken,
      {'muted': muted},
    );
  }

  Future<Map<String, dynamic>> setBlocked(
    String accessToken,
    String conversationId, {
    required bool blocked,
  }) {
    final encodedId = Uri.encodeComponent(conversationId);
    return _authedApi.post(
      '/v1/conversations/$encodedId/block',
      accessToken,
      {'blocked': blocked},
    );
  }

  Future<Map<String, dynamic>> reportMessage(
    String accessToken, {
    required String messageId,
    required String reason,
    String? details,
    String? challengeResponse,
  }) {
    return _authedApi.postWithHeaders(
      '/v1/reports',
      accessToken,
      {
        'messageId': messageId,
        'reason': reason,
        if (details != null && details.trim().isNotEmpty) 'details': details.trim(),
      },
      extraHeaders: {
        if (challengeResponse != null && challengeResponse.isNotEmpty)
          'x-suqnaa-human-check': challengeResponse,
      },
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
