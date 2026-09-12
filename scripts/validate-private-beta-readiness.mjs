import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const requiredFiles = [
  'docs/PRIVATE_BETA_OPERATIONS.md',
  'docs/STAGING_SMOKE.md',
  'docs/BACKUP_RESTORE.md',
  'docs/OBSERVABILITY.md',
  'docs/DEPLOYMENT_RELIABILITY.md',
  'docs/SECURITY_OPERATIONS.md',
  'docs/P0_31_LEGAL_REVIEW_HANDOFF.md',
  '.github/workflows/staging-smoke.yml',
];

for (const path of requiredFiles) {
  assert.ok(existsSync(path), `private-beta readiness requires ${path}`);
}

const contract = readFileSync('docs/PRIVATE_BETA_OPERATIONS.md', 'utf8');

const requiredContractMarkers = [
  'Operations training completion: `pending-external-evidence`',
  'Support process: `repository-ready`',
  'Backup and restore controls: `repository-ready`',
  'Monitoring and alerting controls: `repository-ready`',
  'Incident-response controls: `repository-ready`',
  'Policy review: `pending-external-evidence`',
  'Controlled test-user acceptance: `pending-external-evidence`',
  'L-02 overall: `blocked-on-external-evidence`',
  'Synthetic CI journeys such as L-01 are prerequisites but do not count as human acceptance.',
  'CI cannot approve legal text',
  'No operator may enable live settlement',
  'Any unchecked item is a **no-go**',
];

for (const marker of requiredContractMarkers) {
  assert.ok(contract.includes(marker), `private-beta contract is missing required marker: ${marker}`);
}

const canonicalReferences = [
  'docs/STAGING_SMOKE.md',
  'docs/BACKUP_RESTORE.md',
  'docs/OBSERVABILITY.md',
  'docs/DEPLOYMENT_RELIABILITY.md',
  'docs/SECURITY_OPERATIONS.md',
  'docs/P0_31_LEGAL_REVIEW_HANDOFF.md',
];

for (const reference of canonicalReferences) {
  assert.ok(contract.includes(reference), `private-beta contract must reference ${reference}`);
}

assert.match(contract, /SEV-1/);
assert.match(contract, /SEV-2/);
assert.match(contract, /support system of record/i);
assert.match(contract, /staging restore drill/i);
assert.match(contract, /monitoring cadence/i);
assert.match(contract, /controlled test-user acceptance/i);
assert.match(contract, /English\/Arabic and RTL/i);
assert.match(contract, /real invited test users/i);

const stagingWorkflow = readFileSync('.github/workflows/staging-smoke.yml', 'utf8');
assert.match(stagingWorkflow, /name:\s*Staging Smoke/);
assert.match(stagingWorkflow, /Run deployed marketplace smoke journey/);
assert.match(stagingWorkflow, /Tear down ephemeral staging/);

const backup = readFileSync('docs/BACKUP_RESTORE.md', 'utf8');
assert.match(backup, /Staging restore drill/i);

const observability = readFileSync('docs/OBSERVABILITY.md', 'utf8');
assert.match(observability, /alert/i);
assert.match(observability, /retention/i);

const reliability = readFileSync('docs/DEPLOYMENT_RELIABILITY.md', 'utf8');
assert.match(reliability, /incident response/i);
assert.match(reliability, /rollback/i);

const security = readFileSync('docs/SECURITY_OPERATIONS.md', 'utf8');
assert.match(security, /secret rotation/i);
assert.match(security, /security review/i);

const legalHandoff = readFileSync('docs/P0_31_LEGAL_REVIEW_HANDOFF.md', 'utf8');
assert.match(legalHandoff, /review/i);
assert.match(legalHandoff, /Arabic/i);

console.log('Private-beta repository readiness contract validated. External training, policy review and real-user acceptance remain explicit blockers.');
