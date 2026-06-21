import assert from 'node:assert/strict';
import {
  isSameOriginMutation,
  maximumAccessTokenLength,
  parseWebSessionCredentials,
  validToken
} from './web-session.js';

assert.equal(validToken('abc', 3), true);
assert.equal(validToken('', 3), false);
assert.equal(validToken('abcd', 3), false);
assert.equal(validToken(123, 3), false);

const parsed = parseWebSessionCredentials({
  accessToken: 'access-token',
  session: { refreshToken: 'refresh-token' }
});
assert.deepEqual(parsed, {
  accessToken: 'access-token',
  refreshToken: 'refresh-token'
});

assert.equal(parseWebSessionCredentials(null), null);
assert.equal(parseWebSessionCredentials({ accessToken: 'x' }), null);
assert.equal(parseWebSessionCredentials({
  accessToken: 'x'.repeat(maximumAccessTokenLength + 1),
  session: { refreshToken: 'refresh-token' }
}), null);

const sameOrigin = new Request('https://suqnaa.com/api/session/refresh', {
  method: 'POST',
  headers: { origin: 'https://suqnaa.com' }
});
assert.equal(isSameOriginMutation(sameOrigin), true);

const crossOrigin = new Request('https://suqnaa.com/api/session/refresh', {
  method: 'POST',
  headers: { origin: 'https://attacker.example' }
});
assert.equal(isSameOriginMutation(crossOrigin), false);

const sameSiteHeader = new Request('https://suqnaa.com/api/session/refresh', {
  method: 'POST',
  headers: { 'sec-fetch-site': 'same-origin' }
});
assert.equal(isSameOriginMutation(sameSiteHeader), true);

const crossSiteHeader = new Request('https://suqnaa.com/api/session/refresh', {
  method: 'POST',
  headers: { 'sec-fetch-site': 'cross-site' }
});
assert.equal(isSameOriginMutation(crossSiteHeader), false);

const previousNodeEnv = process.env.NODE_ENV;
process.env.NODE_ENV = 'production';
assert.equal(
  isSameOriginMutation(new Request('https://suqnaa.com/api/session/refresh', { method: 'POST' })),
  false
);
process.env.NODE_ENV = 'development';
assert.equal(
  isSameOriginMutation(new Request('http://localhost:3000/api/session/refresh', { method: 'POST' })),
  true
);
process.env.NODE_ENV = previousNodeEnv;
