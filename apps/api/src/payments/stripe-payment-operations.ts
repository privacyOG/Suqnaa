import type { PaymentCollectionConfiguration } from '../config/payment-collection-config.js';
import { stripeMinorUnits, StripeProviderError } from './stripe-checkout-provider.js';

export type StripeRefundStatus =
  | 'pending'
  | 'requires_action'
  | 'succeeded'
  | 'failed'
  | 'canceled';

export interface StripeRefundResult {
  id: string;
  amount: number;
  currency: string;
  paymentIntentId: string;
  chargeId: string | null;
  status: StripeRefundStatus;
}

function validProviderId(value: unknown, prefix: string): value is string {
  return typeof value === 'string' && value.startsWith(prefix) && value.length <= 255;
}

function validRefundStatus(value: unknown): value is StripeRefundStatus {
  return value === 'pending' ||
    value === 'requires_action' ||
    value === 'succeeded' ||
    value === 'failed' ||
    value === 'canceled';
}

export class StripePaymentOperationsProvider {
  constructor(
    private readonly configuration: PaymentCollectionConfiguration,
    private readonly fetcher: typeof fetch = fetch
  ) {}

  async createRefund(input: {
    operationId: string;
    paymentIntentId: string;
    amount: string | number;
    reason: 'requested_by_customer' | 'fraudulent';
  }): Promise<StripeRefundResult> {
    if (!this.configuration.enabled || this.configuration.provider !== 'stripe') {
      throw new StripeProviderError('provider_disabled');
    }
    if (!validProviderId(input.paymentIntentId, 'pi_')) {
      throw new StripeProviderError('provider_payment_invalid');
    }

    const form = new URLSearchParams();
    form.set('payment_intent', input.paymentIntentId);
    form.set('amount', String(stripeMinorUnits(input.amount)));
    form.set('reason', input.reason);
    form.set('metadata[suqnaa_payment_operation_id]', input.operationId);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.configuration.timeoutMs);
    try {
      const response = await this.fetcher(`${this.configuration.apiBaseUrl}/v1/refunds`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.configuration.secretKey}`,
          'content-type': 'application/x-www-form-urlencoded',
          'idempotency-key': `suqnaa-payment-operation-v1-${input.operationId}`,
          'stripe-version': this.configuration.apiVersion
        },
        body: form.toString(),
        signal: controller.signal
      });
      if (!response.ok) {
        throw new StripeProviderError('provider_refund_failed');
      }

      const payload = await response.json() as Record<string, unknown>;
      if (
        !validProviderId(payload.id, 're_') ||
        typeof payload.amount !== 'number' ||
        !Number.isInteger(payload.amount) ||
        payload.amount <= 0 ||
        typeof payload.currency !== 'string' ||
        payload.currency.length !== 3 ||
        payload.payment_intent !== input.paymentIntentId ||
        !validRefundStatus(payload.status)
      ) {
        throw new StripeProviderError('provider_refund_invalid');
      }

      return {
        id: payload.id,
        amount: payload.amount,
        currency: payload.currency.toUpperCase(),
        paymentIntentId: input.paymentIntentId,
        chargeId: validProviderId(payload.charge, 'ch_') ? payload.charge : null,
        status: payload.status
      };
    } catch (error) {
      if (error instanceof StripeProviderError) throw error;
      throw new StripeProviderError('provider_unavailable');
    } finally {
      clearTimeout(timeout);
    }
  }
}
