import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const outputDir = join(root, 'build', 'mobile-store-submission');
const readJson = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'));

const evidence = readJson('apps/mobile/store/review/submission-evidence.json');
const screenshots = readJson('apps/mobile/store/screenshots/manifest.json');
const testing = readJson('apps/mobile/store/review/testing-tracks.json');
const consoleHandoff = readJson('apps/mobile/store/review/store-console-handoff.json');
const privacy = readJson('apps/mobile/store/privacy/production-inventory.json');
const reviewer = readJson('apps/mobile/store/review/reviewer-access.json');

const pendingEvidence = evidence.evidence.filter((item) => item.required && item.status !== 'approved');
const pendingScreenshots = screenshots.sets.flatMap((set) =>
  set.screenshots
    .filter((shot) => shot.status !== 'captured')
    .map((shot) => `${set.platform}/${set.locale}/${shot.id}`)
);
const pendingTracks = testing.tracks.filter((track) => track.required && track.status !== 'passed');
const pendingConsole = Object.entries(consoleHandoff.platforms).flatMap(([platform, config]) =>
  config.requiredActions
    .filter((action) => action.status !== 'approved')
    .map((action) => `${platform}:${action.id}`)
);
const pendingProviders = privacy.productionServiceClasses.filter(
  (service) => service.required && !service.providerFinalized
);
const pendingReviewerCapabilities = reviewer.requiredCapabilities.filter(
  (capability) => capability.status !== 'approved'
);

const ready =
  evidence.status === 'ready' &&
  pendingEvidence.length === 0 &&
  screenshots.status === 'captured_complete' &&
  pendingScreenshots.length === 0 &&
  testing.status === 'passed' &&
  testing.releaseBlockingDefectsOpen === false &&
  pendingTracks.length === 0 &&
  consoleHandoff.status === 'complete' &&
  pendingConsole.length === 0 &&
  privacy.status === 'reconciled' &&
  pendingProviders.length === 0 &&
  reviewer.status === 'approved' &&
  pendingReviewerCapabilities.length === 0;

const report = {
  schemaVersion: 1,
  generatedFromRepositoryState: true,
  readyForPublicSubmission: ready,
  evidence: {
    approved: evidence.evidence.filter((item) => item.required && item.status === 'approved').map((item) => item.id),
    outstanding: pendingEvidence.map((item) => ({ id: item.id, status: item.status, owner: item.owner, notes: item.notes }))
  },
  screenshots: {
    status: screenshots.status,
    captured: screenshots.capturedCount,
    required: screenshots.requiredCount,
    outstanding: pendingScreenshots
  },
  privateTesting: {
    status: testing.status,
    releaseBlockingDefectsOpen: testing.releaseBlockingDefectsOpen,
    outstandingTracks: pendingTracks.map((track) => ({ id: track.id, platform: track.platform, status: track.status }))
  },
  storeConsole: {
    status: consoleHandoff.status,
    outstandingActions: pendingConsole
  },
  privacyReconciliation: {
    status: privacy.status,
    outstandingProviders: pendingProviders.map((service) => ({ id: service.id, purpose: service.purpose }))
  },
  reviewerAccess: {
    status: reviewer.status,
    provisioningEvidenceReference: reviewer.reviewAccount.provisioningEvidenceReference,
    outstandingCapabilities: pendingReviewerCapabilities.map((capability) => capability.id)
  }
};

mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, 'readiness-report.json'), `${JSON.stringify(report, null, 2)}\n`);

const lines = [
  '# Suqnaa mobile store readiness report',
  '',
  `Public submission ready: ${ready ? 'YES' : 'NO'}`,
  '',
  `Required evidence outstanding: ${pendingEvidence.length}`,
  `Screenshots: ${screenshots.capturedCount}/${screenshots.requiredCount}`,
  `Private testing tracks outstanding: ${pendingTracks.length}`,
  `Store-console actions outstanding: ${pendingConsole.length}`,
  `Production providers awaiting finalization: ${pendingProviders.length}`,
  `Reviewer capabilities outstanding: ${pendingReviewerCapabilities.length}`,
  ''
];
for (const item of pendingEvidence) lines.push(`- ${item.id}: ${item.status} — ${item.notes}`);
writeFileSync(join(outputDir, 'READINESS.md'), `${lines.join('\n')}\n`);

console.log(`Built mobile store readiness report (${ready ? 'ready' : `${pendingEvidence.length} evidence classes outstanding`}).`);
