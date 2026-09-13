import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerHttpObservability } from '../observability/http-observability.js';

const original = { ...process.env };

Object.assign(process.env, {
  NODE_ENV: 'production',
  PUBLIC_BETA_ENABLED: 'true',
  PUBLIC_BETA_REGISTRATION_ENABLED: 'false',
  PUBLIC_BETA_LISTING_WRITE_ENABLED: 'false',
  PUBLIC_BETA_MESSAGING_ENABLED: 'false',
  PUBLIC_BETA_TRADING_ENABLED: 'false',
  PUBLIC_BETA_PAYMENT_COLLECTION_ENABLED: 'false',
  PUBLIC_BETA_SELLER_VERIFICATION_ENABLED: 'false',
  PUBLIC_BETA_SELLER_SETTLEMENT_ENABLED: 'false',
  PUBLIC_BETA_DISPUTES_REPORTS_ENABLED: 'false',
  PUBLIC_BETA_APPROVED_PAYMENT_PROVIDER: 'none',
  PUBLIC_BETA_APPROVED_SELLER_VERIFICATION_PROVIDER: 'none',
  PAYMENT_COLLECTION_PROVIDER: 'none',
  SELLER_VERIFICATION_PROVIDER: 'none',
  SELLER_SETTLEMENT_ENABLED: 'false',
  SELLER_SETTLEMENT_LIVE_APPROVED: 'false'
});

const app = Fastify({ logger: false });
registerHttpObservability(app);

app.post('/v1/auth/register', async () => ({ ok: true }));
app.get('/v1/listings', async () => ({ items: [] }));

try {
  const blocked = await app.inject({ method: 'POST', url: '/v1/auth/register' });
  assert.equal(blocked.statusCode, 503);
  assert.deepEqual(blocked.json(), { error: 'Feature unavailable during public beta' });

  const readable = await app.inject({ method: 'GET', url: '/v1/listings' });
  assert.equal(readable.statusCode, 200);
  assert.deepEqual(readable.json(), { items: [] });
} finally {
  await app.close();
  for (const key of Object.keys(process.env)) {
    if (!(key in original)) delete process.env[key];
  }
  Object.assign(process.env, original);
}

console.log('Public beta API boundary enforcement passed.');
