import assert from 'node:assert/strict';
import {
  isSameOriginMutation,
  maximumAccessTokenLength,
  maximumRefreshTokenLength,
  parseWebSessionCredentials,
  validToken
} from './web-session.ts';

function mutation(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { method: 'POST', headers });
}

// Exact visible origin is accepted even when the internal Next URL is loopback.
assert.equal(isSameOriginMutation(mutation('http://127.0.0.1:3000/api/session', {
  origin: 'https://suqnaa.example',
  host: 'suqnaa.example',
  'x-forwarded-proto': 'https',
  'sec-fetch-site': 'same-origin'
}), true), true);

// Cross-site origins are denied regardless of forged forwarding metadata.
assert.equal(isSameOriginMutation(mutation('http://127.0.0.1:3000/api/session', {
  origin: 'https://attacker.example',
  host: 'suqnaa.example',
  'x-forwarded-host': 'attacker.example',
  'x-forwarded-proto': 'https',
  'sec-fetch-site': 'same-origin'
}), true), false);

// A forged Host cannot turn an attacker Origin into the browser-visible application origin.
assert.equal(isSameOriginMutation(mutation('https://suqnaa.example/api/session', {
  origin: 'https://attacker.example',
  host: 'suqnaa.example',
  'x-forwarded-proto': 'https'
}), true), false);

assert.equal(isSameOriginMutation(mutation('https://suqnaa.example/api/session', {
  host: 'suqnaa.example',
  'sec-fetch-site': 'cross-site'
}), true), false);
assert.equal(isSameOriginMutation(mutation('https://suqnaa.example/api/session', {
  host: 'suqnaa.example',
  'sec-fetch-site': 'same-site'
}), true), false);
assert.equal(isSameOriginMutation(mutation('https://suqnaa.example/api/session', {
  host: 'suqnaa.example'
}), true), false);
assert.equal(isSameOriginMutation(mutation('https://suqnaa.example/api/session', {
  origin: 'null',
  host: 'suqnaa.example'
}), true), false);
assert.equal(isSameOriginMutation(mutation('https://suqnaa.example/api/session', {
  origin: '%%%not-a-url%%%',
  host: 'suqnaa.example'
}), true), false);

// Session parsing rejects oversized or malformed credential material before cookie storage.
assert.equal(validToken('x'.repeat(maximumAccessTokenLength + 1), maximumAccessTokenLength), false);
assert.equal(validToken('x'.repeat(maximumRefreshTokenLength + 1), maximumRefreshTokenLength), false);
assert.equal(parseWebSessionCredentials({
  accessToken: 'x'.repeat(maximumAccessTokenLength + 1),
  session: { refreshToken: 'refresh-token' }
}), null);
assert.equal(parseWebSessionCredentials({
  accessToken: 'access-token',
  session: { refreshToken: 'x'.repeat(maximumRefreshTokenLength + 1) }
}), null);
assert.equal(parseWebSessionCredentials({
  accessToken: ['array-is-not-a-token'],
  session: { refreshToken: 'refresh-token' }
}), null);
assert.equal(parseWebSessionCredentials({
  accessToken: 'access-token',
  session: { refreshToken: { nested: 'not-a-token' } }
}), null);

console.log('P1-19 browser request-forgery and session-boundary suite passed.');
