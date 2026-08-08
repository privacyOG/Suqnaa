import assert from 'node:assert/strict';
import { resolveNotificationDeliveryConfiguration } from './notification-delivery-config.js';

const configuration = resolveNotificationDeliveryConfiguration({
  NODE_ENV: 'production',
  NOTIFICATION_EMAIL_PROVIDER: 'http',
  NOTIFICATION_EMAIL_URL: 'https://notify.example.test/email',
  NOTIFICATION_EMAIL_TOKEN: 'email-token',
  NOTIFICATION_SMS_PROVIDER: 'http',
  NOTIFICATION_SMS_URL: 'https://notify.example.test/sms',
  NOTIFICATION_SMS_TOKEN: 'sms-token',
  NOTIFICATION_PUSH_PROVIDER: 'http',
  NOTIFICATION_PUSH_URL: 'https://notify.example.test/push',
  NOTIFICATION_PUSH_TOKEN: 'push-token',
  NOTIFICATION_WORKER_INTERVAL_MS: '2500',
  NOTIFICATION_WORKER_BATCH_SIZE: '75',
  NOTIFICATION_DELIVERY_MAX_ATTEMPTS: '9',
  NOTIFICATION_DELIVERY_LOCK_TIMEOUT_MS: '120000',
  NOTIFICATION_PROVIDER_TIMEOUT_MS: '3000'
});

assert.equal(configuration.nodeEnv, 'production');
assert.equal(configuration.workerIntervalMs, 2500);
assert.equal(configuration.batchSize, 75);
assert.equal(configuration.maxAttempts, 9);
assert.equal(configuration.lockTimeoutMs, 120000);
assert.equal(configuration.providers.email.mode, 'http');
assert.equal(configuration.providers.sms.endpoint, 'https://notify.example.test/sms');
assert.equal(configuration.providers.push.token, 'push-token');
assert.equal(configuration.providers.push.timeoutMs, 3000);

const defaults = resolveNotificationDeliveryConfiguration({ NODE_ENV: 'test' });
assert.equal(defaults.providers.email.mode, 'disabled');
assert.equal(defaults.providers.sms.mode, 'disabled');
assert.equal(defaults.providers.push.mode, 'disabled');
assert.equal(defaults.batchSize, 50);
assert.equal(defaults.maxAttempts, 8);
