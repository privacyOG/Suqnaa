# Password and session security

## Password recovery

Password recovery is intentionally enumeration-safe. `POST /v1/auth/password/forgot` returns the same accepted response after a valid request regardless of whether the email address exists, the account is closed, the account has reached its durable issuance limit, or downstream delivery fails.

The server generates a 32-byte random base64url reset token. Only an HMAC-SHA-256 digest of that token is stored in PostgreSQL, using the dedicated `PASSWORD_RESET_PEPPER`. Reset tokens expire after 20 minutes, can be consumed once, and older outstanding reset tokens are invalidated when a newer token is issued.

Issuance is protected by a one-minute durable cooldown, a maximum of five reset tokens per account per hour, and ten per account per day. The public API also applies bounded target-fingerprint and IP limits. The target fingerprint is an HMAC of the normalized email address rather than plaintext email in the rate-limit key.

The existing provider-neutral account-security delivery relay is reused. For password reset it receives:

```json
{
  "purpose": "account_password_reset",
  "channel": "email",
  "destination": "person@example.com",
  "token": "opaque-reset-token",
  "expiresAt": "2026-08-07T11:00:00.000Z"
}
```

The relay is responsible for rendering the reset link or token message. Production requires the HTTP delivery mode, a bearer credential, and HTTPS. Local development may use console delivery. Delivery failure invalidates the newly created reset token but does not change the enumeration-safe public response.

`POST /v1/auth/password/reset` accepts the opaque token and a new password. A successful reset changes the password, consumes the token, invalidates all other outstanding reset tokens, revokes every refresh session for the account, and writes an audit record. The previous password no longer verifies and the reset token cannot be replayed.

## Authenticated password changes

`POST /v1/account/security/password` derives the account from the access token and requires the current password. The new password must differ from the current password and meet the same length policy used at registration.

A successful password change updates the password only if the stored password hash has not changed concurrently, invalidates outstanding reset tokens, revokes every refresh session, and writes an audit record. Web and mobile clients then clear their local session state and require a fresh sign-in.

## Security-session management

Authenticated users can inspect up to 50 active, unexpired refresh sessions through `GET /v1/account/security/sessions`. Each record includes its opaque session identifier, user-agent string, network address, creation time, and expiry time.

Users can revoke one owned session with `POST /v1/account/security/sessions/:sessionId/revoke` or revoke every active refresh session with `POST /v1/account/security/sessions/revoke-all`. The single-session endpoint is ownership-bound and idempotent. Revoke-all clears local web/mobile session state after the server confirms revocation.

Access tokens remain short-lived bearer credentials. Revoking refresh sessions prevents further rotation; an already issued access token naturally expires on its normal short lifetime.

## Client behavior

The web application provides localized English/Arabic forgot-password, reset-password, and signed-in password/session management screens. Password change and revoke-all clear the HttpOnly web-session cookies after the server-side operation succeeds.

The mobile application provides native password recovery, password reset, password change, session listing, individual revocation, and revoke-all controls. When a production human-verification challenge is required for a recovery request, mobile opens the exact localized secure web recovery path without putting account credentials or reset tokens in the handoff URL.

## Required secrets

Keep all production values in the deployment secret manager:

- `PASSWORD_PEPPER`: password hashing pepper.
- `PASSWORD_RESET_PEPPER`: independent HMAC secret for password-reset token hashes and target fingerprints.
- `VERIFICATION_CODE_PEPPER`: independent HMAC secret for contact-verification codes.
- `VERIFICATION_DELIVERY_TOKEN`: bearer credential for the provider-neutral account-security delivery relay.

Do not reuse these HMAC/password secrets across purposes.
