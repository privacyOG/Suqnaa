import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const componentSource = readFileSync(
  new URL('../components/order-cancellation-action.tsx', import.meta.url),
  'utf8'
);
const pageSource = readFileSync(
  new URL('../app/[locale]/activity/orders/[orderId]/page.tsx', import.meta.url),
  'utf8'
);
const challengeSource = readFileSync(
  new URL('./challenge-api.ts', import.meta.url),
  'utf8'
);
const routePolicySource = readFileSync(
  new URL('./protected-route-policy.ts', import.meta.url),
  'utf8'
);

assert.match(
  pageSource,
  /<OrderCancellationAction locale=\{params\.locale\} orderId=\{params\.orderId\} \/>/,
  'authenticated order detail must render the cancellation action'
);
assert.match(componentSource, /canCancelPendingOrder\(order\.role, order\.status\)/);
assert.match(componentSource, /configuration\?\.actions\.orderCancel/);
assert.match(componentSource, /<ChallengeWidget/);
assert.match(componentSource, /action=\{challengeAction\}/);
assert.match(componentSource, /cancelPendingOrder\(\s*orderId,/);
assert.match(componentSource, /This cannot be undone\./);
assert.match(componentSource, /role="dialog"/);
assert.match(componentSource, /window\.location\.reload\(\)/);
assert.match(challengeSource, /orderCancel:\s*string/);
assert.match(
  routePolicySource,
  /\/v1\/market\/orders\/\$\{uuid\}\/cancel/,
  'authenticated proxy must allow only the UUID-bound cancellation path'
);
