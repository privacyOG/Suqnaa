import assert from 'node:assert/strict';
import { getOrderProgress } from './order-progress.js';

const pending = getOrderProgress('pending');
assert.equal(pending.stage, 'payment_pending');
assert.equal(pending.percent, 25);
assert.equal(pending.terminal, false);
assert.deepEqual(pending.steps.map((step) => step.state), [
  'complete',
  'current',
  'upcoming',
  'upcoming'
]);

const paid = getOrderProgress('paid');
assert.equal(paid.stage, 'fulfilment');
assert.equal(paid.percent, 60);
assert.deepEqual(paid.steps.map((step) => step.state), [
  'complete',
  'complete',
  'current',
  'upcoming'
]);

const released = getOrderProgress('released');
assert.equal(released.stage, 'complete');
assert.equal(released.percent, 100);
assert.equal(released.terminal, true);
assert.ok(released.steps.every((step) => step.state === 'complete'));

for (const status of ['disputed', 'refunded'] as const) {
  const progress = getOrderProgress(status);
  assert.equal(progress.percent, 60);
  assert.equal(progress.steps[2]?.state, 'exception');
}

const cancelled = getOrderProgress('cancelled');
assert.equal(cancelled.stage, 'cancelled');
assert.equal(cancelled.terminal, true);
assert.equal(cancelled.steps[1]?.state, 'exception');
