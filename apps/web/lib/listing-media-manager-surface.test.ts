import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const manager = readFileSync(
  new URL('../components/listing-media-manager-panel.tsx', import.meta.url),
  'utf8'
);
const page = readFileSync(
  new URL('../app/[locale]/sell/media/page.tsx', import.meta.url),
  'utf8'
);
const listingsPanel = readFileSync(
  new URL('../components/my-listings-panel.tsx', import.meta.url),
  'utf8'
);
const sellForm = readFileSync(
  new URL('../components/sell-listing-form.tsx', import.meta.url),
  'utf8'
);
const proxy = readFileSync(
  new URL('../app/api/authed/[...segments]/route.ts', import.meta.url),
  'utf8'
);
const policy = readFileSync(
  new URL('./protected-route-policy.ts', import.meta.url),
  'utf8'
);

assert.match(manager, /getMyListings\(\{ limit: 50 \}\)/);
assert.match(manager, /getMyListingMedia\(listingId\)/);
assert.match(manager, /uploadListingMedia/);
assert.match(manager, /deleteListingMedia/);
assert.match(manager, /configuration\?\.actions\.listingMediaUpload/);
assert.match(manager, /configuration\?\.actions\.listingMediaDelete/);
assert.match(manager, /maximumPhotoCount = 8/);
assert.match(manager, /maximumPhotoBytes = 4 \* 1024 \* 1024/);
assert.match(manager, /allowedPhotoTypes/);
assert.match(manager, /type="file"/);
assert.doesNotMatch(manager, /multiple/);
assert.match(manager, /selectedListing\.status !== 'sold'/);
assert.match(manager, /selectedListing\.status !== 'removed'/);
assert.match(manager, /media\.url/);
assert.match(manager, /challengeReady/);
assert.match(manager, /one image per verified operation/i);

assert.match(page, /ListingMediaManagerPanel/);
assert.match(page, /loadAccountSessionState/);
assert.match(page, /SessionRefresh/);
assert.match(page, /Sign in to manage your listing photos/);

assert.doesNotMatch(listingsPanel, /deleteListingMedia/);
assert.match(listingsPanel, /href=\{`\/\$\{locale\}\/sell\/media`\}/);
assert.match(listingsPanel, /configuration\?\.actions\.listingStatusUpdate/);
assert.doesNotMatch(listingsPanel, /listingMediaDelete/);

assert.match(sellForm, /disabled=\{challengeEnabled\}/);
assert.match(sellForm, /each image receives separate verification/i);
assert.match(sellForm, /href=\{`\/\$\{locale\}\/sell\/media`\}/);
assert.doesNotMatch(sellForm, /listingMediaUpload/);

assert.match(proxy, /isOwnerMediaDeliveryRoute/);
assert.match(proxy, /apiResponse\.arrayBuffer\(\)/);
assert.match(proxy, /redirect: 'follow'/);
assert.match(proxy, /private, max-age=60/);
assert.doesNotMatch(proxy, /headers\.set\('Location'/);

assert.match(
  policy,
  /\/v1\/listings\/\$\{uuid\}\/media\/mine\$/
);
assert.match(
  policy,
  /\/v1\/listings\/\$\{uuid\}\/media\/\$\{uuid\}\/mine\$/
);
