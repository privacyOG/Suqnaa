# In-app assistant architecture

Suqnaa can include an optional in-app assistant for buyers and sellers while keeping the marketplace provider-agnostic.

## Goals

- Help users write better listings.
- Help buyers compare listings.
- Explain safety, verification, and payment steps.
- Support Arabic and English from the start.
- Keep provider choice behind the API so the mobile app and website do not depend on any one vendor.

## Guardrails

- The assistant should not make payment, shipping, or account decisions without user confirmation.
- It must not expose private user data across accounts.
- It should refuse requests that attempt fraud, impersonation, or bypassing marketplace protections.
- It should identify when a human support or moderation review is required.

## API boundary

Client apps should call Suqnaa backend endpoints only. The backend decides how to route assistant requests.

Suggested future endpoints:

- `POST /v1/assistant/listing-draft`
- `POST /v1/assistant/buyer-help`
- `POST /v1/assistant/safety-help`

## Localisation

The assistant request should include a locale field such as `en` or `ar`. Responses should match the user locale unless the request asks otherwise.
