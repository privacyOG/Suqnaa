import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const json = (path) => JSON.parse(read(path));

const requiredFiles = [
  'apps/web/app/accessibility.css',
  'apps/web/app/[locale]/layout.tsx',
  'apps/mobile/lib/l10n/app_en.arb',
  'apps/mobile/lib/l10n/app_ar.arb'
];
for (const path of requiredFiles) {
  assert.ok(existsSync(new URL(path, root)), `Missing accessibility/localization file: ${path}`);
}

const accessibilityCss = read('apps/web/app/accessibility.css');
const localeLayout = read('apps/web/app/[locale]/layout.tsx');

for (const requiredPattern of [
  /:focus-visible/,
  /min-block-size:\s*44px/,
  /prefers-reduced-motion:\s*reduce/,
  /\[dir='rtl'\]/,
  /Noto Sans Arabic/,
  /@media \(max-width:\s*720px\)/
]) {
  assert.match(accessibilityCss, requiredPattern);
}
assert.match(localeLayout, /className="skip-link"/);
assert.match(localeLayout, /href="#main-content"/);
assert.match(localeLayout, /انتقل إلى المحتوى الرئيسي/);
assert.match(localeLayout, /id="main-content"/);
assert.match(localeLayout, /tabIndex=\{-1\}/);

const enArb = json('apps/mobile/lib/l10n/app_en.arb');
const arArb = json('apps/mobile/lib/l10n/app_ar.arb');
const publicKeys = (value) => Object.keys(value).filter((key) => !key.startsWith('@')).sort();
assert.deepEqual(publicKeys(arArb), publicKeys(enArb), 'Flutter EN/AR message keys must remain in parity');

const placeholderNames = (value) => [...String(value).matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((match) => match[1]).sort();
for (const key of publicKeys(enArb)) {
  assert.equal(typeof enArb[key], 'string', `English Flutter message ${key} must be a string`);
  assert.equal(typeof arArb[key], 'string', `Arabic Flutter message ${key} must be a string`);
  assert.ok(enArb[key].trim().length > 0, `English Flutter message ${key} is empty`);
  assert.ok(arArb[key].trim().length > 0, `Arabic Flutter message ${key} is empty`);
  assert.deepEqual(placeholderNames(arArb[key]), placeholderNames(enArb[key]), `Placeholder mismatch for Flutter message ${key}`);
}

function objectKeysFromTs(source) {
  return [...source.matchAll(/^\s{2,}([A-Za-z_$][A-Za-z0-9_$]*):/gm)].map((match) => match[1]);
}
const webEnKeys = objectKeysFromTs(read('apps/web/i18n/messages/en.ts'));
const webArKeys = objectKeysFromTs(read('apps/web/i18n/messages/ar.ts'));
assert.deepEqual(webArKeys, webEnKeys, 'Web EN/AR message object structure must remain in parity');

const arabicScript = /[\u0600-\u06FF]/;
const arabicValues = publicKeys(arArb).map((key) => arArb[key]);
assert.ok(arabicValues.filter((value) => arabicScript.test(value)).length >= Math.floor(arabicValues.length * 0.8), 'Arabic Flutter catalogue must remain predominantly Arabic-script content');

console.log(`P1-13 accessibility/localization contract passed (${publicKeys(enArb).length} Flutter messages; ${webEnKeys.length} web translation keys).`);
