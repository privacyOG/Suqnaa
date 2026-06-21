# Environment settings

The main example environment file is `.env.example`.

## Human challenge provider

The API supports a provider-neutral challenge verifier with Cloudflare Turnstile as the first real provider.

Configure these deployment variables through the hosting platform's secret manager rather than committing credentials:

- `CHALLENGE_PROVIDER`: use `turnstile` to enable Cloudflare Turnstile or `none` to remain fail-closed.
- `TURNSTILE_SECRET_KEY`: the private server-side Turnstile secret. Never expose this value to a browser or mobile client.
- `TURNSTILE_EXPECTED_HOSTNAME`: optional exact hostname returned by Siteverify, such as `suqnaa.com`.
- `TURNSTILE_TIMEOUT_MS`: provider request timeout from 500 to 15000 milliseconds; defaults to 5000.

When the provider is missing or its secret is empty, challenged operations remain blocked with `challenge_provider_not_configured`.

Turnstile actions are derived from the protected API action by replacing unsupported characters with underscores and limiting the value to 32 characters. Examples:

- `account.login` becomes `account_login`
- `listing.create` becomes `listing_create`
- `message.create` becomes `message_create`

The client widget must use the same normalized action so the server can reject action-mismatched tokens.

For local integration tests, use Cloudflare's published test sitekey and secret-key pairs through local environment files or CI secrets. Do not use testing keys in production.

Planned feature flags should cover protected checkout, auctions, and optional digital currency support. These features should stay disabled until payment providers, verification rules, and country-specific compliance requirements are reviewed.
