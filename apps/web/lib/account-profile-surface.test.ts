import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveProtectedRoute } from './protected-route-policy';

const apiSource = readFileSync(new URL('./account-profile-api.ts', import.meta.url), 'utf8');
const panelSource = readFileSync(new URL('../components/account-profile-panel.tsx', import.meta.url), 'utf8');
const pageSource = readFileSync(new URL('../app/[locale]/account/profile/page.tsx', import.meta.url), 'utf8');
const proxySource = readFileSync(new URL('../app/api/authed/[...segments]/route.ts', import.meta.url), 'utf8');
const accountPageSource = readFileSync(new URL('../app/[locale]/account/page.tsx', import.meta.url), 'utf8');

assert.match(apiSource, /\/v1\/account\/profile/);
assert.match(apiSource, /\/v1\/account\/export/);
assert.match(apiSource, /\/v1\/account\/closure/);
assert.match(apiSource, /avatar\/upload/);
assert.match(panelSource, /Email and phone are never exposed by the public profile/);
assert.match(panelSource, /Download account export/);
assert.match(panelSource, /Delete personal account data/);
assert.match(panelSource, /2 MiB/);
assert.match(pageSource, /AccountProfilePanel/);
assert.match(accountPageSource, /account\/profile/);
assert.match(proxySource, /profileAvatarMaximumRequestBodyBytes = 2 \* 1024 \* 1024/);
assert.match(proxySource, /route\.path === '\/v1\/account\/profile\/avatar'/);

for (const path of [
  ['v1', 'account', 'profile'],
  ['v1', 'account', 'profile', 'avatar'],
  ['v1', 'account', 'export']
]) {
  assert.ok(resolveProtectedRoute('GET', path, new URLSearchParams()));
}
for (const path of [
  ['v1', 'account', 'profile'],
  ['v1', 'account', 'profile', 'avatar', 'upload'],
  ['v1', 'account', 'profile', 'avatar', 'delete'],
  ['v1', 'account', 'closure']
]) {
  assert.ok(resolveProtectedRoute('POST', path, new URLSearchParams()));
}

console.log('Web account profile lifecycle surface tests passed.');
