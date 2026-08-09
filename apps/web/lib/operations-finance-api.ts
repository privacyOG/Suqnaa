import { postAuthed, type JsonBody } from './authed-api';

export interface PaymentOperationDecisionInput extends JsonBody {
  decision: 'approve' | 'reject';
  reason: string;
}

export interface PaymentOperationDecisionResponse {
  operationId?: string;
  status?: string;
  providerReference?: string;
  operation?: Record<string, unknown>;
}

export interface SettlementRunResponse {
  sources?: Record<string, unknown>;
  processedTransfers?: number;
  processedReversals?: number;
  [key: string]: unknown;
}

export function decidePaymentOperation(
  operationId: string,
  input: PaymentOperationDecisionInput
): Promise<PaymentOperationDecisionResponse> {
  return postAuthed<PaymentOperationDecisionResponse>(
    `/v1/operations/payment-operations/${encodeURIComponent(operationId)}/decision`,
    input
  );
}

export function runSellerSettlements(limit = 50): Promise<SettlementRunResponse> {
  return postAuthed<SettlementRunResponse>('/v1/operations/settlements/run', { limit });
}
