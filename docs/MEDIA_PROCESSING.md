# Marketplace media processing and lifecycle

This document defines the production handling policy for listing images introduced by tracker P1-04.

## Admission boundary

Listing uploads accept only JPEG, PNG and WebP bodies up to the API media byte limit. The API validates the declared content type against magic bytes, parses dimensions from the file itself and rejects malformed/truncated input, dimensions above 12,000 px per axis, or decoded images above 40 megapixels before invoking a decoder.

The original validated upload bytes are sent to the configured media reviewer before ImageMagick is invoked. Production must set `MEDIA_REVIEW_PROVIDER=clamd` (or install another explicitly approved reviewer implementation) and, for the bundled ClamAV reviewer, must set `CLAMAV_HOST`. Optional `CLAMAV_PORT` defaults to `3310`; `CLAMAV_TIMEOUT_MS` defaults to `10000`. Scanner connection failures, timeouts and unrecognized replies fail closed with a service-unavailable response. Malware findings are rejected and are never written to object storage.

## Pixel normalization

Clean or quarantined images are decoded through the ImageMagick `convert` command installed in the production API/worker image. The adapter pins the decoder from the already validated MIME type (`jpeg:-`, `png:-` or `webp:-`) rather than relying on format auto-detection. It applies EXIF auto-orientation, strips metadata, bounds the public image to 2048 px and the thumbnail to 512 px, and emits WebP.

The subprocess is constrained to 128 MiB memory, 256 MiB map, 512 MiB disk, two threads and a 15 second application timeout. `MEDIA_IMAGE_CONVERT_COMMAND` may override the executable path for controlled deployments/tests; production operators should leave it unset unless they pin an approved ImageMagick binary.

## Storage classes

### Clean media

Only normalized outputs are persisted:

- `listing-media/<listing>/<media>.webp` — public normalized image.
- `listing-media/<listing>/<media>.thumbnail.webp` — public thumbnail derivative.

The source upload is intentionally **not retained** after successful review/transformation. This is the private-original lifecycle decision for Suqnaa: discard the raw source rather than accumulating EXIF/location metadata or an additional sensitive object copy. The normalized image row is stored in `listing_media`; thumbnail metadata is stored in `listing_media_derivatives`.

### Quarantined media

Quarantined output is isolated under `listing-media-quarantine/` and represented only in `listing_media_quarantine`; it never enters public `listing_media`. Quarantine entries expire after seven days unless resolved sooner. The `worker:media-quarantine` worker removes expired objects before resolving their rows.

### Rejected media

Rejected media is never persisted.

## Delivery

The primary public image remains available at:

`/v1/listings/:listingId/media/:mediaId`

The bounded thumbnail derivative is available at:

`/v1/listings/:listingId/media/:mediaId/thumbnail`

Both public delivery paths require the listing to be active and the seller account not to be suspended/closed. Object delivery keeps the existing S3/public-CDN or signed-URL policy from `listing-media-storage.ts`.

## Deletion and orphan prevention

Deleting listing media fetches all registered derivative object keys, removes the primary and derivative objects first, and only then deletes the `listing_media` row. This ordering prevents the database `ON DELETE CASCADE` from destroying the derivative inventory before storage cleanup can occur. Storage write failures during ready-media persistence are rolled back for both the primary and thumbnail object; quarantine writes are similarly rolled back on database failure.

The storage API uses idempotent deletion semantics for the local driver and S3 `DeleteObject`, so retries are safe. Expired quarantine cleanup is also idempotent.

## Production configuration checklist

Required media/storage settings remain those documented in `PRODUCTION_INFRASTRUCTURE.md`, including S3 credentials/bucket configuration. For media safety additionally configure:

- `MEDIA_REVIEW_PROVIDER=clamd`
- `CLAMAV_HOST=<private clamd hostname or IP>`
- `CLAMAV_PORT=3310` when the service is not using the default
- `CLAMAV_TIMEOUT_MS=10000` unless an approved deployment requires a different positive value

The ClamAV endpoint must be reachable only on trusted/private infrastructure; do not expose clamd directly to the public Internet. Production deploys must verify scanner reachability before opening media uploads.

## Operational checks

Before release, verify fresh and upgrade migration validation, API typecheck/tests, production API/worker image builds, one clean upload, one malware rejection using an approved scanner test fixture, one EXIF-rotated image, thumbnail delivery, deletion of both primary/thumbnail storage objects, and expired-quarantine cleanup in staging.
