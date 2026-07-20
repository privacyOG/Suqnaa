import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  createLocalListingMediaStorage,
  resolveMediaPublicBaseUrl,
  resolveMediaStorageDriver
} from './listing-media-storage.js';

assert.equal(
  resolveMediaStorageDriver({ nodeEnv: 'development' }),
  'local'
);

assert.equal(
  resolveMediaStorageDriver({
    nodeEnv: 'production',
    driver: 's3'
  }),
  's3'
);

assert.throws(
  () => resolveMediaStorageDriver({
    nodeEnv: 'production',
    driver: 'local'
  }),
  /required in production/
);

assert.throws(
  () => resolveMediaStorageDriver({
    nodeEnv: 'development',
    driver: 'invalid'
  }),
  /Unsupported/
);

assert.equal(
  resolveMediaPublicBaseUrl({
    nodeEnv: 'production',
    publicBaseUrl: 'https://media.example.test/assets/'
  }),
  'https://media.example.test/assets'
);

assert.equal(
  resolveMediaPublicBaseUrl({ nodeEnv: 'production' }),
  null
);

assert.throws(
  () => resolveMediaPublicBaseUrl({
    nodeEnv: 'production',
    publicBaseUrl: 'http://media.example.test'
  }),
  /HTTPS/
);

const storageRoot = await mkdtemp(path.join(tmpdir(), 'suqnaa-media-'));

try {
  const storage = createLocalListingMediaStorage(storageRoot);
  const objectKey = 'listing-media/listing-id/media-id.jpg';
  const buffer = Buffer.from('listing media');

  await storage.put({
    objectKey,
    buffer,
    mimeType: 'image/jpeg'
  });

  const delivery = await storage.deliver(objectKey, 'image/jpeg');
  assert.equal(delivery.type, 'buffer');
  if (delivery.type === 'buffer') {
    assert.deepEqual(delivery.buffer, buffer);
  }

  await storage.remove(objectKey);
  await assert.rejects(
    storage.deliver(objectKey, 'image/jpeg'),
    /ENOENT/
  );

  await storage.remove(objectKey);
} finally {
  await rm(storageRoot, { recursive: true, force: true });
}
