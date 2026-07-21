import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:suqnaa/src/api/challenge_config_api.dart';

Map<String, dynamic> challengePayload({
  required bool enabled,
  required String provider,
  Object? siteKey,
}) {
  return {
    'challenge': {
      'enabled': enabled,
      'provider': provider,
      'siteKey': siteKey,
      'actions': {
        'paymentCheckout': 'payment_checkout_prepare',
        'orderCancel': 'order_cancel',
      },
    },
  };
}

void main() {
  test('loads a disabled challenge configuration', () async {
    Uri? requested;
    final client = MockClient((request) async {
      requested = request.url;
      return http.Response(
        jsonEncode(
          challengePayload(enabled: false, provider: 'none'),
        ),
        200,
        headers: {'content-type': 'application/json'},
      );
    });
    final api = ChallengeConfigurationApi(
      baseUrl: Uri.parse('https://api.suqnaa.test'),
      client: client,
    );

    final result = await api.fetch();

    expect(
      requested.toString(),
      'https://api.suqnaa.test/v1/challenge/config',
    );
    expect(result.enabled, isFalse);
    expect(result.provider, 'none');
    expect(result.siteKey, isNull);
    expect(result.paymentCheckoutAction, 'payment_checkout_prepare');
    expect(result.orderCancelAction, 'order_cancel');
  });

  test('loads a complete enabled challenge configuration', () async {
    final client = MockClient((request) async {
      return http.Response(
        jsonEncode(
          challengePayload(
            enabled: true,
            provider: 'turnstile',
            siteKey: 'site-key',
          ),
        ),
        200,
      );
    });
    final api = ChallengeConfigurationApi(
      baseUrl: Uri.parse('https://api.suqnaa.test'),
      client: client,
    );

    final result = await api.fetch();

    expect(result.enabled, isTrue);
    expect(result.provider, 'turnstile');
    expect(result.siteKey, 'site-key');
    expect(result.orderCancelAction, 'order_cancel');
  });

  test('rejects a contradictory disabled configuration', () async {
    final client = MockClient((request) async {
      return http.Response(
        jsonEncode(
          challengePayload(
            enabled: false,
            provider: 'turnstile',
            siteKey: 'site-key',
          ),
        ),
        200,
      );
    });
    final api = ChallengeConfigurationApi(
      baseUrl: Uri.parse('https://api.suqnaa.test'),
      client: client,
    );

    await expectLater(
      api.fetch(),
      throwsA(isA<ChallengeConfigurationException>()),
    );
  });

  test('rejects a missing order cancellation action', () async {
    final client = MockClient((request) async {
      final payload = challengePayload(enabled: false, provider: 'none');
      final challenge = payload['challenge'] as Map<String, dynamic>;
      final actions = challenge['actions'] as Map<String, dynamic>;
      actions.remove('orderCancel');
      return http.Response(jsonEncode(payload), 200);
    });
    final api = ChallengeConfigurationApi(
      baseUrl: Uri.parse('https://api.suqnaa.test'),
      client: client,
    );

    await expectLater(
      api.fetch(),
      throwsA(isA<ChallengeConfigurationException>()),
    );
  });
}
