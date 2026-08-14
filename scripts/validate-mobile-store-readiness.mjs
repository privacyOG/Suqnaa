import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const json = (path) => JSON.parse(read(path));
const exists = (path) => existsSync(new URL(path, root));

execFileSync(process.execPath, ['scripts/reconcile-mobile-store-screenshots.mjs', '--check'], {
  cwd: new URL('.', root),
  stdio: 'inherit'
});

const en = json('apps/mobile/store/metadata/en.json');
const ar = json('apps/mobile/store/metadata/ar.json');
const applePrivacy = json('apps/mobile/store/privacy/app-store-privacy.json');
const playSafety = json('apps/mobile/store/privacy/google-play-data-safety.json');
const screenshots = json('apps/mobile/store/screenshots/manifest.json');
const readiness = json('apps/mobile/store/review/readiness.json');
const contentRating = json('apps/mobile/store/review/content-rating.json');
const compliance = json('apps/mobile/store/review/compliance.json');
const reviewerNotes = json('apps/mobile/store/review/reviewer-notes.json');
const submissionEvidence = json('apps/mobile/store/review/submission-evidence.json');
const legal = read('apps/web/lib/legal-policy-content.ts');
const deletionPage = read('apps/web/app/[locale]/account-deletion/page.tsx');
const pubspec = read('apps/mobile/pubspec.yaml');

for (const metadata of [en, ar]) {
  assert.equal(typeof metadata.appName, 'string');
  assert.ok(metadata.appName.length > 0 && metadata.appName.length <= 30);
  assert.equal(typeof metadata.subtitle, 'string');
  assert.ok(metadata.subtitle.length > 0 && metadata.subtitle.length <= 30);
  assert.ok(metadata.shortDescription.length > 0);
  assert.ok(metadata.fullDescription.length > metadata.shortDescription.length);
  assert.equal(metadata.legalApprovalStatus, 'blocked_pending_p0_31');
  for (const key of ['supportUrl', 'privacyPolicyUrl', 'accountDeletionUrl', 'marketingUrl']) {
    const url = new URL(metadata[key]);
    assert.equal(url.protocol, 'https:');
    assert.equal(url.hostname, 'suqnaa.com');
  }
}
assert.equal(en.locale, 'en-AU');
assert.equal(ar.locale, 'ar');
assert.equal(en.privacyPolicyUrl, 'https://suqnaa.com/en/policy/privacy');
assert.equal(en.supportUrl, 'https://suqnaa.com/en/policy/contact');
assert.equal(en.accountDeletionUrl, 'https://suqnaa.com/en/account-deletion');
assert.equal(ar.privacyPolicyUrl, 'https://suqnaa.com/ar/policy/privacy');
assert.equal(ar.supportUrl, 'https://suqnaa.com/ar/policy/contact');
assert.equal(ar.accountDeletionUrl, 'https://suqnaa.com/ar/account-deletion');

assert.match(deletionPage, /Profile and privacy/);
assert.match(deletionPage, /account-deletion/);
assert.match(deletionPage, /policy\/data-retention/);
assert.match(deletionPage, /policy\/privacy/);
assert.match(deletionPage, /Pending legal approval|final legal approval/);

assert.match(legal, /reviewStatus: 'pending_legal_review'/);
assert.match(legal, /effectiveDate: null/);

assert.equal(applePrivacy.status, 'candidate_pending_legal_review');
assert.equal(applePrivacy.tracking, false);
assert.equal(applePrivacy.trackingSdkPresent, false);
assert.equal(applePrivacy.thirdPartyAdvertising, false);
assert.ok(applePrivacy.dataTypes.length >= 8);
assert.ok(applePrivacy.dataTypes.some((entry) => entry.type === 'user_content.other_user_content'));
assert.ok(applePrivacy.dataTypes.some((entry) => entry.type === 'purchases.purchase_history'));
assert.ok(applePrivacy.dataTypes.some((entry) => entry.type === 'financial_info.payment_info'));

assert.equal(playSafety.status, 'candidate_pending_legal_review');
assert.equal(playSafety.collectsData, true);
assert.equal(playSafety.dataEncryptedInTransit, true);
assert.equal(playSafety.accountDeletionAvailable, true);
assert.equal(playSafety.accountDeletionUrl, en.accountDeletionUrl);
assert.equal(playSafety.trackingOrAdvertising, false);
assert.ok(playSafety.categories.some((entry) => entry.category === 'messages'));
assert.ok(playSafety.categories.some((entry) => entry.category === 'financial_info'));

