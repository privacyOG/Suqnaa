# Launch readiness

This document is the canonical repository-side reconciliation contract for taking Suqnaa from the current production-ready technical baseline through the remaining human, legal, store, privacy and live-operations launch gates.

It is intentionally conservative: repository automation may prove that technical controls exist and pass, but it must not manufacture legal approval, operator training, accessibility device review, store-console acceptance, provider approval, or real beta evidence.

## Current reconciliation status

Current verified `main` baseline when this contract was created: `a53edb32cacf15289c4ef65eb5d247954162f833` through PR #188.

- Repository technical controls: `repository-ready`
- P0-31 legal/Arabic policy approval: `pending-external-evidence`
- P1-11 app-store submission readiness: `pending-external-evidence`
- P1-13 manual accessibility/localisation QA: `pending-external-evidence`
- P1-14 production analytics: `blocked-pending-privacy-review`
- L-01 production-like staging gate: `repository-complete`
- L-02 private beta: `pending-external-evidence`
- L-03 public beta: `pending-external-evidence`
- L-04 overall: `blocked-on-external-evidence`

Any unresolved blocker is a **no-go**.

## Repository-complete technical baseline

The following launch-critical technical work is already represented on `main` and must remain green on the exact release candidate:

- production containers, infrastructure topology, shared Redis state, media hardening, observability, encrypted backups/restore, deployment reliability and production security controls;
- Android/iOS platform foundations and secret-gated store release pipelines;
- marketplace/listing SEO and structured public discovery;
- database-backed API integration journeys;
- bilingual browser end-to-end journeys;
- Android/iOS native mobile integration journeys;
- launch performance certification;
- adversarial security certification;
- production-like deployed staging smoke coverage;
- public-beta feature flags, provider approval guards and privacy-safe aggregate monitoring.

Canonical supporting contracts include:

- `docs/STAGING_SMOKE.md`
- `docs/PERFORMANCE_GATES.md`
- `docs/BACKUP_RESTORE.md`
- `docs/OBSERVABILITY.md`
- `docs/DEPLOYMENT_RELIABILITY.md`
- `docs/SECURITY_OPERATIONS.md`
- `docs/MOBILE_PLATFORM_RELEASES.md`
- `docs/PRIVATE_BETA_OPERATIONS.md`
- `docs/PUBLIC_BETA.md`
- `docs/P0_31_LEGAL_REVIEW_HANDOFF.md`
- `docs/INITIAL_LAUNCH_POLICY.md`

These repository controls are necessary but not sufficient for L-04.

## Remaining external and human blockers

### P0-31 — final English/Arabic legal policy approval

P0-31 remains blocked until the matched English and Arabic policy set receives genuine review and the approved copy, effective dates, entity/contact facts, retention rules and production-provider facts are incorporated exactly as described in `docs/P0_31_LEGAL_REVIEW_HANDOFF.md`.

CI cannot approve legal text, invent public organisation details, or create privileged legal-review evidence.

### P1-11 — mobile store submission readiness

P1-11 remains blocked until the real production-provider inventory is final, privacy/data-safety disclosures match that inventory, Android private testing and iOS TestFlight evidence are complete, real store-console records/questionnaires are complete, and reviewer access is provisioned outside source control.

Repository-generated screenshots, metadata and release automation do not substitute for store-console or testing evidence.

### P1-13 — manual accessibility/localisation acceptance

Automated accessibility and localisation checks do not substitute for keyboard-only, screen-reader, TalkBack, VoiceOver, zoom/text-scaling, responsive-layout, reduced-motion and Arabic RTL review across the required user journeys.

The final release record must contain dated human acceptance evidence with no unresolved release-blocking defect.

### P1-14 — production analytics privacy review

Production analytics must remain absent or disabled until privacy review defines the exact purpose, lawful/approved collection boundary, consent model where required, data minimisation, retention, access, processor/provider facts and deletion controls.

No analytics SDK, tag, cookie or production event collection may be introduced merely to make a launch checklist appear complete.

### L-02 — private beta human evidence

The repository-side private-beta operating contract is present, but L-02 itself still requires genuine dated evidence for operator training, final policy review and controlled real-user acceptance. Synthetic CI journeys are prerequisites, not human acceptance.

Use `docs/PRIVATE_BETA_OPERATIONS.md` as the canonical evidence contract.

### L-03 — real public beta evidence

The repository-side public-beta controls are merged, including reversible feature flags, payment/verification approval guards and privacy-safe aggregate metrics. L-03 itself is not complete until an actual controlled public cohort is launched and monitored with a recorded human go/no-go outcome.

CI cannot manufacture public-beta evidence or prove that real reliability, abuse, conversion and support load were acceptable.

Use `docs/PUBLIC_BETA.md` as the canonical operating contract.

## L-04 full-launch gate

L-04 may be signed off only for one immutable release candidate SHA. The sign-off record must identify that SHA and prove all of the following:

1. required exact-head repository CI is green, including Quality Gate, API integration, browser E2E, native mobile integration/builds, performance, adversarial security and staging smoke;
2. P0-31 final English/Arabic policies are approved and published with the exact reviewed version/effective date;
3. production payment collection, seller verification and seller settlement are enabled only in the approved provider/mode combination and all required live approvals are recorded;
4. disputes, moderation, fraud/risk operations and support escalation ownership are active;
5. observability, alerting, encrypted backups, restore procedure, deployment rollback and incident response have named operational ownership;
6. P1-11 mobile store evidence is complete for the platforms intended for launch;
7. P1-13 manual accessibility/localisation review is complete with no release-blocking defect;
8. P1-14 privacy review is complete before any production analytics is enabled;
9. L-02 private-beta evidence is complete;
10. L-03 public-beta evidence is complete and the cohort outcome supports progression to full launch;
11. all release-blocking defects, incidents, unresolved legal conditions and provider mismatches are closed or explicitly result in a no-go;
12. the final go/no-go decision, approvers, timestamp, rollback trigger and rollback owner are recorded outside source control or in the approved operational evidence system as appropriate.

## Required L-04 evidence record

The final release evidence should record at minimum:

- release candidate SHA and immutable build identifiers;
- exact green workflow/run references for required technical gates;
- legal policy version/effective date and external approval references;
- approved production payment, verification and settlement modes/providers;
- backup/restore drill reference and timestamp;
- incident-response and support ownership;
- mobile store testing/submission evidence for each launched platform;
- accessibility/localisation acceptance reference;
- production analytics/privacy decision, including an explicit `disabled` result when analytics is intentionally not launched;
- private-beta acceptance reference;
- public-beta monitoring window, cohort scope, reliability/abuse/conversion/support review and outcome;
- final go/no-go decision and rollback criteria.

Do not place secrets, reviewer credentials, privileged legal advice, customer data or production identifiers that do not belong in the public repository into this evidence record.

## Exact-head release procedure

When all external blockers are genuinely satisfied:

1. integrate the approved policy/store/accessibility/privacy changes onto a release candidate branch based on current `main`;
2. reconcile any long-lived draft branch before merge rather than merging stale history blindly;
3. run every required gate on the exact final candidate SHA;
4. sweep pull-request review threads and unresolved failures;
5. merge only with an expected-head guard;
6. validate the resulting `main` merge SHA;
7. create the immutable release/store artifacts from that validated state;
8. record the L-04 evidence and human go/no-go decision;
9. only then mark the remaining tracker items and L-04 complete.

Until that sequence is complete, Suqnaa must be described as technically advanced but **not fully launch-approved**.
