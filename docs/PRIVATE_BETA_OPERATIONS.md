# Private beta operations readiness

This document is the operational contract for launch gate **L-02 Private beta**. It connects the production-readiness controls already implemented in the repository to the human operating process required before controlled external test users are admitted.

The private beta is **not** authorised merely because this document exists. Repository-verifiable readiness and external sign-off are separate gates. Legal/policy review, operator training completion, and real controlled test-user acceptance must be evidenced by real people and must never be fabricated from CI.

## Current gate state

- Repository implementation: `ready-for-private-beta-exercises`
- Operations training completion: `pending-external-evidence`
- Support process: `repository-ready`
- Backup and restore controls: `repository-ready`
- Monitoring and alerting controls: `repository-ready`
- Incident-response controls: `repository-ready`
- Policy review: `pending-external-evidence`
- Controlled test-user acceptance: `pending-external-evidence`
- L-02 overall: `blocked-on-external-evidence`

L-02 may be marked complete only after every external item above has genuine dated evidence and all repository gates remain green on the release candidate.

## Canonical technical runbooks

Operators must use the existing repository controls rather than creating ad-hoc procedures:

- `docs/STAGING_SMOKE.md` — production-like deployed marketplace smoke journey.
- `docs/BACKUP_RESTORE.md` — encrypted database/object-storage backups and restore drill.
- `docs/OBSERVABILITY.md` — structured logs, metrics, dashboards, alerts, traces and privacy-safe retention.
- `docs/DEPLOYMENT_RELIABILITY.md` — health checks, migration/rollback policy, incident response and operator escalation.
- `docs/SECURITY_OPERATIONS.md` — secret rotation, security review and incident-sensitive handling.
- `docs/P0_31_LEGAL_REVIEW_HANDOFF.md` — legal and Arabic policy-review handoff. This remains an external-review dependency.

The private-beta coordinator must stop the beta if any canonical runbook conflicts with this document; the stricter safety/privacy requirement wins until the conflict is resolved in the repository.

## Operations training

Before an operator receives private-beta production access, a real trainer or accountable operator must confirm that the person can perform the following without exposing credentials or customer data:

1. Read API readiness/liveness signals and distinguish application failure from dependency degradation.
2. Use dashboards and privacy-safe logs without copying full request bodies, session material, addresses, payment credentials or verification documents into tickets/chat.
3. Classify support cases and escalate security, payment, moderation, dispute and privacy incidents correctly.
4. Execute the documented low-risk rollback path and identify when rollback is unsafe because a migration or external provider side effect has occurred.
5. Verify encrypted backup freshness and run the documented staging restore drill without mounting private decryption material into normal production services.
6. Rotate a file-backed secret using the documented process and verify dependent-service recovery.
7. Suspend or narrow beta access when abuse, reliability, legal or privacy conditions require it.
8. Preserve evidence during an incident and avoid destructive troubleshooting.

Training must include at least one tabletop scenario covering a failed deployment, one suspected account-takeover or credential incident, and one payment/dispute escalation. Completion must be recorded outside secret-bearing logs with date, trainer/reviewer, trainees, scenarios exercised, findings and remediation owner. A privacy-safe summary may be committed later as evidence; credentials, private customer data and exploit-sensitive details must never be committed.

## Support process

All beta support requests enter a single controlled queue owned by the beta operations team. Do not use personal DMs as the system of record.

### Severity model

| Severity | Example | Initial handling target | Required action |
| --- | --- | --- | --- |
| SEV-1 | active data exposure, account takeover campaign, payment integrity failure, broad marketplace outage | immediate | incident commander, contain access/traffic, preserve evidence, security/privacy/payment escalation as applicable |
| SEV-2 | major feature unavailable for multiple testers, repeated order/payment/fulfilment failure, serious abuse report | 1 hour | assign owner, mitigate, open incident record, decide whether cohort access must be reduced |
| SEV-3 | individual workflow defect with workaround, isolated moderation/support case | 1 business day | triage, reproduce with synthetic/redacted data, schedule fix or documented resolution |
| SEV-4 | usability question, minor copy/layout issue, feature feedback | 2 business days | record, categorise, acknowledge, route to backlog/QA |

Targets are operational objectives for the controlled beta, not contractual customer SLAs.

Every support record must contain a privacy-safe case ID, category, severity, timestamps, owner, affected feature, reproduction using synthetic/redacted data where possible, disposition and any linked incident/engineering issue. Never paste passwords, refresh/access tokens, private keys, full payment credentials, identity documents, precise private addresses or raw production database rows into a support ticket.

Support categories must at minimum distinguish: account/security, listing/media, messaging, offer/order, payment, fulfilment, dispute/return, moderation/abuse, privacy/data request, accessibility/localisation, and reliability.

## Backup readiness

Before admitting the first external beta cohort and after any material backup-system change:

- confirm scheduled encrypted backups are running;
- confirm the latest complete backup set is within the configured recovery window;
- confirm the decryption identity is not mounted into the scheduled backup service;
- run the documented staging restore drill and record the result;
- run the production-like staging marketplace smoke journey after restoration when the release candidate changes backup/database behaviour;
- record backup/restore failures as at least SEV-2 until recoverability is restored.

