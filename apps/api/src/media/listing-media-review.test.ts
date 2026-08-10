import assert from 'node:assert/strict';
import {
  ListingMediaReviewUnavailableError,
  getListingMediaReviewer,
  mediaReviewInput,
  setListingMediaReviewer,
  validateMediaReviewResult
} from './listing-media-review.js';

{
  const input = mediaReviewInput(Buffer.from('safe'), 'image/jpeg');
  assert.equal(input.sha256.length, 64);
}

{
  const result = validateMediaReviewResult({
    verdict: 'quarantine',
    provider: ' example-review ',
    reference: ' ref-1 ',
    reasonCodes: [' suspicious ', '', 'policy']
  });
  assert.equal(result.provider, 'example-review');
  assert.equal(result.reference, 'ref-1');
  assert.deepEqual(result.reasonCodes, ['suspicious', 'policy']);
}

{
  setListingMediaReviewer({
    async review() {
      return { verdict: 'reject', provider: 'test', reasonCodes: ['malware'] };
    }
  });
  const result = await getListingMediaReviewer().review(
    mediaReviewInput(Buffer.from('unsafe'), 'image/png')
  );
  assert.equal(result.verdict, 'reject');
  setListingMediaReviewer(undefined);
}

{
  const original = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  setListingMediaReviewer(undefined);
  assert.throws(
    () => getListingMediaReviewer(),
    (error: unknown) => error instanceof ListingMediaReviewUnavailableError
  );
  if (original === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = original;
  setListingMediaReviewer(undefined);
}

console.log('listing media review boundary ok');
