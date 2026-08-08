import type { PaymentCollectionConfiguration } from '../config/payment-collection-config.js';

export interface StripeCheckoutSessionInput {
  internalPaymentIntentId: string;
  orderId: string;
  listingId: string;
  sellerId: string;
  amount: string | number;
  currencyCode: string;
  buyerEmail: string;
  locale: 'en' | 'ar';
}

export interface StripeCheckoutSession {
  id: string;
  url: string;
  expiresAt: Date;
}

export interface StripeChargeReceipt {
  chargeId: string;
  receiptUrl: string | null;
  receiptNumber: string | null;
}

export class StripeProviderError extends Error {
  constructor(readonly safeCode: string) {
    super(safeCode);
  }
}

export function stripeMinorUnits(value: string | number): number {
  const normalized = String(value).trim();
  const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) {
    throw new StripeProviderError('invalid_amount');
  }
  const whole = BigInt(match[1]);
  const fraction = BigInt((match[2] ?? '').padEnd(2, '0'));
  const cents = whole * 100n + fraction;
  if (cents <= 0n || cents > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new StripeProviderError('invalid_amount');
  }
  return Number(cents);
}

function validProviderId(value: unknown, prefix: string): value is string {
  return typeof value === 'string' && value.startsWith(prefix) && value.length <= 255;
}

function validCheckoutUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' &&
      (parsed.hostname === 'checkout.stripe.com' || parsed.hostname.endsWith('.checkout.stripe.com'));
  } catch {
    return false;
  }
}

export function stripeCheckoutIdempotencyKey(internalPaymentIntentId: string): string {
  return `suqnaa-checkout-v1-${internalPaymentIntentId}`;
}

export class StripeCheckoutProvider {
  constructor(
    private readonly configuration: PaymentCollectionConfiguration,
    private readonly fetcher: typeof fetch = fetch
  ) {}

  async createCheckoutSession(input: StripeCheckoutSessionInput): Promise<StripeCheckoutSession> {
    if (!this.configuration.enabled || this.configuration.provider !== 'stripe') {
      throw new StripeProviderError('provider_disabled');
    }
    if (input.currencyCode.toUpperCase() !== 'AUD') {
      throw new StripeProviderError('unsupported_currency');
    }

    const amount = stripeMinorUnits(input.amount);
    const returnBase = `${this.configuration.webOrigin}/${input.locale}/activity/orders/${input.orderId}`;
    const form = new URLSearchParams();
    form.set('mode', 'payment');
    form.set('success_url', `${returnBase}?payment=success&session_id={CHECKOUT_SESSION_ID}`);
    form.set('cancel_url', `${returnBase}?payment=cancelled`);
    form.set('customer_email', input.buyerEmail);
    form.set('payment_method_types[0]', 'card');
    form.set('line_items[0][price_data][currency]', 'aud');
    form.set('line_items[0][price_data][unit_amount]', String(amount));
    form.set('line_items[0][price_data][product_data][name]', 'Suqnaa marketplace order');
    form.set('line_items[0][quantity]', '1');
    form.set('client_reference_id', input.orderId);
    form.set('metadata[suqnaa_order_id]', input.orderId);
    form.set('metadata[suqnaa_payment_intent_id]', input.internalPaymentIntentId);
    form.set('payment_intent_data[receipt_email]', input.buyerEmail);
    form.set('payment_intent_data[transfer_group]', `suqnaa_order_${input.orderId}`);
    form.set('payment_intent_data[metadata][suqnaa_order_id]', input.orderId);
    form.set('payment_intent_data[metadata][suqnaa_payment_intent_id]', input.internalPaymentIntentId);
    form.set('payment_intent_data[metadata][suqnaa_listing_id]', input.listingId);
    form.set('payment_intent_data[metadata][suqnaa_seller_id]', input.sellerId);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.configuration.timeoutMs);
    try {
      const response = await this.fetcher(`${this.configuration.apiBaseUrl}/v1/checkout/sessions`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.configuration.secretKey}`,
          'content-type': 'application/x-www-form-urlencoded',
          'idempotency-key': stripeCheckoutIdempotencyKey(input.internalPaymentIntentId),
          'stripe-version': this.configuration.apiVersion
        },
        body: form.toString(),
        signal: controller.signal
      });
      if (!response.ok) {
        throw new StripeProviderError('provider_request_failed');
      }
      const payload = await response.json() as Record<string, unknown>;
      if (
        !validProviderId(payload.id, 'cs_') ||
        !validCheckoutUrl(payload.url) ||
        typeof payload.expires_at !== 'number' ||
        !Number.isFinite(payload.expires_at)
      ) {
        throw new StripeProviderError('provider_response_invalid');
      }
      return {
        id: payload.id,
        url: payload.url,
        expiresAt: new Date(payload.expires_at * 1000)
      };
    } catch (error) {
      if (error instanceof StripeProviderError) throw error;
      throw new StripeProviderError('provider_unavailable');
    } finally {
      clearTimeout(timeout);
    }
  }

  async retrieveChargeReceipt(chargeId: string): Promise<StripeChargeReceipt> {
    if (!validProviderId(chargeId, 'ch_')) {
      throw new StripeProviderError('provider_charge_invalid');
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.configuration.timeoutMs);
    try {
      const response = await this.fetcher(
        `${this.configuration.apiBaseUrl}/v1/charges/${encodeURIComponent(chargeId)}`,
        {
          method: 'GET',
          headers: {
            authorization: `Bearer ${this.configuration.secretKey}`,
            'stripe-version': this.configuration.apiVersion
          },
          signal: controller.signal
        }
      );
      if (!response.ok) {
        throw new StripeProviderError('provider_receipt_failed');
      }
      const payload = await response.json() as Record<string, unknown>;
      if (!validProviderId(payload.id, 'ch_')) {
        throw new StripeProviderError('provider_receipt_invalid');
      }
      const receiptUrl = payload.receipt_url;
      if (receiptUrl !== null && receiptUrl !== undefined) {
        if (typeof receiptUrl !== 'string') {
          throw new StripeProviderError('provider_receipt_invalid');
        }
        const parsed = new URL(receiptUrl);
        if (parsed.protocol !== 'https:') {
          throw new StripeProviderError('provider_receipt_invalid');
        }
      }
      return {
        chargeId: payload.id,
        receiptUrl: typeof receiptUrl === 'string' ? receiptUrl : null,
        receiptNumber: typeof payload.receipt_number === 'string' ? payload.receipt_number : null
      };
    } catch (error) {
      if (error instanceof StripeProviderError) throw error;
      throw new StripeProviderError('provider_unavailable');
    } finally {
      clearTimeout(timeout);
    }
  }
}
