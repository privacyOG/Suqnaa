import { closeDb } from '../db/index.js';
import { reconcileReturnDeadlines } from '../protection/protection-service.js';

function positiveInteger(name: string, fallback: number, maximum: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > maximum) {
    throw new Error(`${name} must be an integer between 1 and ${maximum}`);
  }
  return parsed;
}

const intervalMs = positiveInteger('RETURN_DEADLINE_WORKER_INTERVAL_MS', 60_000, 3_600_000);
const batchSize = positiveInteger('RETURN_DEADLINE_WORKER_BATCH_SIZE', 100, 500);
let stopping = false;

async function main(): Promise<void> {
  while (!stopping) {
    try {
      await reconcileReturnDeadlines(batchSize);
    } catch (error) {
      console.error('Return deadline worker iteration failed', error);
    }
    if (!stopping) await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  await closeDb();
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => { stopping = true; });
}

void main();
