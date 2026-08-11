import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const json = (path) => JSON.parse(read(path));

const inventory = json('apps/mobile/store/privacy/production-inventory.json');
const apple = json('apps/mobile/store/privacy/app-store-privacy.json');
const play = json('apps/mobile/store/privacy/google-play-data-safety.json');
const evidence = json('apps/mobile/store/review/submission-evidence.json');
const pubspec = read('apps/mobile/pubspec.yaml');

assert.equal(inventory.schemaVersion, 1);
assert.ok(['candidate_requires_final_provider_confirmation', 'reconciled'].includes(inventory.status));

const dependencyBlock = pubspec.match(/dependencies:\n([\s\S]*?)\ndev_dependencies:/)?.[1];
assert.ok(dependencyBlock, 'Could not parse pubspec dependency block');
const dependencyNames = [...dependencyBlock.matchAll(/^  ([a-zA-Z0-9_]+):/gm)]
  .map((match) => match[1])
  .filter((name) => !['flutter', 'flutter_localizations'].includes(name))
  .sort();
const inventoriedDependencies = inventory.mobileDependencies.map((entry) => entry.package).sort();
assert.deepEqual(
  inventoriedDependencies,
  dependencyNames,
  'Every non-SDK mobile runtime dependency must be represented exactly once in the privacy production inventory'
);

const dependencyEntries = new Map(inventory.mobileDependencies.map((entry) => [entry.package, entry]));
for (const [name, entry] of dependencyEntries) {
  assert.equal(typeof entry.classification, 'string', `${name} requires a classification`);
  assert.equal(typeof entry.networkCapable, 'boolean', `${name} requires networkCapable`);
  assert.equal(typeof entry.collectsUserData, 'boolean', `${name} requires collectsUserData`);
  assert.equal(typeof entry.disclosureImpact, 'string', `${name} requires disclosureImpact`);
}
assert.equal(dependencyEntries.get('http')?.networkCapable, true);
assert.equal(dependencyEntries.get('image_picker')?.collectsUserData, true);
assert.equal(dependencyEntries.get('flutter_secure_storage')?.networkCapable, false);

const prohibitedPackagePatterns = [/firebase_analytics/i, /google_mobile_ads/i, /appsflyer/i, /adjust[_-]?sdk/i, /facebook.*app.*events/i];
for (const pattern of prohibitedPackagePatterns) {
  assert.doesNotMatch(pubspec, pattern, `Unreviewed analytics/advertising/attribution dependency detected: ${pattern}`);
}
for (const capability of ['advertising_sdk', 'cross_app_tracking_sdk', 'marketing_attribution_sdk', 'production_analytics_sdk']) {
  assert.ok(inventory.prohibitedUntilPrivacyReview.includes(capability));
}

assert.equal(apple.tracking, false);
assert.equal(apple.trackingSdkPresent, false);
assert.equal(apple.thirdPartyAdvertising, false);
assert.equal(play.trackingOrAdvertising, false);
assert.equal(play.collectsData, true);
assert.equal(play.dataEncryptedInTransit, true);
assert.equal(play.accountDeletionAvailable, true);

const appleTypes = new Set(apple.dataTypes.filter((entry) => entry.collected).map((entry) => entry.type));
for (const required of [
  'contact_info.email_address',
  'contact_info.phone_number',
  'location.coarse_location',
  'user_content.photos',
  'user_content.other_user_content',
  'purchases.purchase_history',
  'financial_info.payment_info',
  'identifiers.user_id',
  'usage_data.product_interaction',
  'diagnostics.other_diagnostic_data',
  'sensitive_info.identity_verification_status'
]) {
  assert.ok(appleTypes.has(required), `Apple privacy declaration missing ${required}`);
}

const playCategories = new Set(play.categories.filter((entry) => entry.collected).map((entry) => entry.category));
for (const required of ['personal_info', 'financial_info', 'messages', 'photos_and_videos', 'app_activity', 'device_or_other_ids', 'app_info_and_performance']) {
  assert.ok(playCategories.has(required), `Google Play Data safety declaration missing ${required}`);
}

const requiredServiceIds = [
  'suqnaa_api',
  'payment_and_payout_provider',
  'identity_verification_provider',
  'communications_providers',
  'object_storage_and_cdn',
  'operational_observability'
];
const serviceById = new Map(inventory.productionServiceClasses.map((entry) => [entry.id, entry]));
for (const id of requiredServiceIds) {
  const service = serviceById.get(id);
  assert.ok(service, `Missing production service class: ${id}`);
  assert.equal(service.required, true);
  assert.equal(typeof service.providerFinalized, 'boolean');
  assert.ok(Array.isArray(service.dataClasses) && service.dataClasses.length > 0);
}

const allProvidersFinalized = inventory.productionServiceClasses
  .filter((entry) => entry.required)
  .every((entry) => entry.providerFinalized === true);
assert.equal(inventory.status, allProvidersFinalized ? 'reconciled' : 'candidate_requires_final_provider_confirmation');

const privacyEvidence = evidence.evidence.find((entry) => entry.id === 'privacy_form_reconciliation');
assert.ok(privacyEvidence, 'Missing privacy_form_reconciliation submission evidence');
if (privacyEvidence.status === 'approved') {
  assert.equal(inventory.status, 'reconciled');
  assert.equal(privacyEvidence.evidenceReference, 'apps/mobile/store/privacy/production-inventory.json');
  assert.match(privacyEvidence.approvedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/);
} else {
  assert.ok(['pending', 'external'].includes(privacyEvidence.status));
  assert.equal(privacyEvidence.approvedAt, null);
}

console.log(
  `Mobile privacy reconciliation inventory passed (${inventory.mobileDependencies.length} runtime dependencies, ` +
  `${inventory.productionServiceClasses.filter((entry) => entry.providerFinalized).length}/${inventory.productionServiceClasses.length} service classes finalized).`
);
