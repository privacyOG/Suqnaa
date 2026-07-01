import assert from 'node:assert/strict';
import { resolveWebOrigin } from './web-origin.js';

assert.equal(
  resolveWebOrigin({ nodeEnv: 'development' }),
  'http://localhost:3000'
);

assert.equal(
  resolveWebOrigin({
    nodeEnv: 'production',
    webOrigin: 'https://suqnaa.com/path'
  }),
  'https://suqnaa.com'
);

assert.throws(
  () => resolveWebOrigin({
    nodeEnv: 'production',
    webOrigin: 'http://suqnaa.com'
  }),
  /HTTPS/
);

assert.throws(
  () => resolveWebOrigin({
    nodeEnv: 'production',
    webOrigin: 'https://localhost:3000'
  }),
  /local host/
);
