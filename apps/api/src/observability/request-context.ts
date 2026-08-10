import { randomBytes, randomUUID } from 'node:crypto';

const requestIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const traceparentPattern = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;

export type RequestContext = {
  requestId: string;
  traceId: string;
  spanId: string;
};

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function resolveRequestId(value: string | string[] | undefined): string {
  const candidate = firstHeader(value)?.trim();
  return candidate && requestIdPattern.test(candidate) ? candidate : randomUUID();
}

export function resolveTraceId(value: string | string[] | undefined): string | null {
  const candidate = firstHeader(value)?.trim().toLowerCase();
  if (!candidate) return null;
  const match = candidate.match(traceparentPattern);
  if (!match || /^0+$/.test(match[1]) || /^0+$/.test(match[2])) return null;
  return match[1];
}

export function newTraceId(): string {
  return randomBytes(16).toString('hex');
}

export function newSpanId(): string {
  return randomBytes(8).toString('hex');
}

export function resolveRequestContext(input: {
  requestId?: string | string[];
  traceparent?: string | string[];
}): RequestContext {
  return {
    requestId: resolveRequestId(input.requestId),
    traceId: resolveTraceId(input.traceparent) ?? newTraceId(),
    spanId: newSpanId()
  };
}

export function safeRouteLabel(routeOptionsUrl: string | undefined): string {
  if (!routeOptionsUrl || routeOptionsUrl.length > 200) return 'unknown';
  return routeOptionsUrl;
}

export function statusClass(statusCode: number): string {
  if (!Number.isInteger(statusCode) || statusCode < 100 || statusCode > 599) return 'unknown';
  return `${Math.floor(statusCode / 100)}xx`;
}
