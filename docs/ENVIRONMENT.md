# Environment settings

The main example environment file is `.env.example`.

## Web origin

Set `WEB_ORIGIN` to the exact browser origin allowed to call the API, for example `https://suqnaa.com`. The API permits only that origin and only the headers required by the web client, including `x-suqnaa-human-check`.

The web application uses `NEXT_PUBLIC_API_BASE_URL` for browser API requests and may use `API_BASE_URL` for server-side account requests. Local development defaults to `http://localhost:4000`.

## Account contact verification

Email and phone verification use six-digit single-use codes backed by a PostgreSQL challenge ledger. Plaintext codes and plaintext duplicate contact values are never written to the verification table.

Configure these values through the deployment secret manager:

- `VERIFICATION_CODE_PEPPER`: separate secret of at least 32 characters used to HMAC verification codes and contact fingerprints. Do not reuse the password pepper in production.
- `VERIFICATION_DELIVERY_PROVIDER`: `console`, `http`, or `disabled`. `console` is local-development only. Production startup requires `http`.
- `VERIFICATION_DELIVERY_URL`: HTTPS endpoint for the provider-neutral delivery relay when `http` is selected.
- `VERIFICATION_DELIVERY_TOKEN`: bearer credential for the delivery relay.
- `VERIFICATION_DELIVERY_TIMEOUT_MS`: relay timeout from 500 to 15000 milliseconds; defaults to 5000.

The relay receives a JSON POST containing:

```json
{
  "purpose": "account_contact_verification",
  "channel": "email",
  "destination": "person@example.com",
  "code": "123456",
  "expiresAt": "2026-08-07T10:00:00.000Z"
}
```

`channel` is either `email` or `phone`. The relay is responsible for rendering and delivering the message through the approved downstream email or SMS service. A non-success relay response invalidates the issued challenge and the API returns a temporary-delivery failure.

Verification controls include:

- 10-minute code expiry;
- one-minute resend cooldown;
- at most five issuance requests per hour and ten per day for each account/channel pair;
- five confirmation attempts per issued code;
- older outstanding codes invalidated when a new code is issued;
- contact fingerprint binding so changing the account contact invalidates an older challenge;
- transactionally single-use consumption; and
- audit records for issuance and successful verification.

A pending account becomes active after its first configured contact method is successfully verified. Email and phone verification timestamps remain independent so both contacts can be verified when both are present.

## Password recovery and session security

Set `PASSWORD_RESET_PEPPER` to an independent secret of at least 32 characters. It HMACs opaque reset tokens and target fingerprints. Do not reuse `PASSWORD_PEPPER` or `VERIFICATION_CODE_PEPPER`.

Password recovery reuses the provider-neutral account-security delivery relay. For password-reset delivery the relay receives `purpose: account_password_reset`, `channel: email`, `destination`, the opaque `token`, and `expiresAt`. Production therefore has the same HTTP, bearer-token, and HTTPS requirements described above.

Reset tokens expire after 20 minutes, are single-use, and are replaced by a newer request. Successful password reset and authenticated password change both revoke all refresh sessions and invalidate outstanding reset tokens. Active sessions can also be listed and revoked individually or all at once. See `PASSWORD_SECURITY.md` for the complete behavior and API contracts.

## Human challenge provider

The API supports a provider-neutral challenge verifier with Cloudflare Turnstile as the first real provider.

Configure these deployment variables through the hosting platform's secret manager rather than committing credentials:

- `CHALLENGE_PROVIDER`: use `turnstile` to enable Cloudflare Turnstile or `none` to remain fail-closed.
- `TURNSTILE_SITE_KEY`: the public browser site key returned through `/v1/challenge/config`.
- `TURNSTILE_SECRET_KEY`: the private server-side Turnstile secret. Never expose this value to a browser or mobile client.
- `TURNSTILE_EXPECTED_HOSTNAME`: optional exact hostname returned by Siteverify, such as `suqnaa.com`.
- `TURNSTILE_TIMEOUT_MS`: provider request timeout from 500 to 15000 milliseconds; defaults to 5000.
- `NEXT_PUBLIC_CHALLENGE_SCRIPT_URL`: optional web override for the provider script URL. Leave unset to use the standard Turnstile script.

Both the public site key and private secret must be configured before `/v1/challenge/config` reports the provider as enabled. When the provider is missing or incomplete, challenged operations remain blocked with `challenge_provider_not_configured`.

Turnstile actions are derived from the protected API action by replacing unsupported characters with underscores and limiting the value to 32 characters. Examples:

- `account.login` becomes `account_login`
- `account.register` becomes `account_register`
- `account.password_reset_request` becomes `account_password_reset_request`
- `listing.create` becomes `listing_create`
- `message.create` becomes `message_create`

The client widget uses the action values returned by `/v1/challenge/config`, allowing the server to reject action-mismatched tokens.

For local integration tests, use Cloudflare's published test sitekey and secret-key pairs through local environment files or CI secrets. Do not use testing keys in production.

## Signed payment-provider events

Payment-event ingestion is disabled by default. It is a server-to-server endpoint and is not exposed through the browser proxy or mobile clients.

Configure these variables only after a payment provider and the applicable compliance controls have been approved:

- `PAYMENT_EVENT_PROVIDER`: safe lowercase provider identifier using letters, digits, underscores, or hyphens. Use `none` to disable the endpoint.
- `PAYMENT_EVENT_SIGNING_SECRET`: private HMAC signing secret containing 32 to 512 characters. Store it only in the deployment secret manager.
- `PAYMENT_EVENT_MAX_AGE_SECONDS`: maximum accepted delivery age from 30 to 900 seconds; defaults to 300.

The provider identifier and signing secret must be configured together. Invalid or partial configuration fails startup rather than accepting unsigned events. The signing secret is never returned through an API response or public configuration endpoint.

The accepted event format, canonical signature fields, replay behavior, transition constraints, and disabled payment operations are documented in `PAYMENT_PROVIDER_EVENTS.md`.

## Web session cookies

After successful authentication, the web client immediately transfers the access and refresh credentials to a same-origin route that stores them as HttpOnly, SameSite=Lax cookies. The application does not persist these credentials in localStorage or sessionStorage.

The access cookie is short-lived. When it expires, the account page calls the same-origin refresh route, which reads the HttpOnly refresh cookie server-side, rotates the API refresh session, and replaces both cookies. Browser tabs coordinate through the Web Locks API where available, and the client retries once to tolerate a concurrent rotation.

Refresh and logout requests use separate per-session and per-IP limits. Rotation revokes the previous refresh session and creates the replacement in one database transaction, preventing one token from branching into multiple active sessions.

Signing out calls the API logout endpoint before removing the local cookies. Cookie removal still completes if the API is temporarily unavailable.

Planned feature flags should cover protected checkout, timed sales, and optional digital currency support. These features should stay disabled until payment providers, verification rules, and country-specific compliance requirements are reviewed.