for (const prohibitedSdk of ['firebase_analytics', 'google_mobile_ads', 'appsflyer', 'adjust_sdk']) {
  assert.doesNotMatch(pubspec, new RegExp(prohibitedSdk, 'i'));
}

assert.ok(['capture_required', 'captured_complete'].includes(screenshots.status));
assert.equal(screenshots.sets.length, 4);
let capturedCount = 0;
let requiredCount = 0;
for (const set of screenshots.sets) {
  assert.ok(['ios', 'android'].includes(set.platform));
  assert.ok(['en', 'ar'].includes(set.locale));
  assert.equal(set.required, true);
  assert.ok(set.files.length >= 5 && set.files.length <= 10);
  const orders = new Set();
  for (const image of set.files) {
    requiredCount += 1;
    assert.ok(['missing', 'captured'].includes(image.status));
    assert.match(image.file, new RegExp(`^${set.platform}/${set.locale}/`));
    assert.match(image.file, /\.png$/);
    assert.ok(!orders.has(image.order));
    orders.add(image.order);
    if (image.status === 'captured') {
      capturedCount += 1;
      assert.ok(Number.isInteger(image.width) && image.width >= 720);
      assert.ok(Number.isInteger(image.height) && image.height >= 1280);
      assert.ok(image.height > image.width);
      assert.match(image.sha256, /^[a-f0-9]{64}$/);
      assert.ok(exists(`apps/mobile/store/screenshots/${image.file}`));
    } else {
      assert.equal(image.width, undefined);
      assert.equal(image.height, undefined);
      assert.equal(image.sha256, undefined);
    }
  }
}
assert.equal(screenshots.capturedCount, capturedCount);
assert.equal(screenshots.requiredCount, requiredCount);
assert.equal(screenshots.status, capturedCount === requiredCount ? 'captured_complete' : 'capture_required');
assert.ok(screenshots.captureRules.some((rule) => /no real user personal information/i.test(rule)));
assert.ok(screenshots.captureRules.some((rule) => /Arabic\/RTL/i.test(rule)));
assert.ok(screenshots.captureRules.some((rule) => /SHA-256/i.test(rule)));

assert.equal(contentRating.status, 'candidate_requires_store_console_confirmation');
assert.equal(contentRating.appleAgeRating.userGeneratedContent, true);
assert.equal(contentRating.appleAgeRating.messagingOrChat, true);
assert.equal(contentRating.appleAgeRating.gambling, false);
assert.equal(contentRating.googlePlayContentRating.userGeneratedContent, true);
assert.equal(contentRating.googlePlayContentRating.userInteraction, true);
assert.equal(contentRating.googlePlayContentRating.digitalPurchases, false);
assert.equal(contentRating.googlePlayContentRating.physicalGoodsCommerce, true);
assert.equal(contentRating.reviewRequiredBeforeSubmission, true);

assert.equal(compliance.status, 'candidate_requires_operator_confirmation');
assert.equal(compliance.encryption.usesHttpsTls, true);
assert.equal(compliance.encryption.usesPlatformSecureStorage, true);
assert.equal(compliance.encryption.customCryptographicAlgorithmImplementedByApp, false);
assert.equal(compliance.encryption.exportComplianceOperatorReviewRequired, true);
assert.equal(compliance.commerce.physicalGoodsMarketplace, true);
assert.equal(compliance.commerce.digitalContentSoldForInAppConsumption, false);
assert.equal(compliance.commerce.storeBillingRequiredForCurrentMarketplaceTransactions, false);
assert.equal(compliance.accounts.inAppAccountDeletionAvailable, true);
assert.equal(compliance.accounts.reviewCredentialsExternalOnly, true);
assert.equal(compliance.moderation.userGeneratedListings, true);
assert.equal(compliance.moderation.userMessaging, true);
assert.equal(compliance.moderation.reportingControls, true);

