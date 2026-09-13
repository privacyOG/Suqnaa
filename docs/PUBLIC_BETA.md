# Public beta launch controls

This runbook is the repository-verifiable operating contract for launch gate **L-03 Public beta**.

L-03 requires a controlled public launch with explicit feature flags, only approved payment/verification functionality, and active monitoring of reliability, abuse, conversion, and support load. Repository controls can enforce configuration and expose privacy-safe aggregate signals; a real public-beta launch and human go/no-go decision still require live operational evidence.

## Feature-flag contract

Public beta mode is disabled unless `PUBLIC_BETA_ENABLED=true`.

When enabled:

- `NODE_ENV` must be `production`;
- every public-beta feature flag must be explicitly `true` or `false`;
- disabled feature surfaces are rejected by the global API request boundary with HTTP 503;
- read-only catalogue/health/observability routes remain available unless governed by another control;
- payment collection, seller verification and seller settlement have additional provider/mode approval checks.

The controlled features are:

- registration;
- listing writes;
- messaging;
- trading/offers;
- payment collection;
- seller verification;
- seller settlement;
- disputes/reports.

The canonical environment names are documented in `.env.example`.

## Payment and verification approval

`PUBLIC_BETA_APPROVED_PAYMENT_PROVIDER` must be one of:

- `none`;
- `stripe_test`;
- `stripe_live`.

The configured payment provider and key mode must match the approved public-beta mode. Live Stripe additionally requires the existing `PAYMENT_COLLECTION_LIVE_APPROVED=true` safeguard.

`PUBLIC_BETA_APPROVED_SELLER_VERIFICATION_PROVIDER` must be `none` or the exact approved provider identifier. If seller verification is disabled, the runtime provider must also be `none`.

Seller settlement is independently guarded. Enabling the public-beta settlement feature requires both `SELLER_SETTLEMENT_ENABLED=true` and `SELLER_SETTLEMENT_LIVE_APPROVED=true`. Public beta must not be used to bypass the settlement approval boundary.

## Reliability, abuse, conversion and support monitoring

The protected `/internal/observability/metrics` endpoint exports privacy-safe aggregate counters under `suqnaa_marketplace_events_total` with bounded labels only.

Required beta categories:

- **reliability** — API request success/failure aggregate;
- **abuse** — rejected authentication activity and report submissions;
- **conversion** — registration, listing writes, offer submissions and payment actions;
- **support** — dispute/safety cases and requests blocked by the public-beta feature policy.

These aggregate counters deliberately avoid account IDs, email addresses, phone numbers, message text, listing titles, payment credentials, addresses, IP addresses, free text and other high-cardinality/private labels.

During public beta, operators should correlate these counters with the existing observability controls in `docs/OBSERVABILITY.md`, the support process in `docs/PRIVATE_BETA_OPERATIONS.md`, and the incident process in `docs/DEPLOYMENT_RELIABILITY.md`.

## Go/no-go procedure

Before enabling `PUBLIC_BETA_ENABLED=true`, record:

1. the release candidate SHA;
2. exact feature flags to be enabled;
3. approved payment mode;
4. approved seller-verification provider;
5. confirmation that unapproved settlement remains disabled;
6. current green staging, quality, security and performance gates applicable to the release;
7. monitoring ownership for reliability, abuse, conversion and support load;
8. support and incident escalation ownership;
9. any known limitations and rollback trigger.

If the approved provider/mode does not match the runtime configuration, startup must fail. If a feature is disabled, requests to that governed feature must fail closed.

## Rollback and narrowing

The first response to elevated abuse, reliability degradation, unexpected conversion failure or support overload should be to narrow or disable the affected beta feature rather than broaden privileges.

Feature flags are intended as reversible launch controls. Payment/verification/settlement approval checks are not feature experiments and must never be weakened as a rollback shortcut.

Use `docs/DEPLOYMENT_RELIABILITY.md` for application rollback and incident handling. Use `docs/PRIVATE_BETA_OPERATIONS.md` for support severity, operator responsibilities and privacy-safe case handling.

## Evidence boundary

CI can prove that feature gating, provider-mode validation, metrics aggregation and existing regression gates work against repository-controlled environments.

CI cannot prove that a real public cohort was launched safely, that operators actively monitored the beta, or that real support load remained acceptable. Those facts require genuine dated operational evidence before L-03 itself is marked complete.
