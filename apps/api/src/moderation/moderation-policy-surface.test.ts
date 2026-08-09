import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../../../../infra/db/migrations/035_moderation_policy.sql', import.meta.url), 'utf8');
const service = readFileSync(new URL('./moderation-policy-service.ts', import.meta.url), 'utf8');
const publicationHook = readFileSync(new URL('./listing-publication-hook.ts', import.meta.url), 'utf8');
const legacyQueueHook = readFileSync(new URL('./legacy-queue-moderation-hook.ts', import.meta.url), 'utf8');
const routes = readFileSync(new URL('../routes/moderation.ts', import.meta.url), 'utf8');
const participantRoutes = readFileSync(new URL('../routes/moderation-participant.ts', import.meta.url), 'utf8');
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
assert.match(migration, /moderation_actions_report_unique/);

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

assert.match(publicationHook, /body\?\.status !== 'active'/);
assert.match(publicationHook, /evaluateListingModerationPolicy/);
assert.match(publicationHook, /listing_policy_blocked/);
assert.match(publicationHook, /createPolicyListingReview/);
assert.match(publicationHook, /reply\.code\(202\)/);
assert.match(publicationHook, /listing\.seller_id !== auth\.user\.sub/);

assert.match(legacyQueueHook, /applyListingModerationAction/);
assert.match(legacyQueueHook, /applyAccountModerationAction/);
assert.match(legacyQueueHook, /report\.queue_action/);
assert.match(legacyQueueHook, /legacy_listing_state_retired/);
assert.match(legacyQueueHook, /legacy_account_reactivation_retired/);
assert.match(legacyQueueHook, /durableModeration: true/);
assert.match(legacyQueueHook, /recordQueueAudit/);

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
assert.match(participantRoutes, /\/market\/moderation\/actions/);
assert.match(participantRoutes, /listing_seller_id/);
assert.match(participantRoutes, /appealDeadline/);
assert.doesNotMatch(participantRoutes, /evidence_snapshot/);
assert.doesNotMatch(participantRoutes, /moderation_notes/);
assert.match(routes, /addModeratorNote/);
assert.match(routes, /decideModerationAppeal/);
assert.match(routes, /reconcileModerationEvidenceRetention/);
assert.match(server, /enforceSellerListingPublicationPolicy/);
assert.match(server, /interceptLegacyQueueModeration/);
assert.match(server, /app\.addHook\('preHandler', enforceSellerListingPublicationPolicy\)/);
assert.match(server, /app\.addHook\('preHandler', interceptLegacyQueueModeration\)/);
assert.match(server, /moderationRoutes/);
assert.match(server, /moderationParticipantRoutes/);

console.log('Moderation policy surface passed.');
