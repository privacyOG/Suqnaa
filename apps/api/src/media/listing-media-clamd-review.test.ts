import assert from 'node:assert/strict';
import {
  ClamdListingMediaReviewer,
  ClamdMediaReviewError,
  parseClamdResponse
} from './listing-media-clamd-review.js';

assert.deepEqual(parseClamdResponse('stream: OK\0'), {
  verdict: 'clean',
  provider: 'clamav-clamd',
  reasonCodes: []
});

assert.deepEqual(parseClamdResponse('stream: Eicar-Test-Signature FOUND\0'), {
  verdict: 'reject',
  provider: 'clamav-clamd',
  reference: 'Eicar-Test-Signature',
  reasonCodes: ['malware_detected']
});

assert.throws(
  () => parseClamdResponse('stream: UNKNOWN'),
  (error: unknown) => error instanceof ClamdMediaReviewError
);

const previousNodeEnv = process.env.NODE_ENV;
const previousHost = process.env.CLAMAV_HOST;
try {
  process.env.NODE_ENV = 'production';
  delete process.env.CLAMAV_HOST;
  assert.throws(
    () => new ClamdListingMediaReviewer(),
    (error: unknown) => error instanceof ClamdMediaReviewError && /CLAMAV_HOST/.test(error.message)
  );
  assert.doesNotThrow(() => new ClamdListingMediaReviewer({ host: 'scanner.internal' }));
} finally {
  if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousNodeEnv;
  if (previousHost === undefined) delete process.env.CLAMAV_HOST;
  else process.env.CLAMAV_HOST = previousHost;
}

console.log('clamd media review parser/config ok');
