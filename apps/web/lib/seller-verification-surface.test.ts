import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  accountProfilePath
} from './account-profile-api';
import {
  loadOperationsVerifications,
  reviewOperationsVerification
} from './operations-verification-api';
import {
  beginSellerVerification,
  loadSellerVerificationStatus
} from './seller-verification-api';

assert.equal(accountProfilePath, '/v1/account/profile');
assert.equal(typeof loadSellerVerificationStatus, 'function');
assert.equal(typeof beginSellerVerification, 'function');
assert.equal(typeof loadOperationsVerifications, 'function');
assert.equal(typeof reviewOperationsVerification, 'function');

const sellerPanel = readFileSync(new URL('../components/seller-verification-panel.tsx', import.meta.url), 'utf8');
const sellerPage = readFileSync(new URL('../app/[locale]/account/seller-verification/page.tsx', import.meta.url), 'utf8');
const accountPage = readFileSync(new URL('../app/[locale]/account/page.tsx', import.meta.url), 'utf8');
const operationsPanel = readFileSync(new URL('../components/operations-verification-panel.tsx', import.meta.url), 'utf8');
const operationsPage = readFileSync(new URL('../app/[locale]/operations/verifications/page.tsx', import.meta.url), 'utf8');

assert.match(sellerPanel, /accountSellerVerificationStart/);
assert.match(sellerPanel, /hostedUrl/);
assert.match(sellerPanel, /target\.protocol !== 'https:'/);
assert.match(sellerPanel, /provider result never verifies the account automatically/i);
assert.match(sellerPage, /SellerVerificationPanel/);
assert.match(accountPage, /account\/seller-verification/);
assert.match(operationsPanel, /reviewOperationsVerification/);
assert.match(operationsPanel, /providerResult/);
assert.match(operationsPage, /OperationsVerificationPanel/);
assert.doesNotMatch(sellerPanel, /identity document.*FormData/i);

console.log('Seller verification web surface tests passed.');
