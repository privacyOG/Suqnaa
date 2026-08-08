import assert from 'node:assert/strict';
import {
  assertMessageAttachmentsDisabled,
  inspectMessageBody,
  MessagePolicyError,
  messageSafetyPolicy,
  publicMessagePolicy
} from './message-safety-policy.js';

const first = inspectMessageBody('  Hello   MARKET\nplace  ');
const second = inspectMessageBody('hello market place');
assert.equal(first.body, 'Hello   MARKET\nplace');
assert.equal(first.normalizedBody, 'hello market place');
assert.equal(first.fingerprint, second.fingerprint);
assert.equal(first.httpUrlCount, 0);

assert.throws(
  () => inspectMessageBody('a https://a.test b https://b.test c https://c.test d https://d.test'),
  (error) => error instanceof MessagePolicyError && error.code === 'message_link_limit'
);
assert.throws(
  () => inspectMessageBody('unsafe\u0001control'),
  (error) => error instanceof MessagePolicyError && error.code === 'message_control_characters'
);
assert.throws(
  () => inspectMessageBody('   '),
  (error) => error instanceof MessagePolicyError && error.code === 'message_body_invalid'
);

assert.doesNotThrow(() => assertMessageAttachmentsDisabled(undefined));
assert.doesNotThrow(() => assertMessageAttachmentsDisabled([]));
assert.throws(
  () => assertMessageAttachmentsDisabled([{ name: 'document.pdf' }]),
  (error) => error instanceof MessagePolicyError && error.code === 'message_attachments_disabled'
);

assert.equal(messageSafetyPolicy.attachments.enabled, false);
assert.equal(messageSafetyPolicy.attachments.maxCount, 0);
assert.equal(messageSafetyPolicy.identicalPairMaximum, 3);
assert.equal(messageSafetyPolicy.identicalBroadcastMaximumRecipients, 3);
assert.equal(messageSafetyPolicy.newCounterpartMaximum, 12);
assert.deepEqual(publicMessagePolicy().attachments.enabled, false);

console.log('Message safety policy tests passed.');