assert.equal(reviewerNotes.status, 'template_requires_external_credentials');
assert.equal(reviewerNotes.reviewAccount.credentialsStoredInRepository, false);
assert.ok(reviewerNotes.reviewAccount.requiredCapabilities.includes('browse_catalogue'));
assert.ok(reviewerNotes.reviewAccount.requiredCapabilities.includes('open_messages'));
assert.ok(reviewerNotes.reviewAccount.requiredCapabilities.includes('view_test_order'));
assert.ok(reviewerNotes.reviewNotes.some((note) => /real-money purchase/i.test(note)));
assert.ok(reviewerNotes.submissionChecks.some((check) => /Account deletion flow/i.test(check)));

assert.equal(readiness.status, 'not_ready_for_public_submission');
assert.equal(readiness.productionIdentifiers.androidPackage, 'co.privacyx.suqnaa');
assert.equal(readiness.productionIdentifiers.iosBundleId, 'co.privacyx.suqnaa');
assert.equal(readiness.reviewAccess.credentialsStoredInRepository, false);
assert.ok(readiness.submissionBlockers.some((blocker) => blocker.id === 'legal_approval' && blocker.status === 'blocked'));
const screenshotBlocker = readiness.submissionBlockers.find((blocker) => blocker.id === 'screenshots');
assert.ok(screenshotBlocker);
assert.equal(screenshotBlocker.status, screenshots.status === 'captured_complete' ? 'resolved' : 'blocked');
assert.ok(readiness.submissionBlockers.some((blocker) => blocker.id === 'store_console_configuration' && blocker.status === 'external'));
assert.ok(readiness.submissionBlockers.some((blocker) => blocker.id === 'review_credentials' && blocker.status === 'external'));

assert.ok(['incomplete', 'ready'].includes(submissionEvidence.status));
const evidenceById = new Map(submissionEvidence.evidence.map((entry) => [entry.id, entry]));
for (const id of ['legal_approval', 'screenshots', 'privacy_form_reconciliation', 'private_testing', 'store_console_configuration', 'review_credentials']) {
  assert.ok(evidenceById.has(id), `Missing submission evidence item: ${id}`);
}
for (const entry of submissionEvidence.evidence) {
  assert.equal(entry.required, true);
  assert.ok(['pending', 'external', 'approved'].includes(entry.status));
  assert.equal(typeof entry.owner, 'string');
  assert.ok(entry.owner.length > 0);
  if (entry.status === 'approved') {
    assert.equal(typeof entry.evidenceReference, 'string');
    assert.ok(entry.evidenceReference.length > 0);
    assert.match(entry.approvedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/);
  } else {
    assert.equal(entry.approvedAt, null);
  }
}
const screenshotsEvidence = evidenceById.get('screenshots');
assert.equal(screenshotsEvidence.status, screenshots.status === 'captured_complete' ? 'approved' : 'pending');
if (screenshotsEvidence.status === 'approved') {
  assert.equal(screenshotsEvidence.evidenceReference, 'apps/mobile/store/screenshots/manifest.json');
}
const allEvidenceApproved = submissionEvidence.evidence.every((entry) => !entry.required || entry.status === 'approved');
assert.equal(submissionEvidence.status, allEvidenceApproved ? 'ready' : 'incomplete');
if (submissionEvidence.status === 'ready') {
  assert.equal(readiness.status, 'ready_for_public_submission');
} else {
  assert.equal(readiness.status, 'not_ready_for_public_submission');
}

const trackedText = [
  JSON.stringify(en),
  JSON.stringify(ar),
  JSON.stringify(applePrivacy),
  JSON.stringify(playSafety),
  JSON.stringify(readiness),
  JSON.stringify(contentRating),
  JSON.stringify(compliance),
  JSON.stringify(reviewerNotes),
  JSON.stringify(submissionEvidence)
].join('\n');
assert.doesNotMatch(trackedText, /password\s*[:=]\s*["'][^"']+/i);
assert.doesNotMatch(trackedText, /BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY/);
assert.ok(exists('apps/web/app/[locale]/account-deletion/page.tsx'));
assert.ok(exists('apps/mobile/store/review/content-rating.json'));
assert.ok(exists('apps/mobile/store/review/compliance.json'));
assert.ok(exists('apps/mobile/store/review/reviewer-notes.json'));
assert.ok(exists('apps/mobile/store/review/submission-evidence.json'));
assert.ok(exists('scripts/reconcile-mobile-store-screenshots.mjs'));

console.log('Mobile store readiness package passed.');