CI restore success proves mechanics only. It does not replace human ownership, retention review, off-site/key-custody review or release-candidate restore evidence.

## Monitoring cadence

During the controlled beta, the operator on duty reviews the privacy-safe dashboards at cohort start and at least once each operating day. Alerts remain the primary mechanism for urgent failures; manual review is a supplement, not a substitute.

At minimum review:

- API availability/readiness, error rate and latency;
- database, Redis/queue and object-storage health;
- worker failures/backlog and durable notification-delivery failures;
- authentication/session anomalies and abuse/risk signals;
- payment-event verification failures, order/payment state divergence and settlement-disabled assumptions;
- moderation/dispute queue age;
- backup freshness and latest restore-drill status;
- web/mobile release errors relevant to the active cohort.

A beta reliability note should record material alerts, known degradations, open incidents and whether the cohort remains safe to continue. Do not turn monitoring notes into a secondary store of customer data.

## Incident response during beta

`docs/DEPLOYMENT_RELIABILITY.md` is the canonical incident runbook. For the beta specifically:

1. classify severity and assign an incident commander for SEV-1/SEV-2;
2. protect users first — disable the affected feature/provider, reduce the cohort, or stop the beta when necessary;
3. preserve evidence and rotate/revoke exposed credentials without destroying forensic context;
4. notify privacy/legal/payment/security stakeholders when their threshold is met;
5. communicate to affected testers using the support system of record and only confirmed facts;
6. recover through the documented rollback/restore path;
7. verify recovery with health checks plus the relevant automated journey;
8. complete a post-incident record with root cause, impact, timeline, corrective actions and owner.

No operator may enable live settlement, an unapproved payment/verification provider, or broaden the beta cohort as an incident workaround.

## Policy-review gate

Private-beta policy review remains blocked until the P0-31 English and Arabic policy set has genuine external legal/Arabic review evidence. The handoff is `docs/P0_31_LEGAL_REVIEW_HANDOFF.md`.

A reviewer record must identify the reviewed revision/date and the disposition of material findings. CI cannot approve legal text, Arabic legal equivalence, jurisdictional obligations, privacy notices or consumer/payment terms.

Until that evidence exists, external beta participation must not be represented as final public-launch legal approval. Any controlled test arrangement must use only terms/notices actually approved for that test by the responsible reviewer.

## Controlled test-user acceptance

Acceptance must be performed by real invited test users against the controlled beta environment. Synthetic CI journeys such as L-01 are prerequisites but do not count as human acceptance.

### Cohort controls

- invite-only accounts; no unrestricted public signup for the beta cohort;
- documented cohort owner and maximum cohort size;
- approved payment/verification configuration only; live settlement remains disabled unless separately approved;
- a tested method to revoke or suspend cohort access;
- testers receive the approved support channel, safety guidance, known limitations and privacy notice applicable to the test;
- no tester is asked to place real sensitive credentials or payment data into screenshots, tickets or survey free text.

### Required acceptance journeys

At minimum the cohort must exercise, on supported web/mobile surfaces as applicable:

1. registration/sign-in/session recovery;
2. create/edit/publish a listing including media;
3. search/discover and view listing details;
4. messaging and abuse/report controls;
5. offer acceptance and order creation;
6. the approved sandbox/test payment path;
7. pickup/shipping fulfilment path selected for the beta;
8. dispute/return/report path;
9. account/profile/privacy controls;
10. English/Arabic and RTL flows included in the beta scope;
11. accessibility-critical journeys for keyboard/screen-reader/mobile semantics where applicable.

### Acceptance exit criteria

Private-beta acceptance can pass only when:

- there are no unresolved SEV-1 issues;
- there are no unresolved SEV-2 issues without an explicit written go/no-go risk acceptance by the accountable owner;
- every required journey has at least one successful real-user result on each in-scope client class;
- support intake/escalation has been exercised by at least one real case or controlled drill;
- monitoring, backup and incident-response owners confirm readiness;
- policy/legal review requirements applicable to the beta are signed off;
- all findings are recorded with owner and disposition.

The acceptance record must be dated and identify cohort/reviewer roles without committing unnecessary personal data. Aggregate counts and privacy-safe issue references are preferred.

## Go/no-go checklist

Immediately before opening the private beta, record a dated decision confirming:

- release candidate SHA and successful required CI/preflight gates;
- successful production-like Staging Smoke on that candidate or its verified ancestor where no relevant paths changed;
- operator training evidence exists;
- support queue/channel and escalation ownership are active;
- backup freshness and staging restore evidence are current;
- dashboards/alerts are reachable by the operator on duty;
- incident commander/escalation path is known;
- required policy review evidence exists;
- controlled test-user acceptance evidence exists;
- cohort/payment/verification feature scope is explicitly limited and reversible.

Any unchecked item is a **no-go** unless the tracker explicitly defines it as deferred for that launch stage. L-02 itself cannot be checked while policy review or real test-user acceptance remains pending.
