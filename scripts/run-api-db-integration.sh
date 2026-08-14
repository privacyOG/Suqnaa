#!/usr/bin/env bash
set -euo pipefail

run_test() {
  local label="$1"
  local path="$2"
  printf '\n==> P1-15: %s\n' "$label"
  pnpm --dir apps/api exec tsx "$path"
}

# Cross-domain account, listing-context messaging, offer and order composition.
run_test "account/listing/message/offer/order lifecycle" src/integration/marketplace-lifecycle.integration.test.ts

# Listing lifecycle remains independently database-backed because expiry, renewal,
# reservation and inventory restoration include scheduled state transitions.
run_test "listing lifecycle and inventory" src/listings/listing-lifecycle-service.test.ts

# Payment operations exercise held funds, dual control, refund and chargeback state.
run_test "payment state and operations" src/payments/payment-operation-service.test.ts

# Fulfilment covers shipping price locks, privacy-safe address state and pickup data.
run_test "fulfilment, delivery and pickup" src/market/delivery-pickup.test.ts

# Dispute workflow covers participant response, review, refund request and escalation.
run_test "dispute and resolution" src/disputes/dispute-service.test.ts

# Moderation journey proves evidence retention, audit, appeal and restoration.
run_test "moderation and appeal" src/integration/moderation-appeal.integration.test.ts

# Seller settlement closes the payment journey through ledger, transfer, reversal,
# and provider payout-account failure handling.
run_test "seller payout and settlement" src/settlements/seller-settlement-service.test.ts

printf '\nP1-15 API database-backed integration suite passed.\n'
