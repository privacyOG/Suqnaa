'use client';

import { getAuthed, postAuthed, type JsonBody } from './authed-api';

export interface ApproximateLocation {
  latitude: number;
  longitude: number;
}

export interface SellerListingLocationSnapshot {
  listingId: string;
  status: string;
  version: number;
  approximateLocation: ApproximateLocation | null;
  editable: boolean;
}

export interface SellerListingLocationResponse {
  listing: SellerListingLocationSnapshot;
  unchanged: boolean;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function listingIdPath(listingId: string): string {
  const normalized = listingId.trim();
  if (!uuidPattern.test(normalized)) throw new Error('Listing identifier must be a UUID');
  return encodeURIComponent(normalized);
}

export async function getSellerListingLocation(listingId: string) {
  return getAuthed<{ listing: SellerListingLocationSnapshot }>(
    `/v1/listings/${listingIdPath(listingId)}/location/manage`
  ).then((payload) => payload.listing);
}

export function updateSellerListingLocation(
  listingId: string,
  input: {
    version: number;
    approximateLocation: ApproximateLocation | null;
  } & JsonBody,
  challengeResponse?: string
) {
  return postAuthed<SellerListingLocationResponse>(
    `/v1/listings/${listingIdPath(listingId)}/location`,
    input,
    challengeResponse
  );
}
