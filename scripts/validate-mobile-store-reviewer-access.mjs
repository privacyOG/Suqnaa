import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const json = (path) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));

const reviewerAccess = json('apps/mobile/store/review/reviewer-access.json');
const submissionEvidence = json('apps/mobile/store/review/submission-evidence.json');
const reviewerNotes = json('apps/mobile/store/review/reviewer-notes.json');

assert.equal(reviewerAccess.schemaVersion, 1);
assert.ok(['external_provisioning_required', 'approved'].includes(reviewerAccess.status));
assert.equal(reviewerAccess.credentialsStoredInRepository, false);
assert.equal(reviewerAccess.reviewAccount.credentialsSuppliedOnlyThroughStoreConsole, true);
assert.equal(reviewerAccess.reviewAccount.requiresRealMoney, false);
assert.equal(reviewerAccess.reviewAccount.requiresRealIdentityDocuments, false);
assert.equal(reviewerNotes.reviewAccount.credentialsStoredInRepository, false);

const expectedCapabilities = new Set([
  'sign_in',
  'browse_catalogue',
  'open_listing_detail',
  'create_or_edit_test_listing',
  'open_messages',
  'exercise_offer_or_order_flow',
  'view_test_order',
  'exercise_fulfilment_flow',
  'exercise_account_deletion_flow'
]);
assert.equal(reviewerAccess.requiredCapabilities.length, expectedCapabilities.size);
for (const capability of reviewerAccess.requiredCapabilities) {
  assert.ok(expectedCapabilities.delete(capability.id), `Unexpected or duplicate reviewer capability: ${capability.id}`);
  assert.ok(['pending', 'approved'].includes(capability.status));
  if (capability.status === 'approved') {
    assert.equal(typeof capability.evidenceReference, 'string');
    assert.ok(capability.evidenceReference.trim().length > 0);
  } else {
    assert.equal(capability.evidenceReference, null);
  }
}
assert.equal(expectedCapabilities.size, 0);

const allCapabilitiesApproved = reviewerAccess.requiredCapabilities.every((item) => item.status === 'approved');
if (reviewerAccess.status === 'approved') {
  assert.equal(allCapabilitiesApproved, true);
  assert.equal(typeof reviewerAccess.reviewAccount.provisioningEvidenceReference, 'string');
  assert.ok(reviewerAccess.reviewAccount.provisioningEvidenceReference.trim().length > 0);
  assert.match(reviewerAccess.reviewAccount.approvedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/);
} else {
  assert.equal(reviewerAccess.reviewAccount.approvedAt, null);
}

const evidence = submissionEvidence.evidence.find((entry) => entry.id === 'review_credentials');
assert.ok(evidence);
if (reviewerAccess.status === 'approved') {
  assert.equal(evidence.status, 'approved');
  assert.equal(evidence.evidenceReference, 'apps/mobile/store/review/reviewer-access.json');
  assert.match(evidence.approvedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/);
} else {
  assert.notEqual(evidence.status, 'approved');
}

const tracked = JSON.stringify(reviewerAccess);
assert.doesNotMatch(tracked, /password\s*[:=]/i);
assert.doesNotMatch(tracked, /one[-_ ]?time\s*(code|password)/i);
assert.doesNotMatch(tracked, /BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY/);

console.log(`Reviewer access evidence contract passed (${reviewerAccess.status}).`);
