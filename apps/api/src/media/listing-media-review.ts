import { createHash } from 'node:crypto';
import type { SupportedListingImageMime } from './listing-media-upload.js';

export type ListingMediaReviewVerdict = 'clean' | 'reject' | 'quarantine';

export type ListingMediaReviewResult = {
  verdict: ListingMediaReviewVerdict;
  provider: string;
  reference?: string;
  reasonCodes: string[];
};

export type ListingMediaReviewInput = {
  buffer: Buffer;
  mimeType: SupportedListingImageMime;
  sha256: string;
};

export interface ListingMediaReviewer {
  review(input: ListingMediaReviewInput): Promise<ListingMediaReviewResult>;
}

export class ListingMediaReviewUnavailableError extends Error {}

class DevelopmentListingMediaReviewer implements ListingMediaReviewer {
  async review(): Promise<ListingMediaReviewResult> {
    return { verdict: 'clean', provider: 'development-none', reasonCodes: [] };
  }
}

export function mediaReviewInput(
  buffer: Buffer,
  mimeType: SupportedListingImageMime
): ListingMediaReviewInput {
  return {
    buffer,
    mimeType,
    sha256: createHash('sha256').update(buffer).digest('hex')
  };
}

export function validateMediaReviewResult(result: ListingMediaReviewResult): ListingMediaReviewResult {
  if (!['clean', 'reject', 'quarantine'].includes(result.verdict)) {
    throw new ListingMediaReviewUnavailableError('Media review provider returned an invalid verdict');
  }
  if (!result.provider.trim()) {
    throw new ListingMediaReviewUnavailableError('Media review provider identity is required');
  }
  return {
    verdict: result.verdict,
    provider: result.provider.trim().slice(0, 80),
    reference: result.reference?.trim().slice(0, 200) || undefined,
    reasonCodes: result.reasonCodes
      .filter((value) => typeof value === 'string' && value.trim().length > 0)
      .map((value) => value.trim().slice(0, 80))
      .slice(0, 20)
  };
}

let reviewer: ListingMediaReviewer | undefined;

export function getListingMediaReviewer(): ListingMediaReviewer {
  if (reviewer) return reviewer;
  if (process.env.NODE_ENV === 'production') {
    throw new ListingMediaReviewUnavailableError(
      'Production media review provider is not configured'
    );
  }
  reviewer = new DevelopmentListingMediaReviewer();
  return reviewer;
}

export function setListingMediaReviewer(value: ListingMediaReviewer | undefined): void {
  reviewer = value;
}
