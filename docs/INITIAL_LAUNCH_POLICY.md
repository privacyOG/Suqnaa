# Initial marketplace launch policy

Status: product and engineering baseline for P0-21.

Policy review date: 8 August 2026.

This document fixes the first live-money boundary for Suqnaa. It is deliberately narrower than the currencies and jurisdictions represented by future catalogue scaffolding. Expansion requires a separate legal, payments, tax, fraud, sanctions, operations, and support review before the launch-policy code is widened.

This is an engineering/product decision record, not legal advice. Production payment enablement remains blocked until Australian legal counsel and the selected regulated payment provider confirm the final structure.

## Launch market

Initial live marketplace country: **Australia (`AU`) only**.

Initial transaction and settlement currency: **Australian dollars (`AUD`) only**.

For the first live-money release:

- the listing used for protected checkout must have `country_code = AU`;
- the stored order/payment currency must be `AUD`;
- seller payout onboarding must be for an Australian-supported connected account;
- shipping/pickup and buyer-protection policy must be written for Australian transactions before public launch;
- other catalogue country/currency values remain future capability and must not become payable merely because they are accepted by a listing or search schema.

The API launch-policy guard rejects protected checkout outside this boundary before a provider is invoked.

## Marketplace legal model

The initial model is a **marketplace intermediary**, not a merchant-of-record or stored-value operator.

The intended contracting model is:

- the seller is the supplier of the listed good or service;
- the buyer contracts with that seller for the underlying supply;
- Suqnaa provides marketplace discovery, messaging, transaction workflow, payment orchestration, safety controls, and contractual buyer/seller protection;
- Suqnaa may charge a disclosed marketplace/platform fee;
- Suqnaa does not take title to the goods merely because checkout occurs on the platform;
- Suqnaa is not to represent itself as the seller where the actual seller is another marketplace participant.

For Australian business sellers, platform wording must preserve Australian Consumer Law rights. Consumer guarantees cannot be excluded by marketplace terms. The ACCC explains that, on marketplace platforms, consumer-guarantee rights ordinarily apply against the seller supplying the product rather than automatically against the platform, while the platform may provide additional dispute/help policies.

Private sellers and business sellers must be distinguishable where legally relevant. Suqnaa buyer protection is a contractual platform policy and must not be described as replacing statutory consumer rights.

## Funds model

Suqnaa must **not directly custody buyer money** for the initial release.

The live provider integration must keep collection, regulated payment processing, connected-account onboarding, safeguarded/controlled balances, and seller payouts inside the approved payment provider's regulated infrastructure.

The application's internal `held`, fulfilment, dispute, release, refund, and payout states remain authoritative workflow records, but an internal `held` state must correspond to provider evidence. It must not mean Suqnaa itself operates an unlicensed escrow account.

Before P0-22 enables live collection, Australian financial-services counsel must give a written view on whether the final provider contract and funds flow cause Suqnaa to issue, deal in, or arrange a non-cash payment facility or otherwise require an Australian financial services licence or exemption. ASIC states that facilities through which a person can make non-cash payments to more than one person are generally financial products and financial services in relation to them generally require an AFS licence, subject to applicable exclusions/relief.

## Initial payment methods

Approved launch-policy methods at the application boundary:

