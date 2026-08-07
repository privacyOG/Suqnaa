# Seller identity and business verification

Seller verification is a provider-neutral, operations-reviewed workflow for individual sellers and business profiles. It replaces the retired generic verification route without reintroducing that route or its unsafe authorization model.

## Security model

- Seller status and initiation are authenticated from the access session. The client never supplies another account identifier.
- The current profile determines the allowed level: `seller` for individual profiles and `business` for business profiles.
- Business verification snapshots the current business name. A later business-name change expires the verification and requires reverification.
- The country is supplied explicitly as a two-letter code. The service does not infer a jurisdiction from a phone number, IP address, or locale.
- Sensitive provider steps occur inside a provider-hosted HTTPS session. Marketplace profile forms do not accept identity-document uploads.
- Provider configuration is disabled by default and fails closed when incomplete.
- Provider-result events are signed with a dedicated HMAC secret, time bounded, ordered, and recorded in a durable replay ledger.
- A provider result never sets a seller to `verified` automatically.
- Final approval or rejection is restricted to the operations authorization boundary and produces an audit record.

## Seller lifecycle

1. The seller opens the protected verification status screen.
2. The API derives whether the current profile requires individual-seller or business verification.
3. The seller supplies an explicit country code and starts the verification flow.
4. The API serializes initiation on the account row, creates or resumes one pending verification context, and asks the configured provider for a hosted HTTPS session.
5. The seller completes the provider-hosted steps.
6. The provider sends a signed `seller_verification.updated` event with a result of `passed`, `failed`, `review_required`, or `expired`.
7. `passed`, `failed`, and `review_required` remain `pending` at marketplace level until operations review. An expired provider session becomes `expired`.
8. Operations may approve only a provider `passed` or `review_required` result. Manual approval of `review_required` requires a review note. A provider `failed` result can only be rejected.
9. Approval sets the marketplace verification to `verified` and creates an explicit expiry date. The default validity period is 365 days and is configurable from 30 to 730 days.
10. Expired verification or a material verified-business-name change causes the seller status to become `expired`, allowing a new verification cycle.

## Provider session contract

The configured HTTP endpoint receives a JSON POST similar to:

```json
{
  "purpose": "seller_verification",
  "action": "create",
  "requestId": "verification-check-uuid",
  "accountId": "account-uuid",
  "level": "business",
  "countryCode": "AU",
  "businessName": "Example Trading"
}
```

For a resumable context, `action` is `resume` and the existing provider `reference` is also sent. The relay returns:

```json
{
  "reference": "provider-session-reference",
  "hostedUrl": "https://verification.example/session/...",
  "expiresAt": "2026-08-08T04:00:00.000Z"
}
```

The returned hosted URL must be HTTPS and the expiry must be in the future and no more than 30 days away.

## Signed provider-result events

The server-to-server event endpoint is:

`POST /v1/seller-verification/provider-events`

Required headers:

- `x-suqnaa-verification-provider`
- `x-suqnaa-verification-event-id`
- `x-suqnaa-verification-event-timestamp`
- `x-suqnaa-verification-signature`

Body:

```json
{
  "type": "seller_verification.updated",
  "providerReference": "provider-session-reference",
  "result": "passed",
  "occurredAt": "2026-08-08T03:30:00.000Z"
}
```

A bounded safe `reasonCode` may also be included. The signature uses HMAC SHA-256 over a versioned canonical field sequence. Event IDs are durably unique per provider. Identical retries are accepted idempotently, conflicting reuse of an event ID is rejected, and older out-of-order events are rejected.

## Operations review

Operations users can read the internal review queue and make final decisions through:

- `GET /v1/operations/verifications`
- `POST /v1/operations/verifications/:id/review`

The current operations authorization mechanism remains the existing protected operations boundary. Durable role-based administration and least-privilege role management are intentionally P0-13 rather than being mixed into this verification batch.

## Web and mobile

Web provides a bilingual seller status/start page and a separate internal operations review page.

Mobile displays seller verification status natively. When browser human verification is enabled, initiation opens the exact localized `/{locale}/account/seller-verification` page without credentials, account IDs, check IDs, or provider data in the URL. When browser human verification is disabled, mobile may request the provider session natively and opens only the HTTPS URL returned by the API.

## Retained data

The marketplace stores verification lifecycle state, provider/reference metadata, bounded review data, a subject snapshot, event fingerprints, and audit history. Raw identity documents are not accepted by this implementation. Final jurisdiction-specific retention periods remain subject to the later legal and data-retention policy work.
