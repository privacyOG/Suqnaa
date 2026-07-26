import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const routeDirectory = fileURLToPath(new URL('.', import.meta.url));
const serverSource = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');

const removedRouteFiles = [
  'auctions.ts',
  'disputes.ts',
  'verification.ts'
];

for (const filename of removedRouteFiles) {
  assert.equal(
    existsSync(`${routeDirectory}/${filename}`),
    false,
    `${filename} must remain quarantined until its complete protected implementation is approved`
  );
}

const removedRegistrations = [
  './routes/auctions.js',
  './routes/disputes.js',
  './routes/verification.js',
  'auctionRoutes',
  'disputeRoutes',
  'verificationRoutes'
];

for (const registration of removedRegistrations) {
  assert.equal(
    serverSource.includes(registration),
    false,
    `Deferred route registration is not permitted: ${registration}`
  );
}

console.log('Deferred marketplace routes remain quarantined.');
