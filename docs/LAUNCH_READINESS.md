# Launch readiness

This document tracks what is required before Suqnaa can move from local development to staging, public beta, and full marketplace launch.

## Current launch status

- **Private staging/demo:** allowed once the web app, API, database, and environment variables are deployed together.
- **Public landing page:** allowed once final contact details and production hosting are configured.
- **Full public marketplace:** blocked until object storage is provisioned, moderation, verification, payments/compliance, backups, and operational monitoring are completed.

## Website readiness

- [x] Bilingual landing routes exist at `/en` and `/ar`.
- [x] Root `/` redirects to `/en` so visitors do not land on a basic language selector.
- [x] Public catalog route exists at `/{locale}/listings`.
- [x] Listing detail route exists at `/{locale}/listings/{listingId}`.
- [x] Account sign-in and registration pages exist.
- [x] Seller draft creation and listing management pages exist.
- [x] Footer navigation links to draft Terms, Privacy, item rules, safety, and contact pages.
- [x] Draft bilingual policy pages exist under `/{locale}/policy/{pageSlug}`.
- [x] Seller listing form supports category selection, photo uploads, availability status, quantity, and unit label.
- [x] Public catalog and listing details can display uploaded listing photos.
- [x] Media delivery can use local development storage, public object URLs, or short-lived signed object URLs.
- [ ] Replace draft policy copy with final legally reviewed terms, privacy, item-rules, safety, and contact content.
- [ ] Add SEO metadata for marketplace, listing, account, and seller pages.
- [ ] Add production analytics/error monitoring only after privacy review.

## Deployment readiness

- [x] Root package scripts include `typecheck`, `test`, `build`, and `ci`.
- [x] GitHub Actions CI has been added for pull requests and main-branch pushes.
- [ ] Commit a generated `pnpm-lock.yaml` from a clean local install.
- [ ] Choose production hosting for `apps/web`.
- [ ] Choose production hosting for `apps/api`.
- [ ] Configure HTTPS and custom domain routing for `suqnaa.com`.
- [ ] Configure production `WEB_ORIGIN`, `NEXT_PUBLIC_API_BASE_URL`, and `API_BASE_URL`.
- [ ] Configure production secrets through the hosting provider's secret manager.
- [ ] Add a production database migration process.
- [ ] Add backup and restore procedures.

## Data and infrastructure readiness

- [ ] Provision production PostgreSQL with PostGIS.
- [ ] Provision production Redis or replace in-memory limits with a durable shared rate-limit store.
- [ ] Provision production object storage for listing media and configure the API to use it.
- [x] Add S3-compatible media storage adapter for listing media.
- [x] Add upload limits and server-side MIME validation for listing images.
- [ ] Add malware scanning and image processing before full public launch.
- [ ] Add object lifecycle and retention rules.
- [ ] Add database backups with restore testing.

## Security readiness

- [x] Access and refresh tokens are separated.
- [x] Web session storage uses HttpOnly cookies.
- [x] Same-origin protected API transport exists for authenticated browser actions.
- [x] Basic rate limits exist on high-risk routes.
- [x] Listing media uploads require seller ownership and are rate limited.
- [x] Private object buckets can be served through short-lived signed URLs.
- [x] User/listing reports require authentication, rate limits, and protected browser transport.
- [ ] Configure Cloudflare Turnstile or another real challenge provider in production.
- [ ] Verify CORS only allows the production web origin.
- [ ] Add security headers at the edge or hosting layer.
- [ ] Add audit-log review process for sensitive actions.
- [ ] Add admin-only moderation workflows before public marketplace launch.

## Marketplace readiness

- [x] Draft listing creation exists.
- [x] Seller listing status transitions exist.
- [x] Public active listings exist.
- [x] Buyer-to-seller messaging and offer flows exist at code level.
- [x] Listing photo upload and display exists for staging/development.
- [x] Item and service availability fields exist.
- [x] Category selection is exposed in the listing form.
- [x] Reporting flows for users/listings are exposed from listing details.
- [ ] Admin review and takedown tools must be created before public launch.
- [ ] Final item rules must be written and reviewed.
- [ ] Buyer/seller safety guidance must be linked from listing and messaging flows.

## Payments, orders, and compliance

- [ ] Keep real payments disabled until provider and compliance review is complete.
- [ ] Decide whether Suqnaa is classified as a marketplace, payment facilitator, escrow-like service, or simple classifieds platform in each target jurisdiction.
- [ ] Select payment provider terms that support marketplace transactions.
- [ ] Define buyer protection, seller protection, refunds, chargebacks, and disputes.
- [ ] Keep cryptocurrency features disabled or sandboxed until AML/CTF, sanctions, KYC thresholds, and digital-currency obligations are reviewed.

## Release gates

### Staging gate

Staging can go live when:

1. CI passes.
2. Web and API deploy successfully.
3. Production-like environment variables are configured.
4. Test accounts can register, sign in, create a listing with photos, publish it, message, and make an offer.

### Public beta gate

Public beta can go live when:

1. Production object storage is provisioned and configured.
2. Final legal and safety pages are published.
3. Moderation/reporting process exists.
4. Backups and monitoring are active.
5. Real payments are disabled unless compliance review is complete.

### Full marketplace gate

Full launch can go live when:

1. Payment and dispute flows are legally reviewed.
2. Admin moderation and fraud workflows are operational.
3. Media, database, logs, backups, and incident response are production-ready.
4. Terms, privacy, item rules, refund/dispute, and safety policies are final.
