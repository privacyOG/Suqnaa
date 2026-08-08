import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:suqnaa/src/api/authed_api.dart';
import 'package:suqnaa/src/api/conversation_api.dart';

const conversationId = '123e4567-e89b-42d3-a456-426614174000';
const messageId = '223e4567-e89b-42d3-a456-426614174000';

void main() {
  test('uses exact conversation safety routes and disabled attachment contract', () async {
    final requests = <http.Request>[];
    final client = MockClient((request) async {
      requests.add(request);
      if (request.url.path.endsWith('/messages') && request.method == 'GET') {
        return http.Response(jsonEncode({
          'conversation': {
            'id': conversationId,
            'listingId': null,
            'buyerId': '323e4567-e89b-42d3-a456-426614174000',
            'sellerId': '423e4567-e89b-42d3-a456-426614174000',
            'safety': {
              'muted': false,
              'blockedByMe': false,
              'messagingAvailable': true,
            },
          },
          'policy': {
            'maxBodyCharacters': 2000,
            'maxHttpUrls': 3,
            'attachments': {
              'enabled': false,
              'maxCount': 0,
              'reason': 'Attachments disabled.',
            },
          },
          'messages': [],
          'pagination': {'hasMore': false, 'nextCursor': null},
        }), 200);
      }
      if (request.url.path.endsWith('/safety')) {
        return http.Response(jsonEncode({
          'safety': {
            'conversationId': conversationId,
            'counterpartId': '423e4567-e89b-42d3-a456-426614174000',
            'muted': false,
            'blockedByMe': false,
            'messagingAvailable': true,
          },
          'policy': {
            'maxBodyCharacters': 2000,
            'maxHttpUrls': 3,
            'attachments': {'enabled': false, 'maxCount': 0, 'reason': 'Disabled'},
          },
        }), 200);
      }
      if (request.url.path == '/v1/reports') {
        return http.Response(jsonEncode({
          'report': {
            'id': '523e4567-e89b-42d3-a456-426614174000',
            'status': 'submitted',
            'conversationId': conversationId,
            'messageId': messageId,
            'reason': 'spam',
            'createdAt': '2026-08-08T00:00:00.000Z',
          }
        }), 201);
      }
      if (request.url.path == '/v1/messages') {
        return http.Response(jsonEncode({
          'accepted': true,
          'idempotent': false,
          'message': {
            'id': messageId,
            'conversationId': conversationId,
            'senderId': '323e4567-e89b-42d3-a456-426614174000',
            'status': 'queued',
            'createdAt': '2026-08-08T00:00:00.000Z',
            'attachments': [],
          }
        }), 201);
      }
      return http.Response(jsonEncode({
        'safety': {
          'conversationId': conversationId,
          'counterpartId': '423e4567-e89b-42d3-a456-426614174000',
          'muted': true,
          'blockedByMe': request.url.path.endsWith('/block'),
          'messagingAvailable': !request.url.path.endsWith('/block'),
        },
        'policy': {
          'maxBodyCharacters': 2000,
          'maxHttpUrls': 3,
          'attachments': {'enabled': false, 'maxCount': 0, 'reason': 'Disabled'},
        },
      }), 200);
    });

    final api = ConversationApi(
      authedApi: AuthedApi(
        baseUrl: Uri.parse('https://api.suqnaa.test'),
        client: client,
      ),
    );

    await api.getConversationHistory('token', conversationId);
    expect(requests.last.url.path, '/v1/conversations/$conversationId/messages');

    await api.getSafety('token', conversationId);
    expect(requests.last.url.path, '/v1/conversations/$conversationId/safety');

    await api.setMuted('token', conversationId, muted: true);
    expect(requests.last.url.path, '/v1/conversations/$conversationId/mute');
    expect(jsonDecode(requests.last.body), {'muted': true});

    await api.setBlocked('token', conversationId, blocked: true);
    expect(requests.last.url.path, '/v1/conversations/$conversationId/block');
    expect(jsonDecode(requests.last.body), {'blocked': true});

    await api.createEntry(
      'token',
      recipientId: '423e4567-e89b-42d3-a456-426614174000',
      body: 'Hello safely',
      clientMessageId: '623e4567-e89b-42d3-a456-426614174000',
    );
    expect(requests.last.url.path, '/v1/messages');
    final messageBody = jsonDecode(requests.last.body) as Map<String, dynamic>;
    expect(messageBody['attachments'], isEmpty);

    await api.reportMessage(
      'token',
      messageId: messageId,
      reason: 'spam',
      details: 'Repeated unsolicited content',
      challengeResponse: 'report-check',
    );
    expect(requests.last.url.path, '/v1/reports');
    expect(requests.last.headers['x-suqnaa-human-check'], 'report-check');
    expect(jsonDecode(requests.last.body), {
      'messageId': messageId,
      'reason': 'spam',
      'details': 'Repeated unsolicited content',
    });
    expect(requests.last.headers['authorization'], 'Bearer token');
  });
}
