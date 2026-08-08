'use client';

import { getAuthed, postAuthed } from './authed-api';
import type { PublicListingsOptions } from './public-listing-api';

export interface DiscoveryListingSummary {
  id: string;
  title: string;
  priceAmount: string | number;
  currencyCode: string;
  condition: string;
  availabilityStatus: string;
  availableQuantity: number | null;
  unitLabel: string | null;
  countryCode: string;
  region: string | null;
  city: string | null;
  suburb: string | null;
  allowPickup: boolean;
  allowDelivery: boolean;
  updatedAt: string;
  sellerDisplayName: string;
  media: Array<{
    id: string;
    url: string;
    mimeType: string;
    altText: string | null;
  }>;
}

export interface DiscoveryRelationshipItem {
  listingId: string;
  available: boolean;
  listing: DiscoveryListingSummary | null;
  relatedAt?: string;
  lastViewedAt?: string;
  viewCount?: number;
}

export interface SavedSearch {
  id: string;
  name: string;
  filters: Record<string, unknown>;
  fingerprint: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SavedSearchNotification {
  id: string;
  searchId: string;
  searchName: string;
  listingId: string;
  listingVersion: number;
  createdAt: string;
  readAt: string | null;
  available: boolean;
  listing: DiscoveryListingSummary | null;
}

export type SavedSearchFilterInput = Pick<
  PublicListingsOptions,
  | 'q'
  | 'categoryId'
  | 'condition'
  | 'availabilityStatus'
  | 'minPrice'
  | 'maxPrice'
  | 'currency'
  | 'country'
  | 'region'
  | 'city'
  | 'suburb'
  | 'fulfilment'
  | 'nearLat'
  | 'nearLon'
  | 'radiusKm'
>;

function listingPath(listingId: string): string {
  return encodeURIComponent(listingId);
}

export async function getDiscoveryState(listingId: string) {
  return getAuthed<{ state: { listingId: string; saved: boolean; watching: boolean } }>(
    `/v1/discovery/listings/${listingPath(listingId)}/state`
  ).then((payload) => payload.state);
}

export function saveDiscoveryListing(listingId: string) {
  return postAuthed(`/v1/discovery/saved-listings/${listingPath(listingId)}/save`, {});
}

export function removeDiscoverySavedListing(listingId: string) {
  return postAuthed(`/v1/discovery/saved-listings/${listingPath(listingId)}/remove`, {});
}

export function watchDiscoveryListing(listingId: string) {
  return postAuthed(`/v1/discovery/watchlist/${listingPath(listingId)}/watch`, {});
}

export function removeDiscoveryWatchedListing(listingId: string) {
  return postAuthed(`/v1/discovery/watchlist/${listingPath(listingId)}/remove`, {});
}

export function recordDiscoveryView(listingId: string) {
  return postAuthed(`/v1/discovery/recently-viewed/${listingPath(listingId)}/view`, {});
}

export async function getSavedListings(limit = 50) {
  const payload = await getAuthed<{ items: DiscoveryRelationshipItem[] }>(
    `/v1/discovery/saved-listings?limit=${limit}`
  );
  return payload.items;
}

export async function getWatchlist(limit = 50) {
  const payload = await getAuthed<{ items: DiscoveryRelationshipItem[] }>(
    `/v1/discovery/watchlist?limit=${limit}`
  );
  return payload.items;
}

export async function getRecentlyViewed(limit = 50) {
  const payload = await getAuthed<{ items: DiscoveryRelationshipItem[] }>(
    `/v1/discovery/recently-viewed?limit=${limit}`
  );
  return payload.items;
}

export async function getSavedSearches() {
  const payload = await getAuthed<{ searches: SavedSearch[] }>('/v1/discovery/saved-searches');
  return payload.searches;
}

export function createDiscoverySavedSearch(
  name: string,
  filters: SavedSearchFilterInput
) {
  return postAuthed<{ search: SavedSearch }>('/v1/discovery/saved-searches', { name, filters });
}

export function updateDiscoverySavedSearch(
  searchId: string,
  input: { name?: string; filters?: SavedSearchFilterInput; active?: boolean }
) {
  return postAuthed<{ search: SavedSearch }>(
    `/v1/discovery/saved-searches/${encodeURIComponent(searchId)}/update`,
    input
  );
}

export function deleteDiscoverySavedSearch(searchId: string) {
  return postAuthed(
    `/v1/discovery/saved-searches/${encodeURIComponent(searchId)}/delete`,
    {}
  );
}

export async function getSavedSearchNotifications(unreadOnly = false, limit = 50) {
  const payload = await getAuthed<{ notifications: SavedSearchNotification[] }>(
    `/v1/discovery/notifications?limit=${limit}&unreadOnly=${unreadOnly ? 'true' : 'false'}`
  );
  return payload.notifications;
}

export function markDiscoveryNotificationRead(notificationId: string) {
  return postAuthed(
    `/v1/discovery/notifications/${encodeURIComponent(notificationId)}/read`,
    {}
  );
}

export function markAllDiscoveryNotificationsRead() {
  return postAuthed('/v1/discovery/notifications/read-all', {});
}
