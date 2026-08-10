import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const manifestUrl = new URL('apps/mobile/store/screenshots/manifest.json', root);
const screenshotRoot = new URL('apps/mobile/store/screenshots/', root);
const checkOnly = process.argv.includes('--check');

const original = JSON.parse(readFileSync(manifestUrl, 'utf8'));
const manifest = structuredClone(original);

function inspectPng(fileUrl) {
  const bytes = readFileSync(fileUrl);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.ok(bytes.length >= 33, `Screenshot is too small to be a valid PNG: ${fileUrl.pathname}`);
  assert.ok(bytes.subarray(0, 8).equals(signature), `Screenshot is not a PNG: ${fileUrl.pathname}`);
  assert.equal(bytes.toString('ascii', 12, 16), 'IHDR', `PNG is missing IHDR: ${fileUrl.pathname}`);

  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  assert.ok(width >= 720, `Screenshot width must be at least 720px: ${fileUrl.pathname}`);
  assert.ok(height >= 1280, `Screenshot height must be at least 1280px: ${fileUrl.pathname}`);
  assert.ok(height > width, `Store screenshot must be portrait: ${fileUrl.pathname}`);

  return {
    width,
    height,
    sha256: createHash('sha256').update(bytes).digest('hex')
  };
}

let captured = 0;
let required = 0;

for (const set of manifest.sets) {
  for (const image of set.files) {
    if (set.required) required += 1;
    const fileUrl = new URL(image.file, screenshotRoot);
    if (!existsSync(fileUrl)) {
      image.status = 'missing';
      delete image.width;
      delete image.height;
      delete image.sha256;
      continue;
    }

    const details = inspectPng(fileUrl);
    image.status = 'captured';
    image.width = details.width;
    image.height = details.height;
    image.sha256 = details.sha256;
    captured += 1;
  }
}

manifest.status = captured === required && required > 0 ? 'captured_complete' : 'capture_required';
manifest.capturedCount = captured;
manifest.requiredCount = required;

if (checkOnly) {
  assert.deepStrictEqual(
    original,
    manifest,
    'Screenshot manifest is stale. Run `node scripts/reconcile-mobile-store-screenshots.mjs` after adding, replacing, or removing store screenshots.'
  );
  console.log(`Store screenshot manifest is reconciled (${captured}/${required} captured).`);
} else {
  writeFileSync(manifestUrl, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Updated store screenshot manifest (${captured}/${required} captured).`);
}
