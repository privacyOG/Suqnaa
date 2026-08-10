import assert from 'node:assert/strict';
import { resolveWebOrigin } from './web-origin.js';

assert.equal(
  resolveWebOrigin({ nodeEnv: 'development' }),
  'http://localhost:3000'
);

assert.equal(
  resolveWebOrigin({
    nodeEnv: 'production',
    webOrigin: 'https://suqnaa.com'
  }),
  'https://suqnaa.com'
);

assert.throws(
  () => resolveWebOrigin({
    nodeEnv: 'production',
    webOrigin: 'https://suqnaa.com/path'
  }),
  /exact origin/
);

assert.throws(
  () => resolveWebOrigin({
    nodeEnv: 'production',
    webOrigin: 'https://suqnaa.com/'
  }),
  /exact origin/
);

assert.throws(
  () => resolveWebOrigin({
    nodeEnv: 'production',
    webOrigin: 'https://user:pass@suqnaa.com'
  }),
  /credentials/
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
