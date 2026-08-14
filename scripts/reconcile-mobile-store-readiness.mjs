import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path) => readFileSync(`${root}/${path}`, 'utf8');
const json = (path) => JSON.parse(read(path));

const readiness = json('apps/mobile/store/review/readiness.json');
const evidence = json('apps/mobile/store/review/submission-evidence.json');
const screenshots = json('apps/mobile/store/screenshots/manifest.json');
const testing = json('apps/mobile/store/review/testing-tracks.json');
const consoleHandoff = json('apps/mobile/store/review/store-console-handoff.json');
const privacyInventory = json('apps/mobile/store/privacy/production-inventory.json');
const reviewerAccess = json('apps/mobile/store/review/reviewer-access.json');
const legalPolicySource = read('apps/web/lib/legal-policy-content.ts');

const evidenceById = new Map(evidence.evidence.map((item) => [item.id, item]));
const requiredEvidence = evidence.evidence.filter((item) => item.required);
const allEvidenceApproved = requiredEvidence.every((item) =>
  item.status === 'approved' &&
  typeof item.evidenceReference === 'string' &&
  item.evidenceReference.trim().length > 0 &&
  typeof item.approvedAt === 'string' &&
  !Number.isNaN(Date.parse(item.approvedAt))
);

const legalApproved =
  !legalPolicySource.includes("reviewStatus: 'pending_legal_review'") &&
  !legalPolicySource.includes('effectiveDate: null');
const screenshotsApproved = screenshots.status === 'captured_complete';
const privacyApproved =
  privacyInventory.status === 'reconciled' &&
  privacyInventory.productionServiceClasses.every((service) => !service.required || service.providerFinalized === true);
const testingApproved =
  testing.status === 'passed' &&
  testing.releaseBlockingDefectsOpen === false &&
  testing.tracks.every((track) => !track.required || track.status === 'passed');
const consoleApproved =
  consoleHandoff.status === 'complete' &&
  Object.values(consoleHandoff.platforms).every((platform) =>
    platform.requiredActions.every((action) => action.status === 'approved')
  );
const reviewerApproved =
  reviewerAccess.status === 'approved' &&
  reviewerAccess.credentialsStoredInRepository === false &&
  reviewerAccess.requiredCapabilities.every((capability) => capability.status === 'approved');

const derived = {
  legal_approval: legalApproved,
  screenshots: screenshotsApproved,
  privacy_form_reconciliation: privacyApproved,
  private_testing: testingApproved,
  store_console_configuration: consoleApproved,
  review_credentials: reviewerApproved
};

for (const [id, approved] of Object.entries(derived)) {
  const item = evidenceById.get(id);
  assert.ok(item, `Missing required evidence item: ${id}`);
  if (item.status === 'approved') {
    assert.equal(approved, true, `${id} is marked approved but its underlying contract is not complete`);
  }
}

const underlyingReady = Object.values(derived).every(Boolean);
assert.equal(
  evidence.status === 'ready',
  allEvidenceApproved,
  'submission-evidence status must be derived from all required evidence approvals'
);
assert.equal(
  readiness.status === 'ready_for_public_submission',
  allEvidenceApproved && underlyingReady,
  'review/readiness status must agree with underlying evidence contracts'
);

if (!underlyingReady) {
  assert.equal(readiness.status, 'not_ready_for_public_submission');
  assert.equal(evidence.status, 'incomplete');
}

console.log(
  `Mobile store readiness reconciliation passed (${Object.entries(derived).filter(([, value]) => value).length}/${Object.keys(derived).length} underlying contracts complete).`
);
