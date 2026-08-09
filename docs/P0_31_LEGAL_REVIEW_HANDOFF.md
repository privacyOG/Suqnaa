# P0-31 legal review handoff

Status: **engineering review candidate — external legal approval required**

Engineering branch: `preflight/p0-31-legal-policies`

This handoff exists so P0-31 cannot be completed merely by changing a UI label. The customer-facing policy registry intentionally remains `pending_legal_review` with no effective date until the approvals and production facts below are supplied and incorporated.

## Policy set requiring approval

The English and Arabic versions of each document must be reviewed as a matched pair:

1. Marketplace Terms
2. Privacy Policy
3. Item Rules
4. Marketplace Safety Policy
5. Payments Policy
6. Refund Policy
7. Dispute Policy
8. Returns Policy
9. Acceptable Use Policy
10. Contact and Complaints
11. Data Retention Policy

Canonical customer routes are `/{locale}/policy/{policySlug}`. `/{locale}/legal` is the policy index. The historical `/{locale}/policy/items` route is retained as a compatibility alias for `item-rules`.

## Product facts already fixed by engineering/product baseline

Review should start from, and either approve or explicitly replace, the P0-21 launch assumptions recorded in `docs/INITIAL_LAUNCH_POLICY.md`:

- initial live marketplace country: Australia only;
- initial transaction/settlement currency: AUD only;
- marketplace-intermediary model, with the marketplace seller supplying the underlying good/service;
- provider-controlled payment collection and seller payout infrastructure rather than a Suqnaa stored-value balance;
- protected checkout initially limited to approved provider-tokenised card/wallet methods;
- platform protection is additional to, and must not be represented as excluding or replacing, non-excludable statutory rights;
- virtual-asset payment rails and Suqnaa stored value remain outside the initial launch.

If legal review changes any of these product facts, the corresponding application launch-policy controls and tests must be changed in the same implementation before P0-31 can be considered complete.

## Organisation and contact facts required before approval

Legal reviewer/product owner must provide the exact public values for:

- contracting entity legal name;
- trading/business name if different;
- ABN/ACN or other required registration information;
- registered/principal business address if required for publication;
- general support contact;
- privacy contact;
- legal-notice contact;
- complaints contact and escalation procedure;
- expected response or acknowledgement commitments, if any are promised publicly.

Do not insert guessed addresses, registration numbers, inboxes or response-time promises.

## Privacy review checklist

Confirm the final Privacy Policy accurately covers the production data inventory and flows, including:

- account identifiers, profiles and business information;
- verification records and provider references;
- listings, messages, offers, orders and fulfilment records;
- payment, refund, chargeback, payout and reconciliation references;
- reports, moderation actions, appeals and bounded evidence snapshots;
- risk observations/signals and the kinds of identifiers used for correlation;
- security/audit events, sessions, device/network information actually retained;
- notifications and communications providers;
- object storage, hosting, monitoring and other production processors once P1 infrastructure is selected;
- access/correction and privacy-complaint procedure;
- likely overseas recipients and countries where practicable;
- deletion/de-identification rules and legal exceptions;
- whether automated-decision disclosures are required for the production risk/moderation design, including requirements commencing on 10 December 2026.

The policy must describe actual production behaviour. Do not approve provider or overseas-recipient wording based only on development configuration.

## Consumer-law and marketplace review checklist

Confirm at minimum:

- seller/platform contracting roles are described accurately;
- business-seller obligations and non-excludable consumer guarantees are not misstated or contracted away;
- private-seller differences are described only where legally accurate;
- refund, return and dispute wording does not imply that contractual platform protection replaces statutory remedies;
- fee, pricing, shipping, seller-status, verification and protection representations are not misleading;
- prohibited/restricted item wording is consistent with the actual moderation policy and Australian product-safety obligations;
- cancellation, delivery/pickup, return and dispute time windows are consistent with the implemented workflows and final policy.

## Payments and settlement review checklist

Confirm the final wording matches the production provider agreement and exact funds flow:

- collection model and connected-account model;
- platform fee description;
- controlled release/payout timing;
- refunds and partial refunds;
- chargebacks/reversals and negative-balance handling;
- compliance holds;
- seller verification responsibilities;
- recordkeeping/reconciliation responsibilities;
- any financial-services, sanctions, AML/CTF or tax disclosures/responsibilities that must appear in customer-facing terms.

P0-31 does not itself enable a new payment rail or funds model.

## Data-retention schedule requiring explicit approval

Engineering already has bounded copies with these implemented periods:

- risk event observations: 30 days;
- moderation evidence snapshots: 180 days, with open-appeal protection from scheduled purge.

These are not a complete legal retention schedule. Legal/tax/accounting/security review must approve explicit periods or rules for at least:

- account/profile and verification records;
- messages and conversation safety records;
- listings and listing history;
- orders and fulfilment evidence;
- payment/provider events and receipts;
- seller settlements/ledger entries/payout events;
- disputes, returns and protection cases/evidence;
- reports, moderation actions, notes and appeals;
- security and audit logs;
- notification records;
- support/privacy/legal requests;
- backups and deletion propagation once production infrastructure is defined.

Where a period depends on a legal or accounting trigger rather than a fixed duration, record the trigger and disposal rule clearly.

## Arabic review

Arabic copy must receive substantive review, not only mechanical translation checking. Reviewer should confirm that:

- legal meaning matches the approved English version;
- marketplace/payment terminology is consistent across all policies;
- mandatory qualifications and consumer-rights language are preserved;
- dates, entity names, contacts and defined concepts match English;
- RTL presentation does not change hierarchy or omit content.

If English wording changes during review, Arabic must be re-reviewed for that same version.

## Approval record required for each final policy version

Before changing a policy to `reviewStatus: 'approved'`, record outside or inside the repository as permitted by the organisation’s legal-record process:

- policy slug;
- final version identifier;
- final effective date;
- English legal reviewer and approval date;
- Arabic legal/translation reviewer and approval date;
- product owner approval date;
- links/references to the approved source documents or legal matter record where appropriate;
- any launch condition or jurisdiction limitation.

Do not place privileged legal advice in the public repository.

## Engineering finalisation after approval

After approved wording and production facts are supplied:

1. replace candidate text with the exact approved EN/AR copy;
2. set a new final version identifier;
3. set `reviewStatus: 'approved'` for each approved document;
4. set the approved effective date;
5. remove candidate-review banners from approved pages while preserving version/effective-date presentation;
6. confirm canonical routes and footer links;
7. run policy parity/surface tests and the full Quality Gate;
8. run the exact same SHA through `preflight/gate`;
9. sweep PR review threads/comments;
10. squash merge with the expected-head guard;
11. validate the merge SHA on `main`;
12. only then mark P0-31 complete in tracker #99.

Until those steps are satisfied, PR #129 must remain draft and tracker P0-31 must remain unchecked.
