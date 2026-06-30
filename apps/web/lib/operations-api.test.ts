import assert from 'node:assert/strict';
import {
  completeOperationsQueueItem,
  getOperationRecords,
  getOperationsQueue,
  setOperationsAccountStatus,
  setOperationsListingStatus
} from './operations-api';

async function run() {
  const originalFetch = globalThis.fetch;
  const itemId = '123e4567-e89b-42d3-a456-426614174000';
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  try {
    globalThis.fetch = (async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({
        items: [],
        pagination: { hasMore: false, nextCursor: null },
        item: {
          id: itemId,
          status: 'closed',
          resolvedAt: '2026-06-22T00:00:00.000Z',
          reviewAction: 'no_change'
        },
        listing: { id: itemId, status: 'removed' },
        account: { id: itemId, status: 'suspended' }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }) as typeof fetch;

    await getOperationsQueue();
    assert.equal(calls.at(-1)?.url, '/api/authed/v1/operations/queue');
    assert.equal(calls.at(-1)?.init?.method, 'GET');

    await getOperationsQueue({
      status: 'open',
      limit: 25,
      before: '2026-06-22T00:00:00.000Z'
    });
    assert.equal(
      calls.at(-1)?.url,
      '/api/authed/v1/operations/queue?status=open&limit=25&before=2026-06-22T00%3A00%3A00.000Z'
    );
    assert.equal(calls.at(-1)?.init?.method, 'GET');

    await getOperationRecords();
    assert.equal(calls.at(-1)?.url, '/api/authed/v1/operations/records');
    assert.equal(calls.at(-1)?.init?.method, 'GET');

    await getOperationRecords({
      limit: 25,
      action: 'operations.queue.complete',
      entityType: 'report'
    });
    assert.equal(
      calls.at(-1)?.url,
      '/api/authed/v1/operations/records?limit=25&action=operations.queue.complete&entityType=report'
    );
    assert.equal(calls.at(-1)?.init?.method, 'GET');

    await getOperationRecords({
      limit: 25,
      before: '2026-06-22T00:00:00.000Z',
      action: 'operations.listing_status',
      entityType: 'listing'
    });
    assert.equal(
      calls.at(-1)?.url,
      '/api/authed/v1/operations/records?limit=25&before=2026-06-22T00%3A00%3A00.000Z&action=operations.listing_status&entityType=listing'
    );
    assert.equal(calls.at(-1)?.init?.method, 'GET');

    await completeOperationsQueueItem(itemId, {
      result: 'no_change',
      note: 'Reviewed'
    });
    assert.equal(
      calls.at(-1)?.url,
      `/api/authed/v1/operations/queue/${itemId}/complete`
    );
    assert.equal(calls.at(-1)?.init?.method, 'POST');
    assert.equal(
      calls.at(-1)?.init?.body,
      JSON.stringify({ result: 'no_change', note: 'Reviewed' })
    );

    await setOperationsListingStatus(itemId, {
      status: 'removed',
      note: 'Policy mismatch'
    });
    assert.equal(
      calls.at(-1)?.url,
      `/api/authed/v1/operations/queue/${itemId}/listing-status`
    );
    assert.equal(calls.at(-1)?.init?.method, 'POST');
    assert.equal(
      calls.at(-1)?.init?.body,
      JSON.stringify({ status: 'removed', note: 'Policy mismatch' })
    );

    await setOperationsAccountStatus(itemId, {
      status: 'suspended',
      note: 'Repeated reports'
    });
    assert.equal(
      calls.at(-1)?.url,
      `/api/authed/v1/operations/queue/${itemId}/account-status`
    );
    assert.equal(calls.at(-1)?.init?.method, 'POST');
    assert.equal(
      calls.at(-1)?.init?.body,
      JSON.stringify({ status: 'suspended', note: 'Repeated reports' })
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}

void run();
