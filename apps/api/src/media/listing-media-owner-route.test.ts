import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const route = readFileSync(
  new URL('../routes/listing-media.ts', import.meta.url),
  'utf8'
);
const challenge = readFileSync(
  new URL('../security/challenge-config.ts', import.meta.url),
  'utf8'
);

assert.match(
  route,
  /app\.get\(\s*'\/listings\/:listingId\/media\/mine'/
);
assert.match(
  route,
  /app\.get\(\s*'\/listings\/:listingId\/media\/:mediaId\/mine'/
);
assert.match(route, /preHandler: requireUser/g);
assert.match(route, /listing\.seller_id !== authRequest\.user\.sub/);
assert.match(route, /media\.seller_id !== authRequest\.user\.sub/);
assert.match(route, /listing\.media_mine/);
assert.match(route, /listing\.media_owner_delivery/);
assert.match(route, /orderBy\('sort_order', 'asc'\)/);
assert.match(route, /orderBy\('created_at', 'asc'\)/);
assert.match(route, /limit\(8\)/);
assert.match(route, /url: ownerMediaUrl\(listingId, id\)/);
assert.doesNotMatch(
  route,
  /ownerMediaSummary[\s\S]*object_key[\s\S]*createdAt/
);
assert.match(route, /getListingMediaStorage\(\)\.deliver/);
assert.match(route, /Cache-Control', 'private, max-age=60'/);
assert.match(route, /X-Content-Type-Options', 'nosniff'/);
assert.match(route, /listing\.media_delete/);
assert.match(route, /Listing is closed for media changes/);

assert.match(
  challenge,
  /listingMediaUpload: toTurnstileAction\('listing\.media_upload'\)/
);
assert.match(
  challenge,
  /listingMediaDelete: toTurnstileAction\('listing\.media_delete'\)/
);
