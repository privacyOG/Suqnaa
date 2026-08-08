import 'package:flutter_test/flutter_test.dart';
import 'package:suqnaa/src/api/authed_api.dart';
import 'package:suqnaa/src/api/conversation_api.dart';

void main() {
  test('conversation sync encodes cursor and bounded limit', () async {
    final fake = _FakeAuthedApi();
    final api = ConversationApi(authedApi: fake);
    const conversationId = '123e4567-e89b-42d3-a456-426614174000';

    await api.getConversationSync(
      'access-token',
      conversationId,
      limit: 100,
      cursor: 'cursor/value',
    );

    expect(
      fake.lastPath,
      '/v1/conversations/$conversationId/sync?limit=100&cursor=cursor%2Fvalue',
    );
    expect(fake.lastAccessToken, 'access-token');
  });
}

class _FakeAuthedApi extends AuthedApi {
  _FakeAuthedApi() : super(baseUrl: Uri.parse('https://example.test'));

  String? lastPath;
  String? lastAccessToken;

  @override
  Future<Map<String, dynamic>> get(String path, String accessToken) async {
    lastPath = path;
    lastAccessToken = accessToken;
    return {
      'conversationId': '123e4567-e89b-42d3-a456-426614174000',
      'changes': const [],
      'reconciliation': {
        'deliveredMessages': 0,
        'serverTime': '2026-08-08T08:00:00.000Z',
      },
      'pagination': {
        'cursor': 'cursor/value',
        'hasMore': false,
        'pollAfterMs': 3000,
      },
    };
  }
}
