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

class StderrErrorReporter implements ErrorReporter {
  async capture(report: ErrorReport): Promise<void> {
    process.stderr.write(`${JSON.stringify({ event: 'application_error', ...report })}\n`);
  }
}

function bounded(value: string, maximum: number): string {
  return value.length <= maximum ? value : value.slice(0, maximum);
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
    message: bounded(error.message || 'Application error', 500),
    stack: error.stack ? bounded(error.stack, 8000) : undefined
  };
}

let reporter: ErrorReporter | undefined;

export function getErrorReporter(): ErrorReporter {
  reporter ??= new StderrErrorReporter();
  return reporter;
}

export function setErrorReporter(value: ErrorReporter | undefined): void {
  reporter = value;
}
