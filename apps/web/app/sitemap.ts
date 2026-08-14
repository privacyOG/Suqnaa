import type { MetadataRoute } from 'next';
import { locales } from '../i18n/locales';
import { getPublicListings } from '../lib/public-listing-api';
import { absoluteUrl } from '../lib/seo';

const staticPaths = ['', '/listings', '/legal'];
const maxListingPages = 10;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [];

  for (const locale of locales) {
    for (const path of staticPaths) {
      entries.push({
        url: absoluteUrl(`/${locale}${path}`),
        changeFrequency: path === '/listings' ? 'hourly' : 'weekly',
        priority: path === '' ? 1 : path === '/listings' ? 0.9 : 0.4
      });
    }
  }

  try {
    let before: string | undefined;
    for (let page = 0; page < maxListingPages; page += 1) {
      const response = await getPublicListings({ limit: 100, before, sort: 'newest' });
      for (const listing of response.listings) {
        const lastModified = new Date(listing.publishedAt ?? listing.createdAt);
        for (const locale of locales) {
          entries.push({
            url: absoluteUrl(`/${locale}/listings/${listing.id}`),
            lastModified: Number.isNaN(lastModified.getTime()) ? undefined : lastModified,
            changeFrequency: 'daily',
            priority: 0.8
          });
        }
      }
      if (!response.pagination.hasMore || !response.pagination.nextCursor) break;
      before = response.pagination.nextCursor;
    }
  } catch {
    // Static marketplace discovery URLs remain available if the API is temporarily unavailable.
  }

  return entries;
}
