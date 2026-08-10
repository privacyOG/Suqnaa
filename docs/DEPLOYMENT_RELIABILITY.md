# Deployment reliability and incident response

This runbook defines the P1-07 deployment, migration, rollback, incident-response, and operator-escalation contract for Suqnaa production and staging.

## Health model

The API exposes three unauthenticated, data-minimising health endpoints:

- `GET /v1/health` remains the compatibility health surface.
- `GET /v1/health/live` proves that the API process can serve HTTP. It does not claim that dependencies are available.
- `GET /v1/health/ready` performs a bounded database probe. It returns HTTP 503 when the API must be removed from service because its durable database dependency is unavailable or the probe exceeds two seconds.

Production Compose uses the readiness endpoint for API health, an internal HTTP probe for the web service, and PID-1 liveness probes for workers. Health endpoints must never expose database URLs, hostnames, credentials, account data, queue contents, object keys, or stack traces.

## Release invariants

Every production release must use immutable image identifiers, preferably registry digests. Record the previous API, web, worker, and migration image identifiers before changing any service.

`deploy/release.sh` performs the baseline Compose release sequence:

1. validate the resolved Compose configuration;
2. pull all candidate application images;
3. run the one-shot migration image and stop immediately if migration fails;
4. start/reconcile API, web, and workers with Compose health waiting enabled;
5. verify API readiness and the web HTTP surface from inside their containers;
6. emit a bounded `deployment_healthy` completion record.

Invoke tracked deployment scripts through Bash so repository file-mode differences cannot alter the operator procedure.

Do not direct traffic to an instance whose readiness probe is failing. A failed health wait is a failed release even if the new containers are still running.

## Zero/low-downtime migration policy

The Compose baseline is a low-downtime deployment target, not a guarantee of mathematically zero interruption. Releases requiring strict zero downtime must use an approved blue/green or rolling orchestrator while preserving the same readiness and migration rules.

Database migrations use an expand/contract policy:

- **Expand release:** add nullable columns, new tables, indexes, or new representations while old application versions remain functional.
- Deploy application code that can read the old and new schema where coexistence is required.
- Backfill large datasets asynchronously and in bounded batches; do not hold a release transaction open for a long table rewrite.
- **Contract release:** remove old columns, constraints, tables, or representations only after at least one subsequent release has stopped using them and the rollback compatibility window has closed.
- Never combine an irreversible/destructive schema contraction with the first application release that stops using that schema.
- Migration files remain append-only. Do not edit a migration that has been applied to any shared environment.
- Migrations must complete before new application instances are declared healthy.
- A migration failure aborts the release. Do not continue with application replacement.

The rollback compatibility window is at least one previously deployed application release. The previous release must remain able to run against the expanded current schema until the next successful release closes that window.

## Application rollback

Use `deploy/rollback.sh` only with the exact previous immutable image identifiers:

```bash
PREVIOUS_API_IMAGE=registry.example/suqnaa-api@sha256:... \
PREVIOUS_WEB_IMAGE=registry.example/suqnaa-web@sha256:... \
PREVIOUS_WORKER_IMAGE=registry.example/suqnaa-worker@sha256:... \
PREVIOUS_MIGRATE_IMAGE=registry.example/suqnaa-migrate@sha256:... \
SUQNAA_ENV_FILE=../.env.production \
SUQNAA_APPLICATION_NETWORK=suqnaa-production-application \
bash deploy/rollback.sh
```

Rollback deliberately sets `SUQNAA_RUN_MIGRATIONS=false`. Do not attempt to reverse an already-applied database migration during the normal application rollback path. The expand/contract policy exists so the previous application can run safely on the current expanded schema.

If a migration itself corrupts or destructively changes production data, stop normal deployment activity and enter the data-recovery incident path. Use the P1-06 encrypted backup/restore runbook rather than improvising reverse SQL against live production.

## Rollback triggers

Rollback the application release when any of the following is attributable to the candidate release and cannot be safely mitigated immediately:

- API readiness repeatedly fails or the web service cannot pass its health check;
- elevated HTTP 5xx rate, severe latency regression, worker crash loop, or queue processing failure crosses the operational alert threshold;
- authentication, checkout/payment, fulfilment, moderation, dispute, settlement, or notification journeys are materially broken;
- a security or privacy regression may expose credentials, personal data, private media, payment state, or authorization boundaries;
- operators cannot explain the failure mode well enough to continue safely.

## Incident severity

Use the following initial severity model:

- **SEV-1:** confirmed or strongly suspected security/privacy breach, incorrect payment/settlement movement, widespread marketplace outage, destructive data loss/corruption, or inability to protect user funds/data. Stop deployment changes, contain the fault, and escalate immediately.
- **SEV-2:** major customer workflow unavailable or materially degraded, sustained readiness/5xx/latency failure, worker/queue outage, or failed deployment requiring rollback. Freeze unrelated releases and assign an incident lead.
- **SEV-3:** localized degradation with a safe workaround and no known security, privacy, payment, or data-integrity impact. Track remediation and escalate if scope grows.

## Operator escalation

Production operator contact details, phone numbers, pager destinations, payment-provider contacts, infrastructure-provider contacts, and legal/privacy contacts are operational secrets and must be maintained outside the repository.

The escalation chain is role-based:

1. **On-call operator** — acknowledges the alert, validates user impact, records the release/image identifiers, and starts containment or rollback.
2. **Incident lead / senior operator** — required for SEV-1/SEV-2, coordinates technical work and prevents conflicting production changes.
3. **Security/privacy owner** — required for suspected account compromise, authorization bypass, secret exposure, personal-data exposure, or malicious activity.
4. **Payments/finance owner** — required for incorrect charge, refund, release, settlement, payout, reconciliation, or provider-signature behaviour.
5. **Legal/compliance owner** — required when the incident may trigger notification, evidence-preservation, regulatory, law-enforcement, or contractual obligations.

If no designated role acknowledges a SEV-1 promptly, escalate to the next available production administrator. Never include credentials, private evidence, payment secrets, full personal data, or access tokens in incident chat/log records.

## Incident operating procedure

1. Declare severity and incident lead.
2. Record UTC start time, current/previous immutable image identifiers, affected environment, and first observed symptom.
3. Stop concurrent production deployments.
4. Check API/web/worker health, dashboards, bounded logs, database/object-storage/queue status, and recent migration result.
5. Contain: disable an affected integration or route where an approved feature flag exists; otherwise rollback the candidate application release.
6. For suspected compromise, preserve evidence and rotate affected credentials through the secret-rotation process; do not destroy forensic data prematurely.
7. For data corruption/loss, stop writes where necessary and use the documented P1-06 recovery procedure against a validated backup.
8. Verify recovery using health checks plus the affected marketplace journey, not health status alone.
9. Monitor after recovery and record the resolution time.
10. Complete a post-incident review with root cause, detection gap, corrective actions, owners, and deadlines. Do not place sensitive customer or secret data in the repository.

## Release evidence

For each production release retain, outside sensitive logs, the source commit, immutable image digests, migration result, deployment start/end timestamps, health result, operator identity, and rollback identifiers. A release is not complete until the health-gated deployment finishes successfully.
