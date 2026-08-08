import { sellerSettlementConfigurationFromEnvironment } from '../config/seller-settlement-config.js';
import { closeDb } from '../db/index.js';
import { reconcileSettlementSources } from '../settlements/settlement-source-reconciliation.js';
import { runSellerSettlementBatch } from '../settlements/seller-settlement-service.js';

const configuration = sellerSettlementConfigurationFromEnvironment();
let stopping = false;

async function runOnce(): Promise<void> {
  if (!configuration.enabled) return;
  await reconcileSettlementSources(configuration.workerBatchSize);
  await runSellerSettlementBatch({ limit: configuration.workerBatchSize });
}

async function main(): Promise<void> {
  if (!configuration.enabled) {
    console.log('Seller settlement worker is disabled.');
    await closeDb();
    return;
  }
  while (!stopping) {
    try {
      await runOnce();
    } catch (error) {
      console.error('Seller settlement worker iteration failed', error);
    }
    if (!stopping) await new Promise((resolve) => setTimeout(resolve, configuration.workerIntervalMs));
  }
  await closeDb();
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => { stopping = true; });
}

void main();
