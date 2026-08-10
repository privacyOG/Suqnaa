import { errorReport, getErrorReporter } from './error-reporter.js';

export async function reportWorkerError(worker: string, error: unknown): Promise<void> {
  const report = errorReport({
    error,
    route: `worker:${worker}`.slice(0, 200),
    method: 'WORKER'
  });

  try {
    await getErrorReporter().capture(report);
  } catch {
    // The primary worker failure is already terminal. Avoid emitting reporter details.
  }

  process.stderr.write(`${JSON.stringify({
    event: 'worker_failed',
    worker: worker.slice(0, 80),
    errorName: report.errorName
  })}\n`);
}
