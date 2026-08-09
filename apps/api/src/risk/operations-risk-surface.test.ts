import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const operationsRoutes = readFileSync(new URL('../routes/operations-risk.ts', import.meta.url), 'utf8');
const operationsAuth = readFileSync(new URL('../auth/require-operations-user.ts', import.meta.url), 'utf8');
const authRoutes = readFileSync(new URL('../routes/auth.ts', import.meta.url), 'utf8');
const fraudHook = readFileSync(new URL('./fraud-dashboard-hook.ts', import.meta.url), 'utf8');
const identityReconciliation = readFileSync(new URL('./risk-identity-reconciliation.ts', import.meta.url), 'utf8');
const sellerReconciliation = readFileSync(new URL('./seller-adverse-outcome-reconciliation.ts', import.meta.url), 'utf8');
const server = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../../../infra/db/migrations/036_marketplace_risk_rules.sql', import.meta.url), 'utf8');

assert.match(operationsAuth, /operations\\\/risk\\\/rules[\s\S]*permission: 'risk\.read'/);
assert.match(operationsAuth, /operations\\\/risk\\\/rules[\s\S]*permission: 'risk\.manage'/);
assert.match(operationsAuth, /operations\\\/risk\\\/signals[\s\S]*permission: 'risk\.read'/);
assert.match(operationsAuth, /operations\\\/risk\\\/signals[\s\S]*review[\s\S]*permission: 'risk\.review'/);
assert.match(operationsAuth, /reconcile-sources[\s\S]*permission: 'risk\.manage'/);
assert.match(operationsAuth, /dashboard\\\/fraud[\s\S]*permission: 'risk\.read'/);

assert.match(operationsRoutes, /risk\.rule_create/);
assert.match(operationsRoutes, /risk\.signal_review/);
assert.match(operationsRoutes, /where\('status', '=', 'open'\)/);
assert.match(operationsRoutes, /risk\.source_reconcile/);
assert.match(operationsRoutes, /reconcileRiskIdentitySources/);
assert.match(operationsRoutes, /reconcileSellerAdverseOutcomes/);
assert.match(operationsRoutes, /risk\.observation_retention_reconcile/);
assert.match(operationsRoutes, /where\('retain_until', '<=', now\)/);
assert.doesNotMatch(operationsRoutes, /updateTable\('users'\)/);
assert.doesNotMatch(operationsRoutes, /updateTable\('listings'\)/);
assert.doesNotMatch(operationsRoutes, /updateTable\('payment_intents'\)/);
assert.doesNotMatch(operationsRoutes, /updateTable\('seller_settlements'\)/);

assert.match(identityReconciliation, /createHash\('sha256'\)/);
assert.match(identityReconciliation, /identityType: 'verification_subject'/);
assert.match(identityReconciliation, /identityType: 'payout_account'/);
assert.doesNotMatch(identityReconciliation, /identityHash: .*reference\b/);
assert.match(sellerReconciliation, /observeMarketplaceRiskEvent/);
assert.match(sellerReconciliation, /buyer_refund/);
assert.match(sellerReconciliation, /partial_refund/);
assert.match(sellerReconciliation, /refund_requested/);
assert.match(sellerReconciliation, /protection_escalated/);
assert.match(sellerReconciliation, /payout\.failed/);
assert.match(sellerReconciliation, /transfer\.reversed/);
assert.match(sellerReconciliation, /sourceEventId:/);

const missingAccountBranch = authRoutes.indexOf("if (!user?.password_hash)");
const passwordCheck = authRoutes.indexOf('const valid = await verifyPassword', missingAccountBranch);
const failedPasswordBranch = authRoutes.indexOf('if (!valid)', passwordCheck);
const riskObservation = authRoutes.indexOf("eventType: 'account.login_failed'", failedPasswordBranch);
assert.ok(missingAccountBranch >= 0 && passwordCheck > missingAccountBranch && failedPasswordBranch > passwordCheck && riskObservation > failedPasswordBranch);
const unknownCredentialSlice = authRoutes.slice(missingAccountBranch, passwordCheck);
assert.doesNotMatch(unknownCredentialSlice, /account\.login_failed/);
assert.doesNotMatch(authRoutes, /evidence:\s*\{[^}]*email/i);
assert.doesNotMatch(authRoutes, /evidence:\s*\{[^}]*phone/i);
assert.match(authRoutes, /sourceEventId: `login-failed:\$\{randomUUID\(\)\}`/);
assert.match(authRoutes, /return reply\.code\(401\)\.send\(\{ error: 'Invalid credentials' \}\)/);

assert.match(fraudHook, /persisted_risk_signals/);
assert.match(fraudHook, /automatedRiskRules: true/);
assert.match(fraudHook, /permissions\.has\('risk\.read'\)/);
assert.match(server, /serveRiskFraudDashboard/);
assert.match(server, /operationsRiskRoutes/);

assert.match(migration, /CREATE TABLE risk_event_observations/);
assert.match(migration, /retain_until timestamptz NOT NULL DEFAULT \(now\(\) \+ interval '30 days'\)/);
assert.match(migration, /CREATE TABLE risk_signals/);
assert.match(migration, /CREATE TABLE risk_identity_links/);
assert.match(migration, /account\.failed_login_velocity/);
assert.match(migration, /No trigger in this migration/);
