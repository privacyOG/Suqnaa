import assert from 'node:assert/strict';
import {
  createChallengeVerifier,
  toTurnstileAction,
  TurnstileChallengeVerifier
} from './challenge-verifier.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

assert.equal(toTurnstileAction('listing.create'), 'listing_create');
assert.equal(toTurnstileAction('a'.repeat(40)).length, 32);

let successRequestBody: Record<string, unknown> | undefined;
const successFetch: typeof fetch = async (_input, init) => {
  successRequestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
  return new Response(
    JSON.stringify({
      success: true,
      hostname: 'suqnaa.com',
      action: 'listing_create',
      'error-codes': []
    }),
    {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }
  );
};

const successVerifier = new TurnstileChallengeVerifier({
  secretKey: 'test-secret',
  expectedHostname: 'suqnaa.com',
  fetchImpl: successFetch
});
const success = await successVerifier.verify({
  response: 'valid-token',
  remoteIp: '203.0.113.10',
  action: 'listing.create'
});

assert.equal(success.success, true);
assert.equal(success.provider, 'turnstile');
assert.deepEqual(success.reasonCodes, []);
assert.equal(successRequestBody?.secret, 'test-secret');
assert.equal(successRequestBody?.response, 'valid-token');
assert.equal(successRequestBody?.remoteip, '203.0.113.10');
assert.match(String(successRequestBody?.idempotency_key), uuidPattern);

const rejectedVerifier = new TurnstileChallengeVerifier({
  secretKey: 'test-secret',
  fetchImpl: async () => new Response(
    JSON.stringify({
      success: false,
      'error-codes': ['timeout-or-duplicate']
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  )
});
const rejected = await rejectedVerifier.verify({ response: 'spent-token' });
assert.equal(rejected.success, false);
assert.deepEqual(rejected.reasonCodes, ['turnstile_timeout_or_duplicate']);

const hostnameMismatchVerifier = new TurnstileChallengeVerifier({
  secretKey: 'test-secret',
  expectedHostname: 'suqnaa.com',
  fetchImpl: async () => new Response(
    JSON.stringify({
      success: true,
      hostname: 'attacker.example',
      action: 'listing_create'
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  )
});
const hostnameMismatch = await hostnameMismatchVerifier.verify({
  response: 'valid-token',
  action: 'listing.create'
});
assert.deepEqual(hostnameMismatch.reasonCodes, ['turnstile_hostname_mismatch']);

const actionMismatchVerifier = new TurnstileChallengeVerifier({
  secretKey: 'test-secret',
  fetchImpl: async () => new Response(
    JSON.stringify({
      success: true,
      hostname: 'suqnaa.com',
      action: 'account_login'
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  )
});
const actionMismatch = await actionMismatchVerifier.verify({
  response: 'valid-token',
  action: 'listing.create'
});
assert.deepEqual(actionMismatch.reasonCodes, ['turnstile_action_mismatch']);

let oversizedFetchCalled = false;
const oversizedVerifier = new TurnstileChallengeVerifier({
  secretKey: 'test-secret',
  fetchImpl: async () => {
    oversizedFetchCalled = true;
    return new Response('{}', { status: 200 });
  }
});
const oversized = await oversizedVerifier.verify({
  response: 'x'.repeat(2049)
});
assert.equal(oversizedFetchCalled, false);
assert.deepEqual(oversized.reasonCodes, ['challenge_response_too_long']);

const timeoutFetch: typeof fetch = async (_input, init) => new Promise<Response>((_resolve, reject) => {
  init?.signal?.addEventListener('abort', () => {
    const error = new Error('aborted');
    error.name = 'AbortError';
    reject(error);
  });
});
const timeoutVerifier = new TurnstileChallengeVerifier({
  secretKey: 'test-secret',
  timeoutMs: 5,
  fetchImpl: timeoutFetch
});
const timedOut = await timeoutVerifier.verify({ response: 'valid-token' });
assert.deepEqual(timedOut.reasonCodes, ['turnstile_timeout']);

const unavailable = createChallengeVerifier({
  provider: 'turnstile',
  secretKey: ''
});
const unavailableResult = await unavailable.verify({ response: 'some-token' });
assert.equal(unavailableResult.success, false);
assert.ok(unavailableResult.reasonCodes.includes('challenge_provider_not_configured'));
