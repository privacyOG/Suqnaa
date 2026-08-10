import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const json = (path) => JSON.parse(read(path));
const exists = (path) => existsSync(new URL(path, root));

const en = json('apps/mobile/store/metadata/en.json');
const ar = json('apps/mobile/store/metadata/ar.json');
const applePrivacy = json('apps/mobile/store/privacy/app-store-privacy.json');
const playSafety = json('apps/mobile/store/privacy/google-play-data-safety.json');
const screenshots = json('apps/mobile/store/screenshots/manifest.json');
const readiness = json('apps/mobile/store/review/readiness.json');
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

assert.equal(screenshots.status, 'capture_required');
assert.equal(screenshots.sets.length, 4);
for (const set of screenshots.sets) {
  assert.ok(['ios', 'android'].includes(set.platform));
  assert.ok(['en', 'ar'].includes(set.locale));
  assert.equal(set.required, true);
  assert.ok(set.files.length >= 5 && set.files.length <= 10);
  const orders = new Set();
  for (const image of set.files) {
    assert.equal(image.status, 'missing');
    assert.match(image.file, new RegExp(`^${set.platform}/${set.locale}/`));
    assert.match(image.file, /\.png$/);
    assert.ok(!orders.has(image.order));
    orders.add(image.order);
  }
}
assert.ok(screenshots.captureRules.some((rule) => /no real user personal information/i.test(rule)));
assert.ok(screenshots.captureRules.some((rule) => /Arabic\/RTL/i.test(rule)));

assert.equal(readiness.status, 'not_ready_for_public_submission');
assert.equal(readiness.productionIdentifiers.androidPackage, 'co.privacyx.suqnaa');
assert.equal(readiness.productionIdentifiers.iosBundleId, 'co.privacyx.suqnaa');
assert.equal(readiness.reviewAccess.credentialsStoredInRepository, false);
assert.ok(readiness.submissionBlockers.some((blocker) => blocker.id === 'legal_approval' && blocker.status === 'blocked'));
assert.ok(readiness.submissionBlockers.some((blocker) => blocker.id === 'screenshots' && blocker.status === 'blocked'));
assert.ok(readiness.submissionBlockers.some((blocker) => blocker.id === 'store_console_configuration' && blocker.status === 'external'));
assert.ok(readiness.submissionBlockers.some((blocker) => blocker.id === 'review_credentials' && blocker.status === 'external'));

const trackedText = [JSON.stringify(en), JSON.stringify(ar), JSON.stringify(applePrivacy), JSON.stringify(playSafety), JSON.stringify(readiness)].join('\n');
assert.doesNotMatch(trackedText, /password\s*[:=]\s*["'][^"']+/i);
assert.doesNotMatch(trackedText, /BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY/);
assert.ok(exists('apps/web/app/[locale]/account-deletion/page.tsx'));

console.log('Mobile store readiness package passed.');
