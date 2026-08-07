import assert from 'node:assert/strict';
import {
  createVerificationDeliveryProvider,
  maskVerificationDestination,
  validateVerificationDeliveryConfiguration
} from './provider.js';

assert.throws(() => validateVerificationDeliveryConfiguration({
  mode: 'console',
  nodeEnv: 'production',
  timeoutMs: 5000
}));

assert.throws(() => validateVerificationDeliveryConfiguration({
  mode: 'http',
  nodeEnv: 'production',
  endpoint: 'http://delivery.internal.test/verify',
  token: 'test-token',
  timeoutMs: 5000
}));

assert.throws(() => validateVerificationDeliveryConfiguration({
  mode: 'http',
  nodeEnv: 'production',
  endpoint: 'https://delivery.internal.test/verify',
  token: '',
  timeoutMs: 5000
}));

let capturedUrl = '';
let capturedAuthorization = '';
let capturedBody: Record<string, unknown> | null = null;
const provider = createVerificationDeliveryProvider(
  {
    mode: 'http',
    nodeEnv: 'production',
    endpoint: 'https://delivery.internal.test/verify',
    token: 'delivery-test-token',
    timeoutMs: 5000
  },
  async (input, init) => {
    capturedUrl = input.toString();
    capturedAuthorization = new Headers(init?.headers).get('authorization') ?? '';
    capturedBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    return new Response('', { status: 204 });
  }
);

await provider.deliver({
  channel: 'email',
  destination: 'person@example.com',
  code: '123456',
  expiresAt: new Date('2026-08-07T10:00:00.000Z')
});

assert.equal(capturedUrl, 'https://delivery.internal.test/verify');
assert.equal(capturedAuthorization, 'Bearer delivery-test-token');
assert.deepEqual(capturedBody, {
  purpose: 'account_contact_verification',
  channel: 'email',
  destination: 'person@example.com',
  code: '123456',
  expiresAt: '2026-08-07T10:00:00.000Z'
});
assert.equal(maskVerificationDestination('email', 'person@example.com'), 'pe****@example.com');
assert.equal(maskVerificationDestination('phone', '+61412345678'), '*******5678');

console.log('Account verification delivery tests passed.');
