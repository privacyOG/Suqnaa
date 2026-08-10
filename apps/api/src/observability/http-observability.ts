import type { FastifyInstance, FastifyRequest } from 'fastify';
import { httpMetrics } from './http-metrics.js';
import {
  resolveRequestId,
  resolveTraceId,
  safeRouteLabel,
  statusClass
} from './request-context.js';

type ActiveRequest = {
  requestId: string;
  traceId: string | null;
  startedAt: bigint;
};

const activeRequests = new WeakMap<FastifyRequest, ActiveRequest>();

export function requestObservabilityContext(request: FastifyRequest): ActiveRequest | undefined {
  return activeRequests.get(request);
}

export function registerHttpObservability(app: FastifyInstance): void {
  app.addHook('onRequest', async (request, reply) => {
    const context: ActiveRequest = {
      requestId: resolveRequestId(request.headers['x-request-id']),
      traceId: resolveTraceId(request.headers.traceparent),
      startedAt: process.hrtime.bigint()
    };
    activeRequests.set(request, context);
    reply.header('X-Request-Id', context.requestId);
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
      method: request.method,
      route,
      statusClass: responseClass,
      statusCode: reply.statusCode,
      durationMs: Number(durationMs.toFixed(3))
    });

    activeRequests.delete(request);
  });
}
