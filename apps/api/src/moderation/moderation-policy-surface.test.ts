import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../../infra/db/migrations/035_moderation_policy.sql', import.meta.url), 'utf8');
const service = readFileSync(new URL('./moderation-policy-service.ts', import.meta.url), 'utf8');
const routes = readFileSync(new URL('../routes/moderation.ts', import.meta.url), 'utf8');
const guard = readFileSync(new URL('../auth/require-operations-user.ts', import.meta.url), 'utf8');
const permission = readFileSync(new URL('../auth/require-permission.ts', import.meta.url), 'utf8');
const server = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');

for (const table of ['moderation_policy_rules', 'moderation_actions', 'moderation_notes', 'moderation_appeals']) {
  assert.match(migration, new RegExp(`CREATE TABLE ${table}`));
}
assert.match(migration, /source IN \('policy', 'moderator'\)/);
assert.match(migration, /source = 'policy' AND acted_by IS NULL/);
assert.match(migration, /evidence_snapshot jsonb/);
assert.match(migration, /evidence_purged_at timestamptz/);
assert.match(migration, /moderation_appeals_open_action_unique/);
assert.match(migration, /moderation_actions_listing_review_pending_unique/);

assert.match(permission, /'moderation\.policy\.manage'/);
assert.match(permission, /'moderation\.appeal\.review'/);
assert.match(guard, /moderation\\\/policy-rules/);
assert.match(guard, /permission: 'moderation\.policy\.manage'/);
assert.match(guard, /permission: 'moderation\.appeal\.review'/);
assert.match(guard, /permission: 'moderation\.listing\.manage'/);
assert.match(guard, /permission: 'moderation\.account\.manage'/);

assert.match(service, /evaluateListingModerationPolicy/);
assert.match(service, /createPolicyListingReview/);
assert.match(service, /self_moderation_forbidden/);
assert.match(service, /moderation_action_not_appealable/);
assert.match(service, /moderation_appeal_window_closed/);
assert.match(service, /input\.decision === 'overturn'/);
assert.match(service, /previousStatus/);
assert.match(service, /where\('status', '=', 'open'\)/);
assert.match(service, /evidence_snapshot: null/);
assert.match(service, /evidence_purged_at: now/);
assert.doesNotMatch(service, /deleteFrom\('reports'\)/);
assert.doesNotMatch(service, /deleteFrom\('messages'\)/);

for (const path of [
  '/operations/moderation/policy-rules',
  '/operations/moderation/actions',
  '/operations/moderation/listings/:id/action',
  '/operations/moderation/accounts/:id/action',
  '/operations/moderation/appeals',
  '/operations/moderation/reconcile-retention',
  '/market/moderation/actions/:id/appeal',
  '/market/moderation/appeals'
]) {
  assert.match(routes, new RegExp(path.replace(/[/:]/g, (value) => value === '/' ? '\\/' : value)));
}
assert.match(routes, /addModeratorNote/);
assert.match(routes, /decideModerationAppeal/);
assert.match(routes, /reconcileModerationEvidenceRetention/);
assert.match(server, /moderationRoutes/);
assert.match(server, /app\.register\(moderationRoutes/);

console.log('Moderation policy surface passed.');
