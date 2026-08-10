import assert from 'node:assert/strict';
import { listingImageTransformInternals } from './listing-image-transform.js';

const { orientedDimensions, outputDimensions } = listingImageTransformInternals;

assert.deepEqual(orientedDimensions(4000, 3000, null), { width: 4000, height: 3000 });
assert.deepEqual(orientedDimensions(4000, 3000, 1), { width: 4000, height: 3000 });
assert.deepEqual(orientedDimensions(4000, 3000, 6), { width: 3000, height: 4000 });
assert.deepEqual(orientedDimensions(4000, 3000, 8), { width: 3000, height: 4000 });
assert.deepEqual(outputDimensions(4000, 3000, 2048), { width: 2048, height: 1536 });
assert.deepEqual(outputDimensions(3000, 4000, 512), { width: 384, height: 512 });
assert.deepEqual(outputDimensions(320, 240, 512), { width: 320, height: 240 });

console.log('listing image transform policy ok');
