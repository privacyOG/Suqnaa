import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveProtectedRoute } from './protected-route-policy';

const apiSource = readFileSync(new URL('./password-security-api.ts', import.meta.url), 'utf8');
const forgotSource = readFileSync(new URL('../components/forgot-password-form.tsx', import.meta.url), 'utf8');
const resetSource = readFileSync(new URL('../components/reset-password-form.tsx', import.meta.url), 'utf8');
const securitySource = readFileSync(new URL('../components/account-security-panel.tsx', import.meta.url), 'utf8');
const signInSource = readFileSync(new URL('../app/[locale]/account/sign-in/page.tsx', import.meta.url), 'utf8');
const sessionId = '123e4567-e89b-42d3-a456-426614174000';

assert.match(apiSource, /\/v1\/auth\/password\/forgot/);
assert.match(apiSource, /\/v1\/auth\/password\/reset/);
assert.match(apiSource, /\/v1\/account\/security\/password/);
assert.match(apiSource, /\/v1\/account\/security\/sessions\/revoke-all/);
assert.match(forgotSource, /accountPasswordResetRequest/);
assert.match(forgotSource, /do not confirm whether an account exists/);
assert.match(resetSource, /all existing account sessions were revoked/);
assert.match(securitySource, /clearLocalWebSession/);
assert.match(securitySource, /Revoke all sessions/);
assert.match(signInSource, /account\/forgot-password/);

assert.ok(resolveProtectedRoute('GET', ['v1', 'account', 'security', 'sessions'], new URLSearchParams()));
assert.ok(resolveProtectedRoute('POST', ['v1', 'account', 'security', 'password'], new URLSearchParams()));
assert.ok(resolveProtectedRoute('POST', ['v1', 'account', 'security', 'sessions', 'revoke-all'], new URLSearchParams()));
assert.ok(resolveProtectedRoute('POST', ['v1', 'account', 'security', 'sessions', sessionId, 'revoke'], new URLSearchParams()));
assert.equal(resolveProtectedRoute('POST', ['v1', 'account', 'security', 'sessions', 'not-a-uuid', 'revoke'], new URLSearchParams()), null);
assert.equal(resolveProtectedRoute('GET', ['v1', 'account', 'security', 'sessions'], new URLSearchParams('redirect=https://attacker.example')), null);

console.log('Web password security surface tests passed.');
