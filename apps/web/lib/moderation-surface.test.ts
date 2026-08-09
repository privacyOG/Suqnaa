import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveProtectedRoute } from './protected-route-policy';

const page = readFileSync(new URL('../app/[locale]/operations/moderation/page.tsx', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../components/operations-moderation-panel.tsx', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('../app/[locale]/operations/page.tsx', import.meta.url), 'utf8');
const accountPage = readFileSync(new URL('../app/[locale]/account/page.tsx', import.meta.url), 'utf8');
const participantPage = readFileSync(new URL('../app/[locale]/account/moderation/page.tsx', import.meta.url), 'utf8');
const participantPanel = readFileSync(new URL('../components/moderation-appeals-panel.tsx', import.meta.url), 'utf8');
const participantServer = readFileSync(new URL('./moderation-participant-server.ts', import.meta.url), 'utf8');

const id = '123e4567-e89b-42d3-a456-426614174000';

assert.ok(resolveProtectedRoute('GET', ['v1', 'operations', 'moderation', 'policy-rules'], new URLSearchParams()));
assert.ok(resolveProtectedRoute('GET', ['v1', 'operations', 'moderation', 'actions'], new URLSearchParams('limit=100')));
assert.ok(resolveProtectedRoute('GET', ['v1', 'operations', 'moderation', 'appeals'], new URLSearchParams('status=open&limit=100')));
assert.ok(resolveProtectedRoute('GET', ['v1', 'market', 'moderation', 'appeals'], new URLSearchParams()));
assert.ok(resolveProtectedRoute('POST', ['v1', 'operations', 'moderation', 'policy-rules'], new URLSearchParams()));
assert.ok(resolveProtectedRoute('POST', ['v1', 'operations', 'moderation', 'policy-rules', id, 'status'], new URLSearchParams()));
assert.ok(resolveProtectedRoute('POST', ['v1', 'operations', 'moderation', 'listings', id, 'action'], new URLSearchParams()));
assert.ok(resolveProtectedRoute('POST', ['v1', 'operations', 'moderation', 'accounts', id, 'action'], new URLSearchParams()));
assert.ok(resolveProtectedRoute('POST', ['v1', 'operations', 'moderation', 'actions', id, 'notes'], new URLSearchParams()));
assert.ok(resolveProtectedRoute('POST', ['v1', 'operations', 'moderation', 'appeals', id, 'decision'], new URLSearchParams()));
assert.ok(resolveProtectedRoute('POST', ['v1', 'operations', 'moderation', 'reconcile-retention'], new URLSearchParams()));
assert.ok(resolveProtectedRoute('POST', ['v1', 'market', 'moderation', 'actions', id, 'appeal'], new URLSearchParams()));
assert.equal(resolveProtectedRoute('POST', ['v1', 'operations', 'moderation', 'listings', 'not-a-uuid', 'action'], new URLSearchParams()), null);
assert.equal(resolveProtectedRoute('GET', ['v1', 'operations', 'moderation', 'actions'], new URLSearchParams('redirect=https%3A%2F%2Fexample.com')), null);

assert.match(page, /Moderation centre/);
assert.match(page, /OperationsModerationPanel/);
assert.match(dashboard, /operations\/moderation/);
assert.match(panel, /moderation\.policy\.manage/);
assert.match(panel, /moderation\.listing\.manage/);
assert.match(panel, /moderation\.account\.manage/);
assert.match(panel, /moderation\.appeal\.review/);
assert.match(panel, /Approve listing/);
assert.match(panel, /Take down listing/);
assert.match(panel, /Suspend account/);
assert.match(panel, /Close account/);
assert.match(panel, /reconcile-retention/);
assert.match(panel, /policy-rules/);
assert.match(panel, /appeals\/\$\{appeal\.id\}\/decision/);

assert.match(accountPage, /account\/moderation/);
assert.match(participantPage, /Moderation actions and appeals/);
assert.match(participantPage, /loadParticipantModerationActions/);
assert.match(participantPanel, /Submit appeal/);
assert.match(participantPanel, /\/api\/authed\/v1\/market\/moderation\/actions\/\$\{actionId\}\/appeal/);
assert.match(participantPanel, /reason\.length < 8/);
assert.match(participantServer, /\/v1\/market\/moderation\/actions/);
assert.match(participantServer, /cache: 'no-store'/);

console.log('Moderation web surface passed.');
