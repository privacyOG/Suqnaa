import assert from 'node:assert/strict';
import { MarketplaceMetricsRegistry } from './marketplace-metrics.js';

const metrics = new MarketplaceMetricsRegistry();
metrics.observeHttp({ method: 'POST', route: '/v1/auth/register', statusCode: 201 });
metrics.observeHttp({ method: 'POST', route: '/v1/auth/login', statusCode: 401 });
metrics.observeHttp({ method: 'POST', route: '/v1/listings', statusCode: 201 });
metrics.observeHttp({ method: 'POST', route: '/v1/market/offers', statusCode: 201 });
metrics.observeHttp({ method: 'POST', route: '/v1/payments/checkout', statusCode: 400 });
metrics.observeHttp({ method: 'POST', route: '/v1/reports', statusCode: 201 });
metrics.observeHttp({ method: 'POST', route: '/v1/disputes', statusCode: 201 });

const output = metrics.renderPrometheus();
assert.match(output, /category="reliability",event="api_request",outcome="success"/);
assert.match(output, /category="reliability",event="api_request",outcome="failure"/);
assert.match(output, /category="conversion",event="registration",outcome="success"/);
assert.match(output, /category="conversion",event="listing_write",outcome="success"/);
assert.match(output, /category="conversion",event="offer_submit",outcome="success"/);
assert.match(output, /category="conversion",event="payment_action",outcome="failure"/);
assert.match(output, /category="abuse",event="report_submit",outcome="success"/);
assert.match(output, /category="abuse",event="auth_rejected",outcome="rejected"/);
assert.match(output, /category="support",event="safety_case",outcome="success"/);
assert.match(output, /category="support",event="dispute_case",outcome="success"/);
assert.doesNotMatch(output, /email|user_id|listing_id|request_id/i);

assert.throws(
  () => metrics.increment({ category: 'support', event: 'bad-user-id', outcome: 'success' }),
  /bounded safe identifiers/
);

console.log('Marketplace metrics tests passed.');
