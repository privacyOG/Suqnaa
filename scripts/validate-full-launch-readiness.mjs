import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const requiredFiles = [
  'docs/LAUNCH_READINESS.md',
  'docs/STAGING_SMOKE.md',
  'docs/PERFORMANCE_GATES.md',
  'docs/BACKUP_RESTORE.md',
  'docs/OBSERVABILITY.md',
  'docs/DEPLOYMENT_RELIABILITY.md',
  'docs/SECURITY_OPERATIONS.md',
  'docs/MOBILE_PLATFORM_RELEASES.md',
  'docs/PRIVATE_BETA_OPERATIONS.md',
  'docs/PUBLIC_BETA.md',
  'docs/P0_31_LEGAL_REVIEW_HANDOFF.md',
  'docs/INITIAL_LAUNCH_POLICY.md',
  '.github/workflows/staging-smoke.yml',
  '.github/workflows/launch-performance.yml',
  '.github/workflows/security-adversarial.yml',
];

for (const path of requiredFiles) {
  assert.ok(existsSync(path), `full-launch readiness requires ${path}`);
}

const readiness = readFileSync('docs/LAUNCH_READINESS.md', 'utf8');

const requiredStatusMarkers = [
  'Repository technical controls: `repository-ready`',
  'P0-31 legal/Arabic policy approval: `pending-external-evidence`',
  'P1-11 app-store submission readiness: `pending-external-evidence`',
  'P1-13 manual accessibility/localisation QA: `pending-external-evidence`',
  'P1-14 production analytics: `blocked-pending-privacy-review`',
  'L-01 production-like staging gate: `repository-complete`',
  'L-02 private beta: `pending-external-evidence`',
  'L-03 public beta: `pending-external-evidence`',
  'L-04 overall: `blocked-on-external-evidence`',
  'Any unresolved blocker is a **no-go**.',
];

for (const marker of requiredStatusMarkers) {
  assert.ok(readiness.includes(marker), `launch readiness is missing required status marker: ${marker}`);
}

const canonicalReferences = [
  'docs/STAGING_SMOKE.md',
  'docs/PERFORMANCE_GATES.md',
  'docs/BACKUP_RESTORE.md',
  'docs/OBSERVABILITY.md',
  'docs/DEPLOYMENT_RELIABILITY.md',
  'docs/SECURITY_OPERATIONS.md',
  'docs/MOBILE_PLATFORM_RELEASES.md',
  'docs/PRIVATE_BETA_OPERATIONS.md',
  'docs/PUBLIC_BETA.md',
  'docs/P0_31_LEGAL_REVIEW_HANDOFF.md',
  'docs/INITIAL_LAUNCH_POLICY.md',
];

for (const reference of canonicalReferences) {
  assert.ok(readiness.includes(reference), `launch readiness must reference ${reference}`);
}

const requiredBoundaryMarkers = [
  'CI cannot approve legal text',
  'CI cannot manufacture public-beta evidence',
  'Repository-generated screenshots, metadata and release automation do not substitute for store-console or testing evidence.',
  'Automated accessibility and localisation checks do not substitute',
  'Production analytics must remain absent or disabled until privacy review',
  'one immutable release candidate SHA',
  'merge only with an expected-head guard',
  'not fully launch-approved',
];

for (const marker of requiredBoundaryMarkers) {
  assert.ok(readiness.includes(marker), `launch readiness is missing evidence boundary: ${marker}`);
}

const privateBeta = readFileSync('docs/PRIVATE_BETA_OPERATIONS.md', 'utf8');
assert.ok(privateBeta.includes('L-02 overall: `blocked-on-external-evidence`'));
assert.match(privateBeta, /real invited test users/i);
assert.match(privateBeta, /CI cannot approve legal text/i);

const publicBeta = readFileSync('docs/PUBLIC_BETA.md', 'utf8');
assert.match(publicBeta, /real public-beta launch/i);
assert.match(publicBeta, /human go\/no-go decision/i);
assert.match(publicBeta, /genuine dated operational evidence/i);

const legalHandoff = readFileSync('docs/P0_31_LEGAL_REVIEW_HANDOFF.md', 'utf8');
assert.match(legalHandoff, /external legal approval required/i);
assert.match(legalHandoff, /Arabic/i);
assert.match(legalHandoff, /Do not insert guessed/i);

const staging = readFileSync('docs/STAGING_SMOKE.md', 'utf8');
assert.match(staging, /production-like/i);
assert.match(staging, /smoke/i);

const performance = readFileSync('docs/PERFORMANCE_GATES.md', 'utf8');
assert.match(performance, /launch-blocking performance certification/i);

const backup = readFileSync('docs/BACKUP_RESTORE.md', 'utf8');
assert.match(backup, /restore drill/i);

const observability = readFileSync('docs/OBSERVABILITY.md', 'utf8');
assert.match(observability, /alert/i);

const reliability = readFileSync('docs/DEPLOYMENT_RELIABILITY.md', 'utf8');
assert.match(reliability, /rollback/i);
assert.match(reliability, /incident response/i);

const security = readFileSync('docs/SECURITY_OPERATIONS.md', 'utf8');
assert.match(security, /security review/i);

const mobileReleases = readFileSync('docs/MOBILE_PLATFORM_RELEASES.md', 'utf8');
assert.match(mobileReleases, /signing/i);
assert.match(mobileReleases, /outside the repository/i);

const stagingWorkflow = readFileSync('.github/workflows/staging-smoke.yml', 'utf8');
assert.match(stagingWorkflow, /name:\s*Staging Smoke/);
assert.match(stagingWorkflow, /Run deployed marketplace smoke journey/);

const performanceWorkflow = readFileSync('.github/workflows/launch-performance.yml', 'utf8');
assert.match(performanceWorkflow, /name:\s*Launch Performance/);

const securityWorkflow = readFileSync('.github/workflows/security-adversarial.yml', 'utf8');
assert.match(securityWorkflow, /name:\s*Security Adversarial/);

console.log('Full-launch repository readiness contract validated. L-04 remains blocked until the documented external and human evidence is genuine and complete.');
