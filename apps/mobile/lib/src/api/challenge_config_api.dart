import 'dart:convert';
import 'package:http/http.dart' as http;

const _challengeConfigPath = '/v1/challenge/config';
final _actionPattern = RegExp(r'^[a-z0-9_]{1,64}$');

abstract interface class ChallengeConfigurationGateway {
  Future<MobileChallengeConfiguration> fetch();
}

class ChallengeConfigurationApi implements ChallengeConfigurationGateway {
  ChallengeConfigurationApi({required this.baseUrl, http.Client? client})
      : _client = client ?? http.Client();

  final Uri baseUrl;
  final http.Client _client;

  @override
  Future<MobileChallengeConfiguration> fetch() async {
    final response = await _client.get(
      baseUrl.resolve(_challengeConfigPath),
      headers: const {'accept': 'application/json'},
    );

    Map<String, dynamic> payload;
    try {
      final decoded = jsonDecode(response.body);
      if (decoded is! Map) {
        throw const FormatException('Invalid challenge response');
      }
      payload = Map<String, dynamic>.from(decoded);
    } catch (_) {
      throw const ChallengeConfigurationException(
        status: 502,
        message: 'Invalid challenge response',
      );
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ChallengeConfigurationException(
        status: response.statusCode,
        message: payload['error']?.toString() ??
            'Unable to load security configuration',
      );
    }

    final rawChallenge = payload['challenge'];
    if (rawChallenge is! Map) {
      throw const ChallengeConfigurationException(
        status: 502,
        message: 'Invalid challenge configuration',
      );
    }

    try {
      return MobileChallengeConfiguration.fromJson(
        Map<String, dynamic>.from(rawChallenge),
      );
    } on FormatException catch (error) {
      throw ChallengeConfigurationException(
        status: 502,
        message: error.message.toString(),
      );
    }
  }
}

class MobileChallengeConfiguration {
  const MobileChallengeConfiguration({
    required this.enabled,
    required this.provider,
    required this.siteKey,
    required this.paymentCheckoutAction,
    required this.orderCancelAction,
  });

  final bool enabled;
  final String provider;
  final String? siteKey;
  final String paymentCheckoutAction;
  final String orderCancelAction;

  factory MobileChallengeConfiguration.fromJson(Map<String, dynamic> json) {
    final enabled = json['enabled'];
    final provider = json['provider'];
    final siteKey = json['siteKey'];
    final actions = json['actions'];

    if (enabled is! bool || provider is! String || actions is! Map) {
      throw const FormatException('Invalid challenge configuration');
    }

    final paymentCheckout = actions['paymentCheckout'];
    if (paymentCheckout is! String ||
        !_actionPattern.hasMatch(paymentCheckout)) {
      throw const FormatException('Invalid checkout challenge action');
    }

    final orderCancel = actions['orderCancel'];
    if (orderCancel is! String || !_actionPattern.hasMatch(orderCancel)) {
      throw const FormatException('Invalid order cancellation challenge action');
    }

    if (enabled) {
      if (provider != 'turnstile' ||
          siteKey is! String ||
          siteKey.trim().isEmpty ||
          siteKey.length > 256) {
        throw const FormatException('Invalid enabled challenge configuration');
      }
    } else if (provider != 'none' || siteKey != null) {
      throw const FormatException('Invalid disabled challenge configuration');
    }

    return MobileChallengeConfiguration(
      enabled: enabled,
      provider: provider,
      siteKey: siteKey is String ? siteKey.trim() : null,
      paymentCheckoutAction: paymentCheckout,
      orderCancelAction: orderCancel,
    );
  }
}

class ChallengeConfigurationException implements Exception {
  const ChallengeConfigurationException({
    required this.status,
    required this.message,
  });

  final int status;
  final String message;

  @override
  String toString() => message;
}
