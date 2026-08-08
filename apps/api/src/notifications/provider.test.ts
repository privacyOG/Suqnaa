import assert from 'node:assert/strict';
import {
  createNotificationDeliveryProvider,
  validateNotificationProviderConfiguration
} from './provider.js';

assert.throws(
  () => validateNotificationProviderConfiguration({
    channel: 'email',
    mode: 'http',
    nodeEnv: 'production',
    endpoint: 'http://notifications.example.test/send',
    token: 'secret',
    timeoutMs: 1000
  }),
  /HTTPS/
);

assert.throws(
  () => validateNotificationProviderConfiguration({
    channel: 'sms',
    mode: 'http',
    nodeEnv: 'test',
    endpoint: '',
    token: '',
    timeoutMs: 1000
  }),
  /incomplete/
);

let request: { url: string; init?: RequestInit } | undefined;
const provider = createNotificationDeliveryProvider({
  channel: 'push',
  mode: 'http',
  nodeEnv: 'test',
  endpoint: 'http://provider.example.test/notify',
  token: 'provider-token',
  timeoutMs: 1000
}, async (url, init) => {
  request = { url: String(url), init };
  return new Response(JSON.stringify({ messageId: 'provider-message-1' }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
});

const result = await provider.deliver({
  deliveryId: 'delivery-1',
  notificationId: 'notification-1',
  channel: 'push',
  destination: 'device-token',
  eventType: 'message.received',
  title: 'New message',
  body: 'You received a message.',
  metadata: { conversationId: 'conversation-1' },
  dedupeKey: 'notification-1:push:device-token'
});

assert.equal(result.providerMessageId, 'provider-message-1');
assert.equal(request?.url, 'http://provider.example.test/notify');
assert.equal(new Headers(request?.init?.headers).get('authorization'), 'Bearer provider-token');
assert.equal(
  new Headers(request?.init?.headers).get('idempotency-key'),
  'notification-1:push:device-token'
);
const posted = JSON.parse(String(request?.init?.body));
assert.equal(posted.channel, 'push');
assert.equal(posted.eventType, 'message.received');
assert.equal(posted.destination, 'device-token');

const disabled = createNotificationDeliveryProvider({
  channel: 'email',
  mode: 'disabled',
  nodeEnv: 'test',
  timeoutMs: 1000
});
await assert.rejects(() => disabled.deliver({
  deliveryId: 'delivery-2',
  notificationId: 'notification-2',
  channel: 'email',
  destination: 'user@example.test',
  eventType: 'order.created',
  title: 'Order created',
  body: 'Order created.',
  metadata: {},
  dedupeKey: 'notification-2:email:user@example.test'
}), /disabled/);
