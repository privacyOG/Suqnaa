import assert from 'node:assert/strict';
import { prepareProtectedCheckout } from './payment-api';

async function run() {
  const originalFetch = globalThis.fetch;

  try {
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;
    const orderId = '123e4567-e89b-42d3-a456-426614174000';

    globalThis.fetch = (async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(JSON.stringify({
        accepted: true,
        status: 'configuration_required',
        order: {
          id: orderId,
          listingId: '223e4567-e89b-42d3-a456-426614174000',
          amount: '199.95',
          currencyCode: 'AUD',
          status: 'pending',
          paymentMethod: 'card'
        },
        payment: {
          provider: null,
          nextAction: 'configure_card_provider'
        },
        releaseModel: 'hold_until_fulfilment_or_dispute_resolution'
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }) as typeof fetch;

    const response = await prepareProtectedCheckout(orderId, 'en', 'checkout-check');

    assert.equal(
      capturedUrl,
      '/api/authed/v1/payments/protected-checkout'
    );
    assert.equal(capturedInit?.method, 'POST');
    assert.equal(capturedInit?.credentials, 'same-origin');
    assert.equal(
      new Headers(capturedInit?.headers).get('x-suqnaa-human-check'),
      'checkout-check'
    );
    assert.equal(new Headers(capturedInit?.headers).has('authorization'), false);
    assert.deepEqual(JSON.parse(String(capturedInit?.body)), { orderId, locale: 'en' });
    assert.equal(response.order.amount, '199.95');
    assert.equal(response.payment.provider, null);
    assert.equal(response.payment.nextAction, 'configure_card_provider');

    globalThis.fetch = (async () => new Response(JSON.stringify({
      accepted: true,
      status: 'redirect_required',
      order: {
        id: orderId,
        listingId: '223e4567-e89b-42d3-a456-426614174000',
        amount: '199.95',
        currencyCode: 'AUD',
        status: 'pending',
        paymentMethod: 'card'
      },
      payment: {
        provider: 'stripe',
        nextAction: 'redirect_to_provider',
        checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_1234567890abcdef',
        expiresAt: '2026-08-08T12:00:00.000Z'
      },
      releaseModel: 'hold_until_fulfilment_or_dispute_resolution'
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })) as typeof fetch;

    const hosted = await prepareProtectedCheckout(orderId, 'ar');
    assert.equal(hosted.status, 'redirect_required');
    if (hosted.status === 'redirect_required') {
      assert.equal(hosted.payment.provider, 'stripe');
      assert.equal(hosted.payment.nextAction, 'redirect_to_provider');
      assert.equal(hosted.payment.checkoutUrl.startsWith('https://checkout.stripe.com/'), true);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
}

void run();