1. `card` — provider-tokenised debit/credit card payments.
2. `wallet` — only provider-tokenised device/payment wallets that settle through the same approved fiat provider (for example wallets presented by the provider's hosted checkout). This does **not** authorise a Suqnaa stored-value balance.

Not launched:

- `bank_transfer` — disabled until reconciliation, payer identification, refund, fraud, mistaken-payment, settlement-time, and provider support are separately approved;
- `xmr` and any other virtual-asset rail — disabled;
- any Suqnaa stored-value wallet — disabled;
- BNPL/credit products — disabled unless separately approved with consumer-credit and provider review;
- cash handling by Suqnaa — unsupported.

The repository may retain non-launch rails as quarantined schema/scaffolding, but protected checkout rejects them under `initialLaunchPaymentMethods`.

## Payment-provider requirements

P0-22 may integrate a provider only after it is explicitly approved for this launch model. The provider must support, at minimum:

- Australian marketplace/platform use and AUD settlement;
- seller/connected-account identity and business verification suitable for Australian payouts;
- provider-hosted or provider-controlled collection so raw card data is not stored by Suqnaa;
- card and provider-tokenised wallet payment methods;
- order-derived amount/currency and server-side idempotency;
- signed server-to-server events with stable event identifiers and retry semantics;
- delayed/manual or otherwise controlled seller payout timing so payout can follow the approved fulfilment/dispute policy;
- refunds, partial refunds, disputes/chargebacks, reversals, negative-balance handling, and reconciliation data;
- platform fee support without misrepresenting the underlying seller relationship;
- downloadable transaction, fee, refund, dispute, payout, and balance reporting;
- fraud/risk controls and the ability to suspend payment or payout capability;
- documented Australian privacy/security and data-processing terms;
- operational support and an escalation path for payment, payout, dispute, and account-verification failures.

**Stripe Connect is the preferred engineering candidate for P0-22, not an approved production dependency by this document.** Stripe's current Australian Connect materials state that it supports marketplace seller onboarding/verification, payment collection, configurable payout timing, platform fees, refunds/chargebacks, and AUD marketplace examples. Final selection still requires commercial review, restricted-business/product review, legal approval, and confirmation that the exact connected-account/charge model matches the legal structure above.

## Proposed provider charge model

The preferred architecture for legal/commercial review is a provider marketplace flow in which:

- the buyer payment is created server-side from the immutable Suqnaa order;
- the seller has a provider-connected payout account;
- provider evidence moves the Suqnaa payment state into `held`/paid;
- seller payout or transfer is delayed until the separately authorised release condition is met;
- Suqnaa's fee is explicit and recorded in the internal ledger introduced by P0-24;
- refunds, partial refunds, disputes, chargebacks, and compliance holds have distinct authorised state transitions under P0-23.

P0-22 must not infer release from successful collection, and must not bypass the existing signed-event/replay boundary.

## Australian Consumer Law requirements

Before public launch:

- Terms and checkout must clearly identify the underlying seller and the platform role;
- business sellers must not use terms or UI that purport to remove non-excludable consumer guarantees;
- refund/dispute wording must distinguish statutory seller obligations from additional Suqnaa protection;
- listing, review, fee, checkout, and protection claims must not be false or misleading;
- records needed to establish the listing description, order, communications, fulfilment, refund, and dispute history must be retained according to the approved retention schedule.

The ACCC states that ordinary consumer rights apply online and that online marketplace users have consumer-guarantee rights against the seller they buy from. The final Terms/Returns/Buyer Protection text remains subject to P0-31 legal review.

## AML/CTF and virtual assets

Fiat launch must use a regulated provider and receive Australian counsel's assessment of Suqnaa's own obligations under the final funds flow.

Virtual assets are explicitly outside the initial launch. Australia's reformed AML/CTF framework is now in force, and AUSTRAC requires providers of registrable virtual-asset services to enrol/register before providing regulated services (subject to the applicable transitional rules). AUSTRAC made its VASP register public in June 2026.

Therefore:

- `xmr` and `crypto_other` remain disabled in production;
- no virtual-asset address, conversion, custody, transfer, or payout feature may be enabled by P0-22;
- any future virtual-asset project requires a separate jurisdiction-specific legal opinion, AUSTRAC scope/registration assessment, AML/CTF program, customer due diligence, transaction monitoring, travel-rule analysis where applicable, sanctions controls, and explicit tracker approval.

## Sanctions and financial-crime controls

Australian sanctions laws apply to Australian persons/entities and activities conducted in Australia. DFAT's Australian Sanctions Office maintains the Consolidated List and recommends due diligence to avoid dealings with designated persons/entities.

Before seller payment capability is enabled, the approved provider and Suqnaa operations design must establish:

- sanctions/PEP or equivalent provider screening responsibilities during seller onboarding;
- a process for escalated or potential matches;
- payout/payment suspension capability;
- record retention for screening/escalation decisions;
- a documented division of responsibility between provider screening and Suqnaa marketplace-risk controls.

Suqnaa must not assume provider screening removes every independent Australian sanctions obligation.

## Privacy and payment-data boundary

The initial architecture must minimise payment data retained by Suqnaa:

- no raw PAN, CVV/CVC, bank credential, or wallet secret storage;
- retain provider tokens/references only where required for order, refund, dispute, payout, audit, and reconciliation workflows;
- sensitive seller payout data should remain provider-hosted where possible;
- cross-border data handling by the selected provider must be documented;
- the production privacy policy and retention schedule must describe payment/provider data flows before launch.

The OAIC's Australian Privacy Principles guidance covers collection, notice, use/disclosure, cross-border disclosure, data quality/security, access and correction. If Suqnaa is subject to the Privacy Act/NDB scheme, the incident plan must support assessment and notification of eligible data breaches. P0-31 remains the final privacy-policy legal-review gate.

## Tax and platform reporting

Before live seller payouts, Australian tax advice must determine and document:

- GST treatment of Suqnaa platform fees;
- seller GST/ABN information required for business sellers;
- whether any transaction categories offered by Suqnaa fall within the ATO Sharing Economy Reporting Regime or other electronic-distribution-platform reporting obligations;
- what seller identity, ABN, transaction, fee and payout records must be retained to support any required ATO reporting.

The ATO states that SERR requires operators of electronic distribution platforms to report specified eligible transactions and has applied to additional reportable categories since 1 July 2024. Ordinary second-hand-goods sales must not be assumed reportable without category-specific tax advice.

## Expansion rule

Adding any new country, settlement currency, payment rail, provider charge model, stored-value feature, virtual-asset capability, or cross-border seller payout requires all of the following before code is enabled in production:

1. written product decision;
2. provider support confirmation;
3. legal/licensing review;
4. AML/CTF and sanctions review;
5. tax/GST/reporting review;
6. consumer-law and policy review;
7. privacy/data-flow review;
8. fraud/chargeback/operations review;
9. automated test updates to the launch-policy boundary;
10. tracker/release approval.

## Authoritative external references reviewed for this decision

Official sources reviewed on 8 August 2026:

- ACCC — Selling online: https://www.accc.gov.au/business/selling-products-and-services/selling-online
- ACCC — Consumer rights and guarantees: https://www.accc.gov.au/consumers/buying-products-and-services/consumer-rights-and-guarantees
- ASIC — RG 185 Non-cash payment facilities: https://www.asic.gov.au/regulatory-resources/find-a-document/regulatory-guides/rg-185-non-cash-payment-facilities/
- ASIC — Non-cash payment facilities instrument update (2 April 2026): https://www.asic.gov.au/about-asic/news-centre/news-items/asic-remakes-non-cash-payment-facilities-instrument/
- AUSTRAC — New reporting regime now in force (1 July 2026): https://www.austrac.gov.au/new-reporting-regime-now-force
- AUSTRAC — Virtual asset service provider register goes public (30 June 2026): https://www.austrac.gov.au/virtual-asset-service-provider-register-goes-public
- DFAT Australian Sanctions Office — Consolidated List: https://www.dfat.gov.au/international-relations/security/sanctions/consolidated-list
- OAIC — Australian Privacy Principles guidelines (updated May 2026): https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines
- ATO — Sharing Economy Reporting Regime: https://www.ato.gov.au/businesses-and-organisations/preparing-lodging-and-paying/third-party-reporting/sharing-economy-reporting-regime
- Stripe Australia — Connect marketplace capabilities: https://stripe.com/au/connect/marketplaces

External references are evidence for the engineering decision only. Legal and tax conclusions must be confirmed by qualified Australian advisers before live-money launch.
