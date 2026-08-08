import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveProtectedRoute } from './protected-route-policy';

const orderId = '123e4567-e89b-42d3-a456-426614174000';
const returnId = '223e4567-e89b-42d3-a456-426614174000';

assert.deepEqual(
  resolveProtectedRoute('GET', ['v1', 'market', 'orders', orderId, 'protection'], new URLSearchParams()),
  { method: 'GET', path: `/v1/market/orders/${orderId}/protection`, query: '' }
);
assert.deepEqual(
  resolveProtectedRoute('POST', ['v1', 'market', 'returns', returnId, 'ship'], new URLSearchParams()),
  { method: 'POST', path: `/v1/market/returns/${returnId}/ship`, query: '' }
);
assert.deepEqual(
  resolveProtectedRoute('POST', ['v1', 'market', 'returns', returnId, 'receipt'], new URLSearchParams()),
  { method: 'POST', path: `/v1/market/returns/${returnId}/receipt`, query: '' }
);
assert.equal(resolveProtectedRoute('GET', ['v1', 'market', 'orders', 'not-a-uuid', 'protection'], new URLSearchParams()), null);
assert.equal(resolveProtectedRoute('POST', ['v1', 'market', 'returns', returnId, 'ship'], new URLSearchParams('redirect=https%3A%2F%2Fattacker.example')), null);

const api = readFileSync(new URL('./order-protection-api.ts', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../components/order-protection-panel.tsx', import.meta.url), 'utf8');
const page = readFileSync(new URL('../app/[locale]/activity/orders/[orderId]/page.tsx', import.meta.url), 'utf8');

assert.match(api, /readOrderProtection/);
assert.match(api, /shipProtectedReturn/);
assert.match(api, /acknowledgeProtectedReturn/);
assert.match(api, /parsed\.protocol !== 'https:'/);
assert.match(panel, /buyerCanShip/);
assert.match(panel, /sellerCanAcknowledge/);
assert.match(panel, /separately authorised payment operation/);
assert.match(page, /OrderProtectionPanel/);
assert.match(page, /userId=\{user\.id\}/);

console.log('Web buyer and seller protection surfaces passed.');
