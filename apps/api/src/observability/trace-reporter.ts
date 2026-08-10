export type TraceSpan = {
  traceId: string;
  spanId: string;
  requestId: string;
  name: string;
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
  startedAt: string;
};

export interface TraceReporter {
  capture(span: TraceSpan): Promise<void>;
}

export class TraceReporterConfigurationError extends Error {}

class NoopTraceReporter implements TraceReporter {
  async capture(): Promise<void> {}
}

class HttpTraceReporter implements TraceReporter {
  constructor(
    private readonly endpoint: string,
    private readonly token: string | null,
    private readonly timeoutMs: number
  ) {}

  async capture(span: TraceSpan): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.token ? { authorization: `Bearer ${this.token}` } : {})
        },
        body: JSON.stringify(span),
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`Trace reporter returned ${response.status}`);
    } finally {
      clearTimeout(timer);
    }
  }
}

export function resolveTraceReporterConfig(input: {
  nodeEnv?: string;
  endpoint?: string;
  token?: string;
  timeoutMs?: string;
}): { endpoint: string; token: string | null; timeoutMs: number } | null {
  const endpoint = input.endpoint?.trim();
  if (!endpoint) return null;
  const url = new URL(endpoint);
  if (input.nodeEnv === 'production' && url.protocol !== 'https:') {
    throw new TraceReporterConfigurationError('OBSERVABILITY_TRACE_ENDPOINT must use HTTPS in production');
  }
  const parsedTimeout = input.timeoutMs?.trim() ? Number(input.timeoutMs) : 3000;
  if (!Number.isInteger(parsedTimeout) || parsedTimeout < 500 || parsedTimeout > 15_000) {
    throw new TraceReporterConfigurationError(
      'OBSERVABILITY_TRACE_TIMEOUT_MS must be an integer from 500 to 15000'
    );
  }
  return {
    endpoint: url.toString(),
    token: input.token?.trim() || null,
    timeoutMs: parsedTimeout
  };
}

let reporter: TraceReporter | undefined;

export function getTraceReporter(): TraceReporter {
  if (reporter) return reporter;
  const config = resolveTraceReporterConfig({
    nodeEnv: process.env.NODE_ENV,
    endpoint: process.env.OBSERVABILITY_TRACE_ENDPOINT,
    token: process.env.OBSERVABILITY_TRACE_TOKEN,
    timeoutMs: process.env.OBSERVABILITY_TRACE_TIMEOUT_MS
  });
  reporter = config
    ? new HttpTraceReporter(config.endpoint, config.token, config.timeoutMs)
    : new NoopTraceReporter();
  return reporter;
}

export function setTraceReporter(value: TraceReporter | undefined): void {
  reporter = value;
}
