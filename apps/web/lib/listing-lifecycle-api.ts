import { getAuthed, postAuthed } from './authed-api';

export interface ListingLifecycleSnapshot {
  listing: {
    id: string;
    title?: string;
    status: string;
    availabilityStatus: string;
    availableQuantity: number | null;
    expiresAt: string | null;
    lastRenewedAt: string | null;
    version: number;
    updatedAt: string;
  };
  renewable: boolean;
  renewalAvailableAt: string | null;
  activeDays: number;
}

export interface ListingLifecycleMutationResponse {
  listing: ListingLifecycleSnapshot['listing'];
  reactivated: boolean;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function listingId(value: string): string {
  const normalized = value.trim();
  if (!uuidPattern.test(normalized)) {
    throw new Error('Listing identifier must be a UUID');
  }
  return normalized;
}

export function getListingLifecycle(id: string): Promise<ListingLifecycleSnapshot> {
  return getAuthed<ListingLifecycleSnapshot>(`/v1/listings/${listingId(id)}/lifecycle`);
}

export function renewListingLifecycle(
  id: string,
  version: number
): Promise<ListingLifecycleMutationResponse> {
  if (!Number.isInteger(version) || version <= 0) {
    throw new Error('Listing version must be a positive integer');
  }
  return postAuthed<ListingLifecycleMutationResponse>(
    `/v1/listings/${listingId(id)}/renew`,
    { version }
  );
}
