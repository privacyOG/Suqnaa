import assert from 'node:assert/strict';
import { ClamdMediaReviewError, parseClamdResponse } from './listing-media-clamd-review.js';

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

console.log('clamd media review parser ok');
