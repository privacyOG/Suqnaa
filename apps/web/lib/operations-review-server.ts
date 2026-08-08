import { cookies } from 'next/headers';
import { accessCookieName } from './web-session';

const apiBaseUrl =
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  'http://localhost:4000';

async function readOperations<T>(path: string): Promise<T | null> {
  const access = cookies().get(accessCookieName)?.value;
  if (!access || !path.startsWith('/v1/operations/')) return null;
  try {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      headers: { authorization: `Bearer ${access}` },
      cache: 'no-store'
    });
    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    return null;
  }
}

export interface OperationsCategoryRow {
  id: string;
  parentId: string | null;
  slug: string;
  nameEn: string;
  nameAr: string;
  sortOrder: number;
  active: boolean;
}

export interface OperationsFulfilmentRow {
  id: string;
  orderId: string | null;
  status: string;
  paymentStatus: string;
  orderStatus: string | null;
  listingTitle: string | null;
  carrier: string | null;
  trackingReference: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  buyerConfirmedAt: string | null;
  updatedAt: string;
}

export interface OperationsReturnRow {
  id: string;
  orderId: string;
  disputeId: string;
  status: string;
  listingTitle: string | null;
  reason: string;
  returnDueAt: string;
  carrier: string | null;
  trackingReference: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  receivedAt: string | null;
  sellerCondition: string | null;
  updatedAt: string;
}

export interface OperationsFraudReview {
  source: string;
  automatedRiskRules: boolean;
  reports: Array<{
    id: string;
    listingId: string | null;
    subjectUserId: string | null;
    reason: string;
    details: string | null;
    createdAt: string;
  }>;
  chargebacks: Array<{
    id: string;
    orderId: string;
    status: string;
    amount: string | number | null;
    currencyCode: string;
    reason: string;
    requestedAt: string;
  }>;
}

export interface OperationsFinanceReview {
  operations: Array<Record<string, unknown>>;
  settlements: Array<Record<string, unknown>>;
}

export function loadOperationsCategories() {
  return readOperations<{ categories: OperationsCategoryRow[] }>('/v1/operations/dashboard/categories');
}

export function loadOperationsFulfilment() {
  return readOperations<{ fulfilments: OperationsFulfilmentRow[]; returns: OperationsReturnRow[] }>('/v1/operations/dashboard/fulfilment');
}

export function loadOperationsFraud() {
  return readOperations<OperationsFraudReview>('/v1/operations/dashboard/fraud');
}

export async function loadOperationsFinance(): Promise<OperationsFinanceReview | null> {
  const [payments, settlements] = await Promise.all([
    readOperations<{ operations: Array<Record<string, unknown>> }>('/v1/operations/payments?limit=100'),
    readOperations<{ settlements: Array<Record<string, unknown>> }>('/v1/operations/settlements?limit=100')
  ]);
  if (!payments && !settlements) return null;
  return {
    operations: payments?.operations ?? [],
    settlements: settlements?.settlements ?? []
  };
}
