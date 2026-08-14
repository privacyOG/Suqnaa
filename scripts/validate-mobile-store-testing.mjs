import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const json = (path) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));

const tracks = json('apps/mobile/store/review/testing-tracks.json');
const evidence = json('apps/mobile/store/review/submission-evidence.json');

assert.equal(tracks.schemaVersion, 1);
assert.ok(['not_started', 'in_progress', 'blocked', 'passed'].includes(tracks.status));
assert.equal(typeof tracks.releaseBlockingDefectsOpen, 'boolean');
assert.ok(Array.isArray(tracks.tracks));
assert.equal(tracks.tracks.length, 4);

const requiredKeys = new Set([
  'android:internal',
  'android:closed',
  'ios:testflight_internal',
  'ios:testflight_external'
]);
const seen = new Set();
const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

for (const track of tracks.tracks) {
  const key = `${track.platform}:${track.track}`;
  assert.ok(requiredKeys.has(key), `Unexpected private testing track: ${key}`);
  assert.ok(!seen.has(key), `Duplicate private testing track: ${key}`);
  seen.add(key);
  assert.equal(track.required, true);
  assert.ok(tracks.allowedStatuses.includes(track.status));

  if (track.status === 'not_configured') {
    assert.equal(track.buildReference, null);
    assert.equal(track.evidenceReference, null);
    assert.equal(track.startedAt, null);
    assert.equal(track.passedAt, null);
  }

  if (['testing', 'passed', 'blocked'].includes(track.status)) {
    assert.equal(typeof track.buildReference, 'string');
    assert.ok(track.buildReference.length > 0);
    assert.match(track.startedAt, iso);
  }

  if (track.status === 'passed') {
    assert.equal(typeof track.evidenceReference, 'string');
    assert.ok(track.evidenceReference.length > 0);
    assert.match(track.passedAt, iso);
    assert.ok(Date.parse(track.passedAt) >= Date.parse(track.startedAt));
  } else {
    assert.equal(track.passedAt, null);
  }
}
assert.deepEqual(seen, requiredKeys);

const allPassed = tracks.tracks.every((track) => !track.required || track.status === 'passed');
const expectedStatus = allPassed && !tracks.releaseBlockingDefectsOpen
  ? 'passed'
  : tracks.tracks.some((track) => track.status === 'blocked')
    ? 'blocked'
    : tracks.tracks.some((track) => ['configured', 'testing', 'passed'].includes(track.status))
      ? 'in_progress'
      : 'not_started';
assert.equal(tracks.status, expectedStatus);

const privateEvidence = evidence.evidence.find((entry) => entry.id === 'private_testing');
assert.ok(privateEvidence, 'submission evidence must include private_testing');
if (tracks.status === 'passed') {
  assert.equal(privateEvidence.status, 'approved');
  assert.equal(privateEvidence.evidenceReference, 'apps/mobile/store/review/testing-tracks.json');
  assert.match(privateEvidence.approvedAt, iso);
} else {
  assert.notEqual(privateEvidence.status, 'approved');
  assert.equal(privateEvidence.approvedAt, null);
}

console.log(`Mobile private testing contract passed (${tracks.status}).`);
