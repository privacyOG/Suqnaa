import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const apiSource = readFileSync(new URL('./account-verification-api.ts', import.meta.url), 'utf8');
const panelSource = readFileSync(new URL('../components/account-verification-panel.tsx', import.meta.url), 'utf8');
const accountSource = readFileSync(new URL('../app/[locale]/account/page.tsx', import.meta.url), 'utf8');
const registrationSource = readFileSync(new URL('../components/account-auth-form.tsx', import.meta.url), 'utf8');

assert.match(apiSource, /getAuthed.*\/v1\/account\/verification/s);
assert.match(apiSource, /postAuthed\('\/v1\/account\/verification\/request'/);
assert.match(apiSource, /postAuthed\('\/v1\/account\/verification\/confirm'/);
assert.match(panelSource, /autoComplete="one-time-code"/);
assert.match(panelSource, /pattern="\[0-9\]\{6\}"/);
assert.match(panelSource, /Send verification code/);
assert.match(panelSource, /إرسال رمز التحقق/);
assert.match(panelSource, /fetch\('\/api\/session\/refresh'/);
assert.match(accountSource, /account\/verify/);
assert.match(registrationSource, /mode === 'register' \? `\/\$\{locale\}\/account\/verify`/);

console.log('Web account verification surface tests passed.');
