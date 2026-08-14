import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const json = (path) => JSON.parse(read(path));

function filesUnder(relativeDir, suffix) {
  const base = new URL(relativeDir, root);
  const output = [];
  const visit = (url, relative) => {
    for (const entry of readdirSync(url)) {
      const child = new URL(`${entry}${statSync(new URL(entry, url)).isDirectory() ? '/' : ''}`, url);
      const childRelative = `${relative}${entry}`;
      if (statSync(child).isDirectory()) visit(child, `${childRelative}/`);
      else if (childRelative.endsWith(suffix)) output.push(`${relativeDir}${childRelative}`);
    }
  };
  visit(base, '');
  return output;
}

function extractBalancedCall(source, callName, fromIndex) {
  const start = source.indexOf(`${callName}(`, fromIndex);
  if (start < 0) return null;
  const open = start + callName.length;
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === '(') depth += 1;
    if (char === ')') {
      depth -= 1;
      if (depth === 0) return { start, end: index + 1, text: source.slice(start, index + 1) };
    }
  }
  throw new Error(`Unbalanced ${callName} call near character ${start}`);
}

const authScreens = [
  'apps/mobile/lib/src/features/account/sign_in_screen.dart',
  'apps/mobile/lib/src/features/account/account_login_screen.dart',
  'apps/mobile/lib/src/features/account/register_screen.dart'
];
const requiredFiles = [
  'apps/web/app/accessibility.css',
  'apps/web/app/[locale]/layout.tsx',
  'apps/mobile/lib/src/app_root.dart',
  ...authScreens,
  'apps/mobile/lib/l10n/app_en.arb',
  'apps/mobile/lib/l10n/app_ar.arb',
  'docs/ACCESSIBILITY_LOCALIZATION.md'
];
for (const path of requiredFiles) {
  assert.ok(existsSync(new URL(path, root)), `Missing accessibility/localization file: ${path}`);
}

const accessibilityCss = read('apps/web/app/accessibility.css');
const localeLayout = read('apps/web/app/[locale]/layout.tsx');
const mobileRoot = read('apps/mobile/lib/src/app_root.dart');

for (const requiredPattern of [
  /:focus-visible/,
  /min-block-size:\s*44px/,
  /prefers-reduced-motion:\s*reduce/,
  /\[dir='rtl'\]/,
  /Noto Sans Arabic/,
  /@media \(max-width:\s*720px\)/
]) assert.match(accessibilityCss, requiredPattern);

assert.match(localeLayout, /className="skip-link"/);
assert.match(localeLayout, /href="#main-content"/);
assert.match(localeLayout, /انتقل إلى المحتوى الرئيسي/);
assert.match(localeLayout, /id="main-content"/);
assert.match(localeLayout, /tabIndex=\{-1\}/);

assert.match(mobileRoot, /materialTapTargetSize:\s*MaterialTapTargetSize\.padded/);
assert.match(mobileRoot, /visualDensity:\s*VisualDensity\.standard/);
assert.match(mobileRoot, /Semantics\(/);
assert.match(mobileRoot, /liveRegion:\s*true/);
assert.match(mobileRoot, /ExcludeSemantics\(/);
assert.match(mobileRoot, /جارٍ استعادة جلسة سوقنا/);
assert.doesNotMatch(mobileRoot, /textScaler\s*:/, 'Do not clamp or replace the operating-system Flutter text scaler');

for (const path of authScreens) {
  const source = read(path);
  assert.match(source, /Localizations\.localeOf\(context\)\.languageCode\s*==\s*'ar'/, `${path} must select Arabic UI copy`);
  assert.match(source, /[\u0600-\u06FF]{3,}/, `${path} must contain Arabic user-facing copy`);
  assert.match(source, /Semantics\([\s\S]*?liveRegion:\s*true/, `${path} must announce asynchronous form errors`);
  assert.match(source, /tooltip:[\s\S]*?إظهار كلمة المرور/, `${path} must localize password visibility semantics`);
}

const mobileSources = filesUnder('apps/mobile/lib/src/', '.dart');
const unlabeledIconButtons = [];
for (const path of mobileSources) {
  const source = read(path);
  let cursor = 0;
  while (true) {
    const call = extractBalancedCall(source, 'IconButton', cursor);
    if (!call) break;
    if (!/\btooltip\s*:/.test(call.text)) {
      const line = source.slice(0, call.start).split('\n').length;
      unlabeledIconButtons.push(`${path}:${line}`);
    }
    cursor = call.end;
  }
}
assert.deepEqual(unlabeledIconButtons, [], `Every Flutter IconButton must expose an accessible tooltip. Missing: ${unlabeledIconButtons.join(', ')}`);

const webSources = [
  ...filesUnder('apps/web/app/', '.tsx'),
  ...filesUnder('apps/web/components/', '.tsx')
];
const rawClickTargets = [];
for (const path of webSources) {
  const source = read(path);
  for (const match of source.matchAll(/<(div|span)\b[^>]*\bonClick\s*=/g)) {
    const line = source.slice(0, match.index).split('\n').length;
    rawClickTargets.push(`${path}:${line}`);
  }
}
assert.deepEqual(rawClickTargets, [], `Use native keyboard-operable controls instead of clickable div/span elements. Found: ${rawClickTargets.join(', ')}`);

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

console.log(`P1-13 accessibility/localization contract passed (${publicKeys(enArb).length} Flutter messages; ${webEnKeys.length} web translation keys; ${mobileSources.length} mobile source files; ${webSources.length} web TSX files).`);
