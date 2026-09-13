import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const json = (path) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));

const handoff = json('apps/mobile/store/review/store-console-handoff.json');
const evidence = json('apps/mobile/store/review/submission-evidence.json');

assert.equal(handoff.schemaVersion, 1);
assert.ok(['operator_action_required', 'complete'].includes(handoff.status));
assert.equal(handoff.platforms.apple.bundleId, 'co.privacyx.suqnaa');
assert.equal(handoff.platforms.googlePlay.packageName, 'co.privacyx.suqnaa');
assert.match(handoff.secretBoundary, /Never place store passwords/i);

const allowedStatuses = new Set(['pending', 'approved']);
let approved = 0;
let required = 0;
for (const [platformName, platform] of Object.entries(handoff.platforms)) {
  assert.ok(Array.isArray(platform.requiredActions) && platform.requiredActions.length >= 6, `${platformName} must declare all required store-console actions`);
  const ids = new Set();
  for (const action of platform.requiredActions) {
    required += 1;
    assert.equal(typeof action.id, 'string');
    assert.ok(action.id.length > 0);
    assert.ok(!ids.has(action.id), `Duplicate ${platformName} action id: ${action.id}`);
    ids.add(action.id);
    assert.ok(allowedStatuses.has(action.status), `Invalid status for ${platformName}/${action.id}`);
    assert.equal(action.evidenceRequired, true);
    assert.equal(typeof action.evidenceDescription, 'string');
    assert.ok(action.evidenceDescription.length >= 30);
    if (action.status === 'approved') {
      approved += 1;
      assert.equal(typeof action.evidenceReference, 'string');
      assert.ok(action.evidenceReference.trim().length > 0);
      assert.match(action.approvedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/);
    } else {
      assert.ok(action.evidenceReference == null);
      assert.ok(action.approvedAt == null);
    }
  }
}

const complete = approved === required && required > 0;
assert.equal(handoff.status, complete ? 'complete' : 'operator_action_required');

const storeConsoleEvidence = evidence.evidence.find((entry) => entry.id === 'store_console_configuration');
assert.ok(storeConsoleEvidence, 'submission-evidence.json must contain store_console_configuration');
assert.equal(storeConsoleEvidence.status, complete ? 'approved' : 'external');
if (complete) {
  assert.equal(storeConsoleEvidence.evidenceReference, 'apps/mobile/store/review/store-console-handoff.json');
  assert.match(storeConsoleEvidence.approvedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/);
} else {
  assert.equal(storeConsoleEvidence.approvedAt, null);
}

const tracked = JSON.stringify(handoff);
assert.doesNotMatch(tracked, /password\s*[:=]\s*["'][^"']+/i);
assert.doesNotMatch(tracked, /BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY/);
assert.doesNotMatch(tracked, /api[_-]?key\s*[:=]\s*["'][^"']+/i);

console.log(`Mobile store-console handoff passed (${approved}/${required} actions approved).`);
