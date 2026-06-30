# Listing media storage

Suqnaa supports two listing media storage modes.

## Local development mode

Use local mode for developer machines and temporary staging only.

Required setting:

```text
MEDIA_STORAGE_DRIVER=local
MEDIA_STORAGE_DIR=.suqnaa-media
```

In this mode, listing images are written under the local media directory and the API streams the file through the public listing-media route.

## S3-compatible production mode

Use S3-compatible mode for production or shared staging.

Required settings:

```text
MEDIA_STORAGE_DRIVER=s3
S3_ENDPOINT=<object-storage-endpoint>
S3_REGION=<object-storage-region>
S3_BUCKET=<bucket-name>
S3_ACCESS_KEY=<access-key>
S3_SECRET_KEY=<secret-key>
S3_FORCE_PATH_STYLE=true
```

The API writes listing images to the configured bucket. The `object_key` stored in the database remains the internal bucket key and is not exposed to sellers.

## Delivery options

### CDN or public bucket delivery

When media files are safe to serve through a CDN or public bucket path, configure:

```text
MEDIA_PUBLIC_BASE_URL=<cdn-or-public-bucket-base-url>
```

The public listing-media route validates that the listing is active and the seller is not closed or suspended, then redirects to the configured public URL for the object key.

### Signed delivery

If `MEDIA_PUBLIC_BASE_URL` is empty in S3 mode, the API creates a short-lived signed object URL and redirects the browser to it.

Optional setting:

```text
MEDIA_SIGNED_URL_TTL_SECONDS=900
```

Use a short TTL for private buckets. The default is 900 seconds.

## Current security controls

- Uploads require an authenticated seller-owned listing.
- Closed listings cannot receive new media.
- Uploads are rate limited by account and IP.
- The backend validates JPEG, PNG, and WebP file signatures.
- Each listing is capped at 8 photos.
- Each image is capped at 4 MB.
- SHA-256 is stored for each uploaded object.

## Still required before full public launch

- Malware scanning or image moderation pipeline.
- Image resizing/thumbnail generation.
- Object lifecycle and retention rules.
- Backup/restore checks for the bucket and database metadata.
- Operational monitoring for failed uploads and failed delivery redirects.
