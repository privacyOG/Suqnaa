import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  getConversationSafety
} from './conversation-api';
import {
  setConversationBlocked,
  setConversationMuted
} from './conversation-actions';
import { submitReport } from './report-api';
import { getOperationsConversationContext } from './operations-api';
import { resolveProtectedRoute } from './protected-route-policy';

const conversationId = '123e4567-e89b-42d3-a456-426614174000';
const messageId = '223e4567-e89b-42d3-a456-426614174000';
const queueItemId = '323e4567-e89b-42d3-a456-426614174000';

async function run() {
  const originalFetch = globalThis.fetch;
  const captured: Array<{ url: string; init?: RequestInit }> = [];
  try {
    globalThis.fetch = (async (input, init) => {
      captured.push({ url: String(input), init });
      const url = String(input);
      if (url.includes('/conversation-context')) {
        return new Response(JSON.stringify({
          report: {
            id: queueItemId,
            reporterId: conversationId,
            subjectUserId: messageId,
            conversationId,
            messageId,
            reason: 'spam',
            details: null,
            createdAt: '2026-08-08T00:00:00.000Z',
            resolvedAt: null,
            reviewAction: null,
            reviewNote: null
          },
          conversation: {
            id: conversationId,
            listingId: null,
            listingTitle: null,
            listingStatus: null,
            buyer: { id: conversationId, displayName: 'Buyer', status: 'active' },
            seller: { id: messageId, displayName: 'Seller', status: 'active' },
            safety: {
              buyerBlockedSeller: false,
              sellerBlockedBuyer: false,
              buyerMutedConversation: false,
              sellerMutedConversation: false
            },
            createdAt: '2026-08-08T00:00:00.000Z',
            updatedAt: '2026-08-08T00:00:00.000Z'
          },
          targetMessage: {
            id: messageId,
            senderId: messageId,
            body: 'Reported message',
            status: 'sent',
            createdAt: '2026-08-08T00:00:00.000Z',
            updatedAt: '2026-08-08T00:00:00.000Z',
            readAt: null
          },
          messages: []
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url.endsWith('/v1/reports')) {
        return new Response(JSON.stringify({
          report: {
            id: queueItemId,
            status: 'submitted',
            conversationId,
            messageId,
            reportedUserId: null,
            listingId: null,
            reason: 'spam',
            createdAt: '2026-08-08T00:00:00.000Z'
          }
        }), { status: 201, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        safety: {
          conversationId,
          counterpartId: messageId,
          muted: true,
          blockedByMe: false,
          messagingAvailable: true
        },
        policy: {
          maxBodyCharacters: 2000,
          maxHttpUrls: 3,
          attachments: { enabled: false, maxCount: 0, reason: 'Disabled for safety.' }
        }
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    await getConversationSafety(conversationId);
    assert.equal(captured.at(-1)?.url, `/api/authed/v1/conversations/${conversationId}/safety`);
    assert.equal(captured.at(-1)?.init?.method, 'GET');

    await setConversationMuted(conversationId, true);
    assert.equal(captured.at(-1)?.url, `/api/authed/v1/conversations/${conversationId}/mute`);
    assert.deepEqual(JSON.parse(String(captured.at(-1)?.init?.body)), { muted: true });

    await setConversationBlocked(conversationId, true);
    assert.equal(captured.at(-1)?.url, `/api/authed/v1/conversations/${conversationId}/block`);
    assert.deepEqual(JSON.parse(String(captured.at(-1)?.init?.body)), { blocked: true });

    await submitReport({ messageId, reason: 'spam', details: 'Repeated unsolicited content.' }, 'report-check');
    assert.equal(captured.at(-1)?.url, '/api/authed/v1/reports');
    assert.equal(new Headers(captured.at(-1)?.init?.headers).get('x-suqnaa-human-check'), 'report-check');
    assert.deepEqual(JSON.parse(String(captured.at(-1)?.init?.body)), {
      messageId,
      reason: 'spam',
      details: 'Repeated unsolicited content.'
    });

    await getOperationsConversationContext(queueItemId);
    assert.equal(
      captured.at(-1)?.url,
      `/api/authed/v1/operations/queue/${queueItemId}/conversation-context`
    );

    const exactRoutes = [
      ['GET', ['v1', 'conversations', conversationId, 'safety']],
      ['POST', ['v1', 'conversations', conversationId, 'mute']],
      ['POST', ['v1', 'conversations', conversationId, 'block']],
      ['GET', ['v1', 'operations', 'queue', queueItemId, 'conversation-context']]
    ] as const;
    for (const [method, segments] of exactRoutes) {
      assert.ok(resolveProtectedRoute(method, segments, new URLSearchParams()));
    }
    assert.equal(
      resolveProtectedRoute('GET', ['v1', 'conversations', conversationId, 'arbitrary'], new URLSearchParams()),
      null
    );

    const thread = await readFile(new URL('../components/conversation-thread-panel.tsx', import.meta.url), 'utf8');
    assert.match(thread, /setConversationMuted/);
    assert.match(thread, /setConversationBlocked/);
    assert.match(thread, /Report message/);
    assert.match(thread, /attachments are disabled/i);
    assert.match(thread, /messagingAvailable/);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
