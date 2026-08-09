import { createHash } from 'node:crypto';
import { db } from '../db/index.js';
import { observeHashedRiskIdentity } from './marketplace-risk-service.js';

function hashCorrelation(namespace: string, value: string): string {
  return createHash('sha256').update(`${namespace}:${value}`).digest('hex');
}

export async function reconcileRiskIdentitySources() {
  const verificationChecks = await db.selectFrom('verification_checks')
    .select(['id', 'user_id', 'provider', 'reference'])
    .where('status', '=', 'verified')
    .where('provider', 'is not', null)
    .where('reference', 'is not', null)
    .execute();

  const payoutAccounts = await db.selectFrom('seller_payout_accounts')
    .select(['id', 'seller_id', 'provider', 'provider_account_reference'])
    .execute();

  for (const check of verificationChecks) {
    if (!check.provider || !check.reference) continue;
    await observeHashedRiskIdentity({
      identityType: 'verification_subject',
      identityHash: hashCorrelation('verification_subject', `${check.provider}:${check.reference}`),
      userId: String(check.user_id),
      source: 'seller_verification',
      sourceEventId: `verification:${check.id}`,
      metadata: { provider: String(check.provider) }
    });
  }

  for (const account of payoutAccounts) {
    await observeHashedRiskIdentity({
      identityType: 'payout_account',
      identityHash: hashCorrelation('payout_account', `${account.provider}:${account.provider_account_reference}`),
      userId: String(account.seller_id),
      source: 'seller_payout_account',
      sourceEventId: `payout-account:${account.id}`,
      metadata: { provider: String(account.provider) }
    });
  }

  return {
    verificationObserved: verificationChecks.length,
    payoutObserved: payoutAccounts.length
  };
}
