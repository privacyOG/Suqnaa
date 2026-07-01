import assert from 'node:assert/strict';
import {
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
