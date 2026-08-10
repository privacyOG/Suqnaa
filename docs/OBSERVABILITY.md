# Production observability

Suqnaa observability is designed to make production failures diagnosable without turning logs, metrics, traces, or dashboards into a second copy of customer data.

## API request correlation

Every API request receives a bounded `X-Request-Id`. A caller-provided value is accepted only when it matches the restricted identifier grammar and length; otherwise the API generates a UUID. Every request also receives a 128-bit trace ID and 64-bit span ID. A valid W3C `traceparent` trace ID is preserved, otherwise a new trace ID is generated.

Responses expose `X-Request-Id` and `X-Trace-Id`. General HTTP completion logs contain only request ID, trace/span IDs, HTTP method, bounded Fastify route template, status class/status code, and duration. Fastify automatic request logging is disabled so raw URLs, request headers, bodies, remote addresses, query strings, and user identifiers are not emitted by default.

## Metrics

The API exposes Prometheus text format at:

`/internal/observability/metrics`

Production requires a bearer token of at least 32 characters. Docker deployments mount the same `observability_metrics_token` secret into both the API and Prometheus. The endpoint exports bounded route-template HTTP counters and duration histograms plus process uptime. Metrics labels must never include account IDs, listing/order IDs, IP addresses, email addresses, phone numbers, raw paths/query strings, user agents, tokens, or request content.

Prometheus retains metrics for 30 days by default (`SUQNAA_METRICS_RETENTION`). Extending retention requires a privacy/storage review and capacity approval.

## Traces

Set `OBSERVABILITY_TRACE_ENDPOINT` to an approved HTTPS collector endpoint to export bounded request spans. Optional `OBSERVABILITY_TRACE_TOKEN` and `OBSERVABILITY_TRACE_TIMEOUT_MS` configure authentication and a 500–15000 ms timeout. Exported HTTP spans contain trace/span/request IDs, route template, method, status code, duration, and start time only. Bodies, headers, identities, IP addresses, raw URLs and arbitrary route parameters are excluded.

Recommended trace retention is 7 days. Increase only for a documented incident/compliance need.

## Error monitoring

Set `OBSERVABILITY_ERROR_ENDPOINT` to an approved HTTPS error collector. Optional `OBSERVABILITY_ERROR_TOKEN` and `OBSERVABILITY_ERROR_TIMEOUT_MS` configure authentication and timeout. If no collector is configured, sanitized structured error records are written to stderr.

Before export, common bearer/JWT tokens, URI credentials, emails, phone-like values, and secret query parameters are redacted. Error monitoring must not receive request or response bodies, complete headers, remote IP addresses, account IDs, addresses, payment credentials, verification documents, media content, or session material.

Recommended error-event retention is 14 days for normal production operation, with access restricted to operators who need incident diagnostics.

## Logs

`LOG_LEVEL` accepts `fatal`, `error`, `warn`, `info`, `debug`, `trace`, or `silent`; invalid values fall back to `info`. Production should normally use `info`. Logger redaction covers authorization/cookie/API-key/human-check headers and common password/token/secret/email/phone/address fields.

Central log storage should retain routine application logs for no more than 14 days unless a shorter period satisfies operations requirements. Security/audit records that have their own product retention policy remain governed by that policy and must not be copied into general application logs.

## Dashboard and alerting

`deploy/compose.infrastructure.yml` provisions:

- Prometheus, internal-only, for API metric collection and rule evaluation.
- Alertmanager, internal-only, for alert grouping/routing state.
- Grafana, bound to `127.0.0.1:${SUQNAA_GRAFANA_PORT:-3001}` by default.

Grafana receives a secret-backed bootstrap administrator password and anonymous access/sign-up are disabled. The provisioned `Suqnaa API Overview` dashboard covers request rate, 5xx ratio, p95 latency, uptime, status classes, and route-level p95 latency.

Initial operational alerts are:

- API unavailable for 2 minutes: critical.
- 5xx ratio above 2% for 10 minutes with meaningful traffic: critical.
- p95 API latency above 1.5 seconds for 10 minutes: warning.
- sustained 4xx ratio above 35% for 15 minutes with meaningful traffic: warning.

Alertmanager's repository configuration intentionally contains no vendor/webhook credential. Production operators must connect the `operations-console` receiver to an approved notification/contact mechanism using deployment-managed configuration; credentials must stay outside Git.

## Incident use

Start investigation with the request ID or trace ID surfaced to the client/operator. Correlate the structured completion record, trace span, error event, and bounded route metrics. Do not increase telemetry collection to include customer payloads as an incident shortcut. If additional diagnostic capture is exceptionally required, document the reason, scope, access list, and deletion deadline first.
