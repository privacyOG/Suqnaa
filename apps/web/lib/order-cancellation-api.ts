import { postAuthed } from './authed-api';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface OrderCancellationResponse {
  accepted: true;
  order: {
    id: string;
    status: 'cancelled';
    updatedAt: string;
  };
  cancellation: {
    unchanged: boolean;
  };
}

export function cancelPendingOrder(
  orderId: string,
  challengeResponse?: string
): Promise<OrderCancellationResponse> {
  const normalizedOrderId = orderId.trim();
  if (!uuidPattern.test(normalizedOrderId)) {
    throw new Error('Order identifier must be a UUID');
  }

  return postAuthed<OrderCancellationResponse>(
    `/v1/market/orders/${normalizedOrderId}/cancel`,
    {},
    challengeResponse
  );
}
