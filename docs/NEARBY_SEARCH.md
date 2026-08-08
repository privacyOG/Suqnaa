# Nearby marketplace search

Suqnaa nearby search uses PostgreSQL/PostGIS geography operations without publishing seller coordinates.

## Privacy model

- A seller may optionally configure one approximate listing point.
- Latitude and longitude are normalized to a `0.01` degree grid before persistence.
- The database enforces the same grid, valid WGS84 ranges, and SRID 4326.
- Public catalogue, listing-detail, saved/watch/recent, and notification payloads never contain latitude or longitude.
- A buyer nearby-search centre is normalized to the same `0.01` degree grid before the API evaluates it.
- Saved-search centres are normalized before persistence and before their fingerprint is calculated.
- Public results expose only a coarse whole-kilometre `distanceKm` value when a nearby centre is supplied.
- Text location fields such as country, region, city, and suburb remain independent marketplace filters and do not reveal the stored geography point.
- The applications do not request device/browser geolocation permission for this feature. Users enter an approximate centre explicitly.

The grid intentionally trades exactness for location privacy. A `0.01` degree step is roughly kilometre-scale in latitude; longitude scale varies by latitude.

## Seller location lifecycle

Owner-only routes:

- `GET /v1/listings/:listingId/location/manage`
- `POST /v1/listings/:listingId/location`

The owner response may contain the quantized point because the seller supplied and manages it. These routes are never public catalogue routes.

Location writes:

- require authentication and listing ownership;
- are allowed only while normal seller details are editable (`draft`, `active`, or `expired`);
- submit the current listing `edit_version`;
- return `409` after any intervening listing update;
- use no-op detection so resubmitting the same quantized point does not advance the version;
- may clear the point by submitting `null`;
- advance the existing database-managed `edit_version` on a real change;
- use the existing listing-edit human-verification action;
- audit whether a point is configured without recording coordinates in security-audit metadata.

The web edit page includes the approximate-location manager. Native mobile edits the point directly only when browser challenge verification is disabled. When browser verification is enabled, mobile performs no location mutation and opens the exact localized secure listing edit page with only the listing UUID in the path.

## Public nearby search

The existing catalogue endpoint accepts the optional spatial trio:

- `nearLat`
- `nearLon`
- `radiusKm`

All three values must be supplied together. Radius is bounded to `1` through `500` kilometres. `sort=distance` is valid only when the spatial trio is present.

PostGIS performs the actual spatial work:

- `ST_DWithin(listings.location, centre, radius_meters)` determines radius inclusion.
- `ST_Distance(listings.location, centre)` provides nearest-first ordering and the internal distance cursor value.
- listings without an approximate point do not match a radius query.
- a partial GiST index covers non-null locations on active listings.

Nearby filters compose with the existing text, category, condition, availability, price/currency, country, region, city, suburb, and pickup/delivery filters.

## Pagination

The existing opaque catalogue cursor now supports `sort=distance`.

A distance cursor binds:

- the complete normalized filter fingerprint, including centre and radius;
- internal distance in metres;
- listing creation timestamp;
- listing UUID.

Ordering is deterministic:

1. distance ascending;
2. creation timestamp descending;
3. listing UUID descending.

A cursor cannot be replayed with a different centre, radius, or other filter set. Existing newest and price cursors retain their prior behavior, including legacy timestamp compatibility for newest-only pagination.

The internal metre value is a pagination mechanism only. It is not returned as public distance precision.

## Saved searches and notifications

Spatial saved searches use the same normalized catalogue filter contract. Their fingerprint includes the quantized centre and radius.

The discovery notification worker applies the same `ST_DWithin` predicate while scanning listings. Therefore a saved search such as “within 20 km” produces alerts only for matching active listings inside that radius, while retaining the existing cursor, deduplication, seller-status, and owner-exclusion rules.

Changing a saved search's spatial filters follows the existing saved-search reset behavior: the filter fingerprint changes, prior match alerts for that search are cleared, and its evaluation cursor restarts at the change time rather than generating a historical backlog.

## Client behavior

Web:

- catalogue filters accept approximate latitude, longitude, and radius;
- nearest-first sorting is available for a valid nearby search;
- result cards display coarse distance only;
- the current spatial filter set can be saved;
- seller listing editing includes an owner-only approximate-location form.

Mobile:

- the native catalogue filter sheet supports the same centre/radius validation and nearest ordering;
- outbound centre coordinates are serialized at two-decimal precision;
- result models accept only a non-negative whole-kilometre distance and have no coordinate fields;
- saved current searches retain the spatial filter trio;
- My Listings links to an approximate-location manager;
- challenge-enabled location changes use the existing secure web handoff rather than a native mutation.

## Operational checks

The standard validation gate covers:

- 25-entry fresh, repeat, legacy-adoption, and base-to-head migration paths;
- schema equality after fresh and upgrade migrations;
- privacy-grid database constraint rejection of overly precise points;
- real PostGIS radius inclusion/exclusion and distance ordering;
- owner-only optimistic location updates;
- spatial saved-search notification matching;
- filter-bound distance cursors;
- exact protected web proxy paths;
- web and mobile spatial transport/presentation;
- challenge-disabled native location writes and challenge-enabled secure handoff.
