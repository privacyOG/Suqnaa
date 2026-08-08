# Seller settlement and payouts

P0-24 adds seller payout onboarding, settlement accounting, provider transfers, payout scheduling, reconciliation, and failure handling for the Australia/AUD launch path.

## Safety and legal boundary

Seller settlement is disabled by default. Enabling it requires explicit commission, settlement-delay, payout-schedule, and Connect-webhook configuration. Live seller money movement is separately gated by `SELLER_SETTLEMENT_LIVE_APPROVED=true`; this is in addition to the live buyer-payment approval gate.

The implementation does not describe Suqnaa balances as escrow. `payment_intents.status = released` means an authorised marketplace decision has made the order eligible for settlement. It does not itself mean a seller has received a transfer or bank payout.

Production enablement still requires the applicable legal, commercial, tax, provider-account, refund, dispute, and marketplace-liability review.

## Seller onboarding

A currently verified seller can start payout onboarding from the protected seller account surface. Suqnaa creates or reuses the seller's connected provider account and returns a short-lived hosted onboarding link.

Sensitive identity and banking details are entered in the provider-hosted browser flow. Suqnaa stores the connected-account reference and operational state only: country/currency, requirements count, transfer/payout readiness, disabled reason, and payout schedule. Bank account and routing/account numbers are intentionally not stored in the Suqnaa settlement schema.

A connected account is treated as settlement-ready only when details are submitted, the transfers capability is active, payouts are enabled, and there are no outstanding requirements.

## Settlement economics

The deployment must explicitly configure `SELLER_SETTLEMENT_COMMISSION_BPS`. Commission is snapshotted on each settlement so later commercial changes do not silently rewrite historical orders.

For each released order:

- gross sale = the order amount
- platform commission = gross multiplied by the snapshotted basis-point rate, rounded to cents
- seller payable = gross minus commission
- `available_at` = release time plus the configured settlement delay

The settlement ledger records signed accounting entries for the gross sale, commission, seller payable, transfer, refund adjustments, commission adjustments, and transfer reversals.

## Transfer and payout separation

The settlement worker transfers only orders whose payment and transaction remain `released`, whose settlement delay has elapsed, and whose seller connected account is ready.

The provider transfer uses the original charge as `source_transaction`, the seller connected account as destination, the order transfer group established at buyer checkout, and a stable settlement-derived idempotency key. A successful transfer moves the seller net amount to the connected provider balance.

That transfer is distinct from the later bank payout. The connected account's provider payout schedule controls when available connected-account balance is paid to the seller's external account. The seller-facing status therefore distinguishes marketplace settlement/transfer state from provider bank-payout events.

## Refunds and chargebacks after settlement

P0-23 remains authoritative for separately approved refunds/cancellations and signed provider chargebacks. The P0-24 worker reconciles those durable operations.

Before a seller transfer, a refund or chargeback reduces the settlement gross, commission, and seller payable. After a transfer, the worker creates an idempotent transfer reversal for the seller's net share of the affected amount. The corresponding commission share is adjusted separately in the internal ledger so accounting does not incorrectly charge the seller for platform commission.

Transfer reversals are retried from durable records. A failed reversal remains visible to operations with its safe failure code rather than being treated as completed.

## Payout failures and account reconciliation

A distinct signed Connect webhook endpoint ingests connected-account and payout events. `account.updated` refreshes readiness and outstanding requirements. Payout paid/canceled/failed events are recorded durably with replay protection.

A provider-reported payout failure restricts the local payout account and disables further settlement transfers until provider account state is reconciled back to ready. This prevents new seller settlements from continuing toward an external account that the provider reports as unable to receive payouts.

## Worker and operations

`pnpm --filter suqnaa-api worker:settlements` runs bounded reconciliation cycles. Each cycle first discovers released payments and completed refund/chargeback operations that still need settlement accounting, then processes transfer reversals before new seller transfers.

Administrative settlement listing and manual reconciliation execution use dedicated `settlements.read` and `settlements.run` permissions. Running reconciliation never authorises a payment release: it consumes only already-authorised P0-23 state.

## Configuration

Required when `SELLER_SETTLEMENT_ENABLED=true`:

- `SELLER_SETTLEMENT_COMMISSION_BPS`
- `SELLER_SETTLEMENT_DELAY_DAYS`
- `SELLER_SETTLEMENT_PAYOUT_INTERVAL`
- `SELLER_SETTLEMENT_PAYOUT_ANCHOR` for weekly/monthly schedules
- `STRIPE_CONNECT_WEBHOOK_SECRET`

Additional controls:

- `SELLER_SETTLEMENT_LIVE_APPROVED=false` by default
- `SELLER_SETTLEMENT_WORKER_BATCH_SIZE`
- `SELLER_SETTLEMENT_WORKER_INTERVAL_MS`

The existing Stripe secret/API version from buyer payment collection is reused, but the Connect webhook secret is intentionally separate from the buyer-payment webhook secret.
