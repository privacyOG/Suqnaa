# Security baseline

Security is a first-class requirement for Suqnaa because the product handles user identity, listings, messages, offers, payments, disputes, and seller trust.

## Core controls

- Validate every request at the API boundary.
- Hash passwords with Argon2id and use a server-side pepper.
- Use short-lived access tokens and rotate refresh tokens.
- Keep secrets out of source control.
- Apply rate limits to authentication, listing creation, messages, uploads, and report flows.
- Use prepared SQL queries through a typed query layer.
- Use database constraints for integrity.
- Store uploaded media in object storage.
- Keep sensitive moderation and account actions in an audit log.

## Marketplace abuse controls

- Report listing and report user flows.
- Listing status lifecycle: draft, active, reserved, sold, expired, removed.
- Seller verification status and future trust score.
- Message throttling and abuse review hooks.
- Admin review process before high-risk account actions.

## Payment safety

Protected payment and escrow-like flows should only be enabled after choosing licensed providers for each operating jurisdiction.
