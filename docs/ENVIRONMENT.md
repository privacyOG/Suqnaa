# Environment settings

The main example environment file is `.env.example`.

## Web origin

Set `WEB_ORIGIN` to the exact browser origin allowed to call the API, for example `https://suqnaa.com`. The API permits only that origin and only the headers required by the web client, including `x-suqnaa-human-check`.

The web application uses `NEXT_PUBLIC_API_BASE_URL` for browser API requests and may use `API_BASE_URL` for server-side account requests. Local development defaults to `http://localhost:4000`.

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
- `listing.create` becomes `listing_create`
- `message.create` becomes `message_create`

The client widget uses the action values returned by `/v1/challenge/config`, allowing the server to reject action-mismatched tokens.

For local integration tests, use Cloudflare's published test sitekey and secret-key pairs through local environment files or CI secrets. Do not use testing keys in production.

## Web session cookies

After successful authentication, the web client immediately transfers the access and refresh credentials to a same-origin route that stores them as HttpOnly, SameSite=Lax cookies. The application does not persist these credentials in localStorage or sessionStorage.

Planned feature flags should cover protected checkout, auctions, and optional digital currency support. These features should stay disabled until payment providers, verification rules, and country-specific compliance requirements are reviewed.
