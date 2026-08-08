import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { closeDb, db } from '../db/index.js';
import {
  coarseDistanceKm,
  listingLocationGeography,
  normalizeApproximateListingLocation
} from '../listings/listing-location.js';

const sellerId = randomUUID();
const now = new Date();

async function insertListing(input: {
  title: string;
  latitude?: number;
  longitude?: number;
}) {
  const id = randomUUID();
  const location = input.latitude === undefined || input.longitude === undefined
    ? null
    : normalizeApproximateListingLocation({
        latitude: input.latitude,
        longitude: input.longitude
      });
  await db.insertInto('listings').values({
    id,
    seller_id: sellerId,
    title: input.title,
    description: `${input.title} nearby search integration record.`,
    price_amount: '100.00',
    currency_code: 'AUD',
    condition: 'good',
    availability_status: 'in_stock',
    available_quantity: 1,
    status: 'active',
    country_code: 'AU',
    region: 'NSW',
    city: 'Sydney',
    suburb: 'Test suburb',
    location: location ? listingLocationGeography(location) : null,
    allow_pickup: true,
    allow_delivery: false,
    published_at: now,
    expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    created_at: now,
    updated_at: now
  }).execute();
  return id;
}

try {
  await db.insertInto('users').values({
    id: sellerId,
    email: `nearby-${sellerId}@example.test`,
    display_name: 'Nearby Seller',
    status: 'active',
    email_verified_at: now,
    created_at: now,
    updated_at: now
  }).execute();

  const nearestId = await insertListing({
    title: 'Nearby one',
    latitude: -33.8688,
    longitude: 151.2093
  });
  const secondId = await insertListing({
    title: 'Nearby two',
    latitude: -33.91,
    longitude: 151.18
  });
  await insertListing({
    title: 'Far away',
    latitude: -37.81,
    longitude: 144.96
  });
  await insertListing({ title: 'No map point' });

  const centre = listingLocationGeography(
    normalizeApproximateListingLocation({ latitude: -33.87, longitude: 151.21 })
  );
  const rows = await db.selectFrom('listings')
    .select([
      'id',
      sql<number>`ST_Distance(location, ${centre})`.as('distance_meters')
    ])
    .where('seller_id', '=', sellerId)
    .where(sql<boolean>`ST_DWithin(location, ${centre}, ${15_000})`)
    .orderBy(sql<number>`ST_Distance(location, ${centre})`, 'asc')
    .orderBy('id', 'asc')
    .execute();

  assert.deepEqual(rows.map((row) => row.id), [nearestId, secondId]);
  assert.equal(coarseDistanceKm(rows[0]?.distance_meters), 0);
  assert.ok((coarseDistanceKm(rows[1]?.distance_meters) ?? 0) >= 4);

  const stored = await db.selectFrom('listings')
    .select([
      sql<number>`ST_Y(location::geometry)`.as('latitude'),
      sql<number>`ST_X(location::geometry)`.as('longitude')
    ])
    .where('id', '=', nearestId)
    .executeTakeFirstOrThrow();
  assert.equal(Number(stored.latitude), -33.87);
  assert.equal(Number(stored.longitude), 151.21);

  await assert.rejects(
    () => sql`
      INSERT INTO listings (
        id, seller_id, title, description, price_amount, currency_code,
        condition, availability_status, available_quantity, status,
        country_code, location, allow_pickup, allow_delivery,
        published_at, expires_at, created_at, updated_at
      ) VALUES (
        ${randomUUID()}::uuid,
        ${sellerId}::uuid,
        'Too precise',
        'This precise point should violate the privacy grid constraint.',
        10,
        'AUD',
        'good',
        'in_stock',
        1,
        'active',
        'AU',
        ST_SetSRID(ST_MakePoint(151.2092955, -33.8688197), 4326)::geography,
        true,
        false,
        now(),
        now() + interval '30 days',
        now(),
        now()
      )
    `.execute(db),
    /listings_location_privacy_grid_check/
  );

  console.log('PostGIS nearby search integration tests passed.');
} finally {
  await db.deleteFrom('listings').where('seller_id', '=', sellerId).execute();
  await db.deleteFrom('users').where('id', '=', sellerId).execute();
  await closeDb();
}
