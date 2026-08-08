import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const api = readFileSync(new URL('./seller-payout-api.ts', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../components/seller-payout-panel.tsx', import.meta.url), 'utf8');
const page = readFileSync(new URL('../app/[locale]/account/payouts/page.tsx', import.meta.url), 'utf8');
const account = readFileSync(new URL('../app/[locale]/account/page.tsx', import.meta.url), 'utf8');

assert.match(api, /\/v1\/account\/payouts/);
assert.match(api, /\/v1\/account\/payouts\/onboarding/);
assert.match(api, /\/v1\/account\/payouts\/schedule/);
assert.match(panel, /connect\.stripe\.com/);
assert.match(panel, /Banking and identity details/);
assert.match(panel, /commission_amount/);
assert.match(page, /SellerPayoutPanel/);
assert.match(account, /\/account\/payouts/);

console.log('Seller payout web surface tests passed.');
