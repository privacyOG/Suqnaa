import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { login, register } from './account-api';

const formSource = readFileSync(new URL('../components/account-auth-form.tsx', import.meta.url), 'utf8');
const recoverySource = readFileSync(new URL('../components/forgot-password-form.tsx', import.meta.url), 'utf8');

assert.match(formSource, /option value="phone"/);
assert.match(formSource, /International phone number/);
assert.match(formSource, /country is never guessed automatically/);
assert.match(recoverySource, /option value="phone"/);
assert.match(recoverySource, /contact detail is linked to an account/);

const requests: Array<Record<string, unknown>> = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (_input, init) => {
  requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
  return new Response(JSON.stringify({
    user: {
      id: '123e4567-e89b-42d3-a456-426614174000',
      email: null,
      phone: '+61412345678',
      displayName: 'Phone User',
      status: 'pending'
    },
    accessToken: 'access-token',
    session: {
      refreshToken: 'refresh-token',
      sessionId: '223e4567-e89b-42d3-a456-426614174000',
      expiresAt: '2026-09-07T00:00:00.000Z'
    }
  }), { status: 200, headers: { 'content-type': 'application/json' } });
};

try {
  await login({ phone: '+61 412 345 678', password: 'password' });
  await register({ phone: '0061 412 345 678', displayName: 'Phone User', password: 'password-123' });
  assert.deepEqual(requests[0], { phone: '+61 412 345 678', password: 'password' });
  assert.deepEqual(requests[1], {
    phone: '0061 412 345 678',
    displayName: 'Phone User',
    password: 'password-123'
  });
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Web phone authentication surface tests passed.');
