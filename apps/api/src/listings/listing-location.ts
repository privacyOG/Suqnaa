import { sql, type RawBuilder } from 'kysely';
import { z } from 'zod';

export const listingLocationGridDegrees = 0.01;
export const maximumNearbyRadiusKm = 500;

const latitude = z.coerce.number().finite().min(-90).max(90);
const longitude = z.coerce.number().finite().min(-180).max(180);

export const approximateListingLocationInput = z.object({
  latitude,
  longitude
}).strict();

export interface ApproximateListingLocation {
  latitude: number;
  longitude: number;
}

function roundedCoordinate(value: number): number {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function normalizeApproximateListingLocation(
  input: unknown
): ApproximateListingLocation {
  const parsed = approximateListingLocationInput.parse(input);
  return {
    latitude: roundedCoordinate(parsed.latitude),
    longitude: roundedCoordinate(parsed.longitude)
  };
}

export function optionalApproximateListingLocation(
  input: unknown
): ApproximateListingLocation | null {
  return input === null || input === undefined
    ? null
    : normalizeApproximateListingLocation(input);
}

export function listingLocationGeography(
  location: ApproximateListingLocation
): RawBuilder<unknown> {
  return sql`ST_SetSRID(ST_MakePoint(${location.longitude}, ${location.latitude}), 4326)::geography`;
}

export function listingLocationPoint(
  latitudeValue: number,
  longitudeValue: number
): RawBuilder<unknown> {
  const location = normalizeApproximateListingLocation({
    latitude: latitudeValue,
    longitude: longitudeValue
  });
  return listingLocationGeography(location);
}

export function coarseDistanceKm(distanceMeters: unknown): number | null {
  const parsed = typeof distanceMeters === 'number'
    ? distanceMeters
    : Number(distanceMeters);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed / 1000);
}
