import assert from 'node:assert/strict';
import { HttpMetricsRegistry } from './http-metrics.js';

const metrics = new HttpMetricsRegistry();
metrics.observe({ method: 'get', route: '/listings/:listingId', statusClass: '2xx', durationMs: 42 });
metrics.observe({ method: 'GET', route: '/listings/:listingId', statusClass: '2xx', durationMs: 120 });
const output = metrics.renderPrometheus();

assert.match(output, /suqnaa_http_requests_total\{method="GET",route="\/listings\/:listingId",status_class="2xx"\} 2/);
assert.match(output, /le="50"\} 1/);
assert.match(output, /le="250"\} 2/);
assert.match(output, /suqnaa_http_request_duration_ms_count.* 2/);
assert.doesNotMatch(output, /authorization|cookie|email|phone|ip=/i);

console.log('http metrics registry ok');
