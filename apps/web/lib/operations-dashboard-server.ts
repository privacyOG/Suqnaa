import { cookies } from 'next/headers';
import { accessCookieName } from './web-session';

export interface OperationsDashboardSummary {
  generatedAt: string;
  permissions: string[];
  sections: {
    reports: { available: boolean; open: number | null };
    accounts: { available: boolean; suspended: number | null };
    listings: { available: boolean; removed: number | null };
    categories: { available: boolean; total: number | null };
    identityChecks: { available: boolean; pending: number | null };
    disputes: { available: boolean; active: number | null };
    payments: { available: boolean; awaitingDecision: number | null; failed: number | null };
    settlements: { available: boolean; blocked: number | null };
    fulfilment: { available: boolean; failed: number | null; activeReturns: number | null };
    fraudSignals: { available: boolean; openFraudReports: number | null; openChargebacks: number | null; source: string };
    audit: { available: boolean; last24Hours: number | null };
  };
}

const apiBaseUrl =
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  'http://localhost:4000';

export async function loadOperationsDashboardSummary(): Promise<OperationsDashboardSummary | null> {
  const access = cookies().get(accessCookieName)?.value;
  if (!access) return null;

  try {
    const response = await fetch(`${apiBaseUrl}/v1/operations/dashboard`, {
      headers: { authorization: `Bearer ${access}` },
      cache: 'no-store'
    });
    if (!response.ok) return null;
    return await response.json() as OperationsDashboardSummary;
  } catch {
    return null;
  }
}
