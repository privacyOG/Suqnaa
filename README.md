# Suqnaa

Suqnaa is a trusted marketplace platform for web, Android, and iOS. The product is built around honest trade, fair pricing, verified sellers, secure payments, and high-quality listings.

## Current product direction

- Brand: `Suqnaa`
- Arabic brand: `سوقنا`
- Domain: `suqnaa.com`
- Current logo/app-icon artwork is stored as a replaceable brand reference in `assets/brand/`.
- The branding layer is isolated so the logo, app icon, colors, and typography can be replaced later without changing core product logic.

## Monorepo layout

```text
apps/
  api/       Fastify TypeScript API
  web/       Next.js website and web marketplace
  mobile/    Flutter Android/iOS app
packages/
  shared/    Shared TypeScript contracts and constants
docs/        Product, security, and architecture notes
infra/       Database and deployment helpers
assets/      Brand assets and replaceable visual references
```

## Recommended architecture

- **Mobile:** Flutter for Android and iOS from one codebase.
- **Website:** Next.js for SEO-friendly landing pages and web marketplace.
- **API:** Fastify + TypeScript for efficient, secure HTTP services.
- **Database:** PostgreSQL with PostGIS for location-based search.
- **Cache/queues:** Redis for sessions, rate limits, background jobs, and notifications.
- **Object storage:** S3-compatible storage for listing photos, documents, and future media.
- **Authentication:** Phone/email verification, Argon2 password hashing, short-lived access tokens, refresh-token rotation, audit trails.

## Local development

```bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm --filter @suqnaa/api dev
pnpm --filter @suqnaa/web dev
cd apps/mobile && flutter pub get && flutter run
```

## Security principles

- Validate every external request.
- Hash passwords with Argon2id.
- Use short-lived access tokens and rotate refresh tokens.
- Keep secrets out of source control.
- Store listing media outside the API container using object storage.
- Use audit logs for sensitive events.
- Use rate limits on authentication, messaging, listing creation, and payment flows.
- Use PostgreSQL constraints and indexes for integrity and performance.

## First milestones

1. Foundation: monorepo, database schema, API health/auth/listings skeleton, web landing page, mobile home screen.
2. Accounts: registration, login, verification, profile trust signals.
3. Listings: categories, photos, location search, save/watch listings.
4. Messaging: buyer-seller chat with abuse controls.
5. Offers and checkout: make offer, accept offer, transaction records, protected payment integration.
6. Admin: moderation, reports, audit logs, category management.
