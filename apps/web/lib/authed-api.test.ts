import assert from 'node:assert/strict';
import {
  AuthedRequestError,
  getAuthed,
  postAuthed,
  postAuthedBinary
} from './authed-api';

async function run() {
  const originalFetch = globalThis.fetch;

  try {
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;

    globalThis.fetch = (async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(JSON.stringify({ user: { id: 'user-1' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }) as typeof fetch;

    const account = await getAuthed<{ user: { id: string } }>('/v1/account/me');
    assert.equal(account.user.id, 'user-1');
    assert.equal(capturedUrl, '/api/authed/v1/account/me');
    assert.equal(capturedInit?.method, 'GET');
    assert.equal(capturedInit?.credentials, 'same-origin');
    assert.equal(new Headers(capturedInit?.headers).has('authorization'), false);

    globalThis.fetch = (async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(JSON.stringify({ listing: { id: 'listing-1' } }), {
        status: 201,
        headers: { 'content-type': 'application/json' }
      });
    }) as typeof fetch;

    await postAuthed(
      '/v1/listings',
      { title: 'Test listing' },
      'challenge-token'
    );
    const postHeaders = new Headers(capturedInit?.headers);
    assert.equal(capturedUrl, '/api/authed/v1/listings');
    assert.equal(capturedInit?.method, 'POST');
    assert.equal(postHeaders.get('content-type'), 'application/json');
    assert.equal(postHeaders.get('x-suqnaa-human-check'), 'challenge-token');
    assert.equal(postHeaders.has('authorization'), false);
    assert.equal(capturedInit?.body, JSON.stringify({ title: 'Test listing' }));

    const imageBody = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], {
      type: 'image/jpeg'
    });
    await postAuthedBinary(
      '/v1/listings/123e4567-e89b-42d3-a456-426614174000/media/upload',
      imageBody,
      'media-token'
    );
    const binaryHeaders = new Headers(capturedInit?.headers);
    assert.equal(
      capturedUrl,
      '/api/authed/v1/listings/123e4567-e89b-42d3-a456-426614174000/media/upload'
    );
    assert.equal(capturedInit?.method, 'POST');
    assert.equal(binaryHeaders.get('content-type'), 'image/jpeg');
    assert.equal(binaryHeaders.get('x-suqnaa-human-check'), 'media-token');
    assert.equal(capturedInit?.body, imageBody);

    globalThis.fetch = (async () => new Response(
      JSON.stringify({ error: 'Too many requests' }),
      {
        status: 429,
        headers: {
          'content-type': 'application/json',
          'retry-after': '45'
        }
      }
    )) as typeof fetch;

    await assert.rejects(
      () => getAuthed('/v1/conversations'),
      (error: unknown) => {
        assert.ok(error instanceof AuthedRequestError);
        assert.equal(error.status, 429);
        assert.equal(error.retryAfter, 45);
        assert.equal(error.message, 'Too many requests');
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}

void run();
