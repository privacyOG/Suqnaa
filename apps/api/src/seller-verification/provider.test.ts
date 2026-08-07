import assert from 'node:assert/strict';
import type { SellerVerificationConfiguration } from '../config/seller-verification-config.js';
import { HttpSellerVerificationProvider } from './provider.js';

const configuration: SellerVerificationConfiguration = {
  enabled: true,
  provider: 'identity_relay',
  endpoint: 'https://verify.example.test/session',
  token: 'verification-bearer-token-123',
  signingSecret: 'verification-signing-secret-1234567890',
  timeoutMs: 5000,
  eventMaxAgeSeconds: 300,
  verifiedValidityDays: 365
};

let captured: RequestInit | undefined;
const future = new Date(Date.now() + 20 * 60 * 1000).toISOString();
const fetchImpl: typeof fetch = async (_input, init) => {
  captured = init;
  return new Response(JSON.stringify({
    reference: 'verification-ref-123',
    hostedUrl: 'https://verify.example.test/flow/session-123',
    expiresAt: future
  }), { status: 200, headers: { 'content-type': 'application/json' } });
};

const provider = new HttpSellerVerificationProvider(configuration, fetchImpl);
const result = await provider.createSession({
  action: 'create',
  checkId: '123e4567-e89b-42d3-a456-426614174000',
  accountId: '223e4567-e89b-42d3-a456-426614174000',
  level: 'business',
  countryCode: 'AU',
  businessName: 'Example Trading'
});
assert.equal(result.reference, 'verification-ref-123');
assert.equal(result.hostedUrl, 'https://verify.example.test/flow/session-123');
assert.equal(captured?.method, 'POST');
assert.equal((captured?.headers as Record<string, string>).authorization, 'Bearer verification-bearer-token-123');
assert.deepEqual(JSON.parse(String(captured?.body)), {
  purpose: 'seller_verification',
  action: 'create',
  requestId: '123e4567-e89b-42d3-a456-426614174000',
  accountId: '223e4567-e89b-42d3-a456-426614174000',
  level: 'business',
  countryCode: 'AU',
  businessName: 'Example Trading'
});

const insecureFetch: typeof fetch = async () => new Response(JSON.stringify({
  reference: 'verification-ref-456',
  hostedUrl: 'http://verify.example.test/flow/session-456',
  expiresAt: future
}), { status: 200, headers: { 'content-type': 'application/json' } });
await assert.rejects(
  () => new HttpSellerVerificationProvider(configuration, insecureFetch).createSession({
    action: 'create',
    checkId: '323e4567-e89b-42d3-a456-426614174000',
    accountId: '423e4567-e89b-42d3-a456-426614174000',
    level: 'seller',
    countryCode: 'AU'
  }),
  /hosted URL is not secure/
);

console.log('Seller verification provider tests passed.');
