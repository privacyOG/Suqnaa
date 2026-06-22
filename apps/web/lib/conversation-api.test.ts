import assert from 'node:assert/strict';
import {
  getConversationHistory,
  getConversationPage
} from './conversation-api';
import {
  acknowledgeConversation,
  createConversationEntry
} from './conversation-actions';

async function run() {
  const originalFetch = globalThis.fetch;

  try {
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;

    globalThis.fetch = (async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(JSON.stringify({
        conversations: [],
        pagination: { hasMore: false, nextCursor: null }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }) as typeof fetch;

    await getConversationPage({
      limit: 20,
      before: '2026-06-22T00:00:00.000Z'
    });
    assert.equal(
      capturedUrl,
      '/api/authed/v1/conversations?limit=20&before=2026-06-22T00%3A00%3A00.000Z'
    );
    assert.equal(capturedInit?.method, 'GET');
    assert.equal(capturedInit?.credentials, 'same-origin');
    assert.equal(new Headers(capturedInit?.headers).has('authorization'), false);

    const conversationId = '123e4567-e89b-42d3-a456-426614174000';
    globalThis.fetch = (async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(JSON.stringify({
        conversation: {
          id: conversationId,
          listingId: null,
          buyerId: '123e4567-e89b-42d3-a456-426614174001',
          sellerId: '123e4567-e89b-42d3-a456-426614174002'
        },
        messages: [],
        pagination: { hasMore: false, nextCursor: null }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }) as typeof fetch;

    await getConversationHistory(conversationId, { limit: 50 });
    assert.equal(
      capturedUrl,
      `/api/authed/v1/conversations/${conversationId}/messages?limit=50`
    );
    assert.equal(capturedInit?.method, 'GET');

    globalThis.fetch = (async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(JSON.stringify({
        conversationId,
        updatedMessages: 2,
        readAt: '2026-06-22T00:00:00.000Z'
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }) as typeof fetch;

    await acknowledgeConversation(conversationId);
    assert.equal(
      capturedUrl,
      `/api/authed/v1/conversations/${conversationId}/read`
    );
    assert.equal(capturedInit?.method, 'POST');
    assert.equal(capturedInit?.body, '{}');

    globalThis.fetch = (async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(JSON.stringify({
        accepted: true,
        idempotent: false,
        message: {
          id: '123e4567-e89b-42d3-a456-426614174003',
          conversationId,
          senderId: '123e4567-e89b-42d3-a456-426614174001',
          recipientId: '123e4567-e89b-42d3-a456-426614174002',
          listingId: null,
          clientMessageId: '123e4567-e89b-42d3-a456-426614174004',
          status: 'queued',
          createdAt: '2026-06-22T00:00:00.000Z'
        }
      }), {
        status: 201,
        headers: { 'content-type': 'application/json' }
      });
    }) as typeof fetch;

    await createConversationEntry({
      recipientId: '123e4567-e89b-42d3-a456-426614174002',
      body: 'Hello from Suqnaa',
      clientMessageId: '123e4567-e89b-42d3-a456-426614174004'
    }, 'message-check');
    assert.equal(capturedUrl, '/api/authed/v1/messages');
    assert.equal(capturedInit?.method, 'POST');
    assert.equal(new Headers(capturedInit?.headers).get('x-suqnaa-human-check'), 'message-check');
    assert.equal(new Headers(capturedInit?.headers).has('authorization'), false);
    assert.deepEqual(
      JSON.parse(String(capturedInit?.body)),
      {
        recipientId: '123e4567-e89b-42d3-a456-426614174002',
        body: 'Hello from Suqnaa',
        clientMessageId: '123e4567-e89b-42d3-a456-426614174004'
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}

void run();
