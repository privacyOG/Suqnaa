import type { FastifyInstance, FastifyRequest } from 'fastify';
import { httpMetrics } from './http-metrics.js';
import {
  resolveRequestContext,
  safeRouteLabel,
  statusClass
} from './request-context.js';
import { getTraceReporter } from './trace-reporter.js';

type ActiveRequest = {
  requestId: string;
  traceId: string;
  spanId: string;
  startedAt: bigint;
  startedAtIso: string;
};

const activeRequests = new WeakMap<FastifyRequest, ActiveRequest>();

export function requestObservabilityContext(request: FastifyRequest): ActiveRequest | undefined {
  return activeRequests.get(request);
}

export function registerHttpObservability(app: FastifyInstance): void {
  app.addHook('onRequest', async (request, reply) => {
    const resolved = resolveRequestContext({
      requestId: request.headers['x-request-id'],
      traceparent: request.headers.traceparent
    });
    const context: ActiveRequest = {
      ...resolved,
      startedAt: process.hrtime.bigint(),
      startedAtIso: new Date().toISOString()
    };
    activeRequests.set(request, context);
    reply.header('X-Request-Id', context.requestId);
    reply.header('X-Trace-Id', context.traceId);
  });

  app.addHook('onResponse', async (request, reply) => {
    const context = activeRequests.get(request);
    if (!context) return;
    const durationMs = Number(process.hrtime.bigint() - context.startedAt) / 1_000_000;
    const route = safeRouteLabel(request.routeOptions.url);
    const responseClass = statusClass(reply.statusCode);

    httpMetrics.observe({
      method: request.method,
      route,
      statusClass: responseClass,
      durationMs
    });

    request.log.info({
      event: 'http_request_completed',
      requestId: context.requestId,
      traceId: context.traceId,
      spanId: context.spanId,
      method: request.method,
      route,
      statusClass: responseClass,
      statusCode: reply.statusCode,
      durationMs: Number(durationMs.toFixed(3))
    });

    try {
      await getTraceReporter().capture({
        traceId: context.traceId,
        spanId: context.spanId,
        requestId: context.requestId,
        name: `HTTP ${request.method} ${route}`.slice(0, 240),
        method: request.method.slice(0, 12),
        route,
        statusCode: reply.statusCode,
        durationMs: Number(durationMs.toFixed(3)),
        startedAt: context.startedAtIso
      });
    } catch (error) {
      request.log.warn({
        event: 'trace_report_delivery_failed',
        requestId: context.requestId,
        traceId: context.traceId,
        errorName: error instanceof Error ? error.name : 'Error'
      });
    } finally {
      activeRequests.delete(request);
    }
  });
}
