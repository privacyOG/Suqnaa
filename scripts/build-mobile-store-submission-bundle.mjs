import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const outputRoot = join(root, 'build', 'mobile-store-submission');

const sourceFiles = [
  'apps/mobile/store/metadata/en.json',
  'apps/mobile/store/metadata/ar.json',
  'apps/mobile/store/privacy/app-store-privacy.json',
  'apps/mobile/store/privacy/google-play-data-safety.json',
  'apps/mobile/store/review/content-rating.json',
  'apps/mobile/store/review/compliance.json',
  'apps/mobile/store/review/readiness.json',
  'apps/mobile/store/review/reviewer-notes.json',
  'apps/mobile/store/review/submission-evidence.json',
  'apps/mobile/store/review/testing-tracks.json',
  'apps/mobile/store/screenshots/manifest.json'
];

const readText = (path) => readFileSync(join(root, path), 'utf8');
const readJson = (path) => JSON.parse(readText(path));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const en = readJson(sourceFiles[0]);
const ar = readJson(sourceFiles[1]);
const applePrivacy = readJson(sourceFiles[2]);
const playSafety = readJson(sourceFiles[3]);
const contentRating = readJson(sourceFiles[4]);
const compliance = readJson(sourceFiles[5]);
const readiness = readJson(sourceFiles[6]);
const reviewerNotes = readJson(sourceFiles[7]);
const evidence = readJson(sourceFiles[8]);
const testingTracks = readJson(sourceFiles[9]);
const screenshots = readJson(sourceFiles[10]);

const requiredEvidence = evidence.evidence.filter((item) => item.required);
const approvedEvidence = requiredEvidence.filter((item) => item.status === 'approved');
const submissionAllowed =
  evidence.status === 'ready' &&
  readiness.status === 'ready_for_public_submission' &&
  testingTracks.status === 'passed' &&
  testingTracks.releaseBlockingDefectsOpen === false &&
  approvedEvidence.length === requiredEvidence.length &&
  screenshots.status === 'captured_complete';

if (submissionAllowed) {
  for (const item of requiredEvidence) {
    assert.equal(item.status, 'approved');
    assert.equal(typeof item.evidenceReference, 'string');
    assert.ok(item.evidenceReference.trim().length > 0);
    assert.ok(!Number.isNaN(Date.parse(item.approvedAt)));
  }
  assert.ok(testingTracks.tracks.every((track) => !track.required || track.status === 'passed'));
}

const sourceHashes = Object.fromEntries(
  sourceFiles.map((path) => [path, sha256(readText(path))])
);

const bundle = {
  schemaVersion: 1,
  bundleType: submissionAllowed ? 'approved_submission' : 'candidate_not_for_public_submission',
  submissionAllowed,
  productionIdentifiers: readiness.productionIdentifiers,
  canonicalUrls: readiness.urls,
  locales: {
    'en-AU': {
      appName: en.appName,
      subtitle: en.subtitle,
      shortDescription: en.shortDescription,
      fullDescription: en.fullDescription,
      keywords: en.keywords,
      proposedPrimaryCategory: en.proposedPrimaryCategory,
      supportUrl: en.supportUrl,
      privacyPolicyUrl: en.privacyPolicyUrl,
      accountDeletionUrl: en.accountDeletionUrl,
      marketingUrl: en.marketingUrl
    },
    ar: {
      appName: ar.appName,
      subtitle: ar.subtitle,
      shortDescription: ar.shortDescription,
      fullDescription: ar.fullDescription,
      keywords: ar.keywords,
      proposedPrimaryCategory: ar.proposedPrimaryCategory,
      supportUrl: ar.supportUrl,
      privacyPolicyUrl: ar.privacyPolicyUrl,
      accountDeletionUrl: ar.accountDeletionUrl,
      marketingUrl: ar.marketingUrl
    }
  },
  apple: {
    privacy: applePrivacy,
    contentRating: contentRating.appleAgeRating,
    reviewerNotes
  },
  googlePlay: {
    dataSafety: playSafety,
    contentRating: contentRating.googlePlayContentRating,
    reviewerNotes
  },
  compliance,
  privateTesting: testingTracks,
  screenshots,
  readiness,
  submissionEvidence: evidence,
  sourceHashes
};

const serialized = `${JSON.stringify(bundle, null, 2)}\n`;
const bundleHash = sha256(serialized);

rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(outputRoot, { recursive: true });
writeFileSync(join(outputRoot, 'submission-bundle.json'), serialized);
writeFileSync(join(outputRoot, 'SHA256SUMS'), `${bundleHash}  submission-bundle.json\n`);
writeFileSync(
  join(outputRoot, 'STATUS.txt'),
  submissionAllowed
    ? 'APPROVED SUBMISSION BUNDLE\nAll required source-controlled readiness evidence is approved. Store-console operators must still verify the live console state before submission.\n'
    : 'CANDIDATE ONLY - NOT FOR PUBLIC STORE SUBMISSION\nOne or more required readiness/evidence conditions remain unresolved.\n'
);

console.log(
  `Built ${bundle.bundleType} mobile store bundle (${approvedEvidence.length}/${requiredEvidence.length} required evidence items approved, testing ${testingTracks.status}, screenshots ${screenshots.capturedCount}/${screenshots.requiredCount}).`
);
