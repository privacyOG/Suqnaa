import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:suqnaa/src/api/authed_api.dart';
import 'package:suqnaa/src/api/order_checkout_api.dart';

const orderId = '123e4567-e89b-42d3-a456-426614174000';
const listingId = '223e4567-e89b-42d3-a456-426614174000';

String checkoutResponse({Object? provider}) {
  return jsonEncode({
    'accepted': true,
    'status': 'configuration_required',
    'order': {
      'id': orderId,
      'listingId': listingId,
      'amount': '80.00',
      'currencyCode': 'AUD',
      'status': 'pending',
      'paymentMethod': 'bank_transfer',
    },
    'payment': {
      'provider': provider,
      'nextAction': 'configure_bank_transfer_instructions',
    },
    'releaseModel': 'hold_until_fulfilment_or_dispute_resolution',
  });
}

void main() {
  test('sends only the order id with the protected challenge header', () async {
    http.Request? captured;
    final client = MockClient((request) async {
      captured = request;
      return http.Response(
        checkoutResponse(),
        200,
        headers: {'content-type': 'application/json'},
      );
    });
    final api = OrderCheckoutApi(
      authedApi: AuthedApi(
        baseUrl: Uri.parse('https://api.suqnaa.test'),
        client: client,
      ),
    );

    final result = await api.prepare(
      'access-token',
      orderId: orderId,
      challengeResponse: '  verified-human-check  ',
    );

    expect(captured?.method, 'POST');
    expect(
      captured?.url.toString(),
      'https://api.suqnaa.test/v1/payments/protected-checkout',
    );
    expect(captured?.headers['authorization'], 'Bearer access-token');
    expect(captured?.headers['content-type'], 'application/json');
    expect(
      captured?.headers['x-suqnaa-human-check'],
      'verified-human-check',
    );
    expect(jsonDecode(captured?.body ?? ''), {'orderId': orderId});

    expect(result.order.id, orderId);
    expect(result.order.listingId, listingId);
    expect(result.order.amount, '80.00');
    expect(result.order.currencyCode, 'AUD');
    expect(
      result.order.paymentMethod,
      CheckoutPaymentMethod.bankTransfer,
    );
    expect(
      result.nextAction,
      CheckoutNextAction.configureBankTransferInstructions,
    );
  });

  test('rejects a response that claims a configured provider', () async {
    final client = MockClient((request) async {
      return http.Response(checkoutResponse(provider: 'configured'), 200);
    });
    final api = OrderCheckoutApi(
      authedApi: AuthedApi(
        baseUrl: Uri.parse('https://api.suqnaa.test'),
        client: client,
      ),
    );

    await expectLater(
      api.prepare('access-token', orderId: orderId),
      throwsA(isA<FormatException>()),
    );
  });

  test('rejects an invalid order id before making a request', () async {
    var requests = 0;
    final client = MockClient((request) async {
      requests += 1;
      return http.Response(checkoutResponse(), 200);
    });
    final api = OrderCheckoutApi(
      authedApi: AuthedApi(
        baseUrl: Uri.parse('https://api.suqnaa.test'),
        client: client,
      ),
    );

    await expectLater(
      api.prepare('access-token', orderId: 'not-an-order-id'),
      throwsArgumentError,
    );
    expect(requests, 0);
  });
}
