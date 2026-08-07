import assert from 'node:assert/strict';
import {
  createPasswordResetDeliveryProvider,
  validatePasswordResetDeliveryConfiguration
} from './delivery.js';

assert.throws(() => validatePasswordResetDeliveryConfiguration({
  mode: 'console',
  nodeEnv: 'production',
  timeoutMs: 5000
}));

assert.throws(() => validatePasswordResetDeliveryConfiguration({
  mode: 'http',
  nodeEnv: 'production',
  endpoint: 'http://delivery.internal.test/reset',
  token: 'delivery-token',
  timeoutMs: 5000
}));

assert.throws(() => validatePasswordResetDeliveryConfiguration({
  mode: 'http',
  nodeEnv: 'production',
  endpoint: 'https://delivery.internal.test/reset',
  token: '',
  timeoutMs: 5000
}));

let capturedAuthorization = '';
let capturedBody: Record<string, unknown> | null = null;
const provider = createPasswordResetDeliveryProvider(
  {
    mode: 'http',
    nodeEnv: 'production',
    endpoint: 'https://delivery.internal.test/reset',
    token: 'delivery-token',
    timeoutMs: 5000
  },
  async (_input, init) => {
    capturedAuthorization = new Headers(init?.headers).get('authorization') ?? '';
    capturedBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    return new Response(null, { status: 204 });
  }
);

await provider.deliver({
  destination: 'person@example.com',
  token: 'abcdefghijklmnopqrstuvwxyzABCDEFGH123456789',
  expiresAt: new Date('2026-08-07T11:00:00.000Z')
});

assert.equal(capturedAuthorization, 'Bearer delivery-token');
assert.deepEqual(capturedBody, {
  purpose: 'account_password_reset',
  channel: 'email',
  destination: 'person@example.com',
  token: 'abcdefghijklmnopqrstuvwxyzABCDEFGH123456789',
  expiresAt: '2026-08-07T11:00:00.000Z'
});

console.log('Password reset delivery tests passed.');
