export type ErrorReport = {
  requestId: string | null;
  traceId: string | null;
  route: string;
  method: string;
  errorName: string;
  message: string;
  stack?: string;
};

export interface ErrorReporter {
  capture(report: ErrorReport): Promise<void>;
}

export class ErrorReporterConfigurationError extends Error {}

class StderrErrorReporter implements ErrorReporter {
  async capture(report: ErrorReport): Promise<void> {
    process.stderr.write(`${JSON.stringify({ event: 'application_error', ...report })}\n`);
  }
}

class HttpErrorReporter implements ErrorReporter {
  constructor(
    private readonly endpoint: string,
    private readonly token: string | null,
    private readonly timeoutMs: number
  ) {}

  async capture(report: ErrorReport): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.token ? { authorization: `Bearer ${this.token}` } : {})
        },
        body: JSON.stringify(report),
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`Error reporter returned ${response.status}`);
      }
    } finally {
      clearTimeout(timer);
    }
  }
}

function bounded(value: string, maximum: number): string {
  return value.length <= maximum ? value : value.slice(0, maximum);
}

export function sanitizeTelemetryText(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[REDACTED_TOKEN]')
    .replace(/:\/\/[^\s/@:]+:[^\s/@]+@/g, '://[REDACTED]@')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED_EMAIL]')
    .replace(/\b(?:\+?\d[\d .()-]{7,}\d)\b/g, '[REDACTED_PHONE]')
    .replace(/([?&](?:token|secret|password|key|signature|code)=)[^&#\s]+/gi, '$1[REDACTED]');
}

export function errorReport(input: {
  error: unknown;
  requestId?: string | null;
  traceId?: string | null;
  route?: string;
  method?: string;
}): ErrorReport {
  const error = input.error instanceof Error ? input.error : new Error('Unknown application error');
  return {
    requestId: input.requestId ?? null,
    traceId: input.traceId ?? null,
    route: bounded(input.route ?? 'unknown', 200),
    method: bounded((input.method ?? 'UNKNOWN').toUpperCase(), 12),
    errorName: bounded(error.name || 'Error', 120),
    message: bounded(sanitizeTelemetryText(error.message || 'Application error'), 500),
    stack: error.stack ? bounded(sanitizeTelemetryText(error.stack), 8000) : undefined
  };
}

export function resolveErrorReporterConfig(input: {
  nodeEnv?: string;
  endpoint?: string;
  token?: string;
  timeoutMs?: string;
}): { endpoint: string; token: string | null; timeoutMs: number } | null {
  const endpoint = input.endpoint?.trim();
  if (!endpoint) return null;
  const url = new URL(endpoint);
  if (input.nodeEnv === 'production' && url.protocol !== 'https:') {
    throw new ErrorReporterConfigurationError('OBSERVABILITY_ERROR_ENDPOINT must use HTTPS in production');
  }
  const parsedTimeout = input.timeoutMs?.trim() ? Number(input.timeoutMs) : 5000;
  if (!Number.isInteger(parsedTimeout) || parsedTimeout < 500 || parsedTimeout > 15_000) {
    throw new ErrorReporterConfigurationError(
      'OBSERVABILITY_ERROR_TIMEOUT_MS must be an integer from 500 to 15000'
    );
  }
  return {
    endpoint: url.toString(),
    token: input.token?.trim() || null,
    timeoutMs: parsedTimeout
  };
}

let reporter: ErrorReporter | undefined;

export function getErrorReporter(): ErrorReporter {
  if (reporter) return reporter;
  const config = resolveErrorReporterConfig({
    nodeEnv: process.env.NODE_ENV,
    endpoint: process.env.OBSERVABILITY_ERROR_ENDPOINT,
    token: process.env.OBSERVABILITY_ERROR_TOKEN,
    timeoutMs: process.env.OBSERVABILITY_ERROR_TIMEOUT_MS
  });
  reporter = config
    ? new HttpErrorReporter(config.endpoint, config.token, config.timeoutMs)
    : new StderrErrorReporter();
  return reporter;
}

export function setErrorReporter(value: ErrorReporter | undefined): void {
  reporter = value;
}
