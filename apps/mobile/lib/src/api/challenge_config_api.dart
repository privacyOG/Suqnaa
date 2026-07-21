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
    this.orderCancelAction = 'order_cancel',
    this.fulfilmentManageAction = 'fulfilment_manage',
    this.fulfilmentConfirmAction = 'fulfilment_confirm',
    this.listingMediaUploadAction = 'listing_media_upload',
    this.listingMediaDeleteAction = 'listing_media_delete',
  });

  final bool enabled;
  final String provider;
  final String? siteKey;
  final String paymentCheckoutAction;
  final String orderCancelAction;
  final String fulfilmentManageAction;
  final String fulfilmentConfirmAction;
  final String listingMediaUploadAction;
  final String listingMediaDeleteAction;

  factory MobileChallengeConfiguration.fromJson(Map<String, dynamic> json) {
    final enabled = json['enabled'];
    final provider = json['provider'];
    final siteKey = json['siteKey'];
    final actions = json['actions'];

    if (enabled is! bool || provider is! String || actions is! Map) {
      throw const FormatException('Invalid challenge configuration');
    }

    String requiredAction(String key, String label) {
      final value = actions[key];
      if (value is! String || !_actionPattern.hasMatch(value)) {
        throw FormatException('Invalid $label challenge action');
      }
      return value;
    }

    final paymentCheckout = requiredAction('paymentCheckout', 'checkout');
    final orderCancel = requiredAction('orderCancel', 'order cancellation');
    final fulfilmentManage = requiredAction(
      'fulfilmentManage',
      'fulfilment management',
    );
    final fulfilmentConfirm = requiredAction(
      'fulfilmentConfirm',
      'fulfilment confirmation',
    );
    final listingMediaUpload = requiredAction(
      'listingMediaUpload',
      'listing media upload',
    );
    final listingMediaDelete = requiredAction(
      'listingMediaDelete',
      'listing media deletion',
    );

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
      fulfilmentManageAction: fulfilmentManage,
      fulfilmentConfirmAction: fulfilmentConfirm,
      listingMediaUploadAction: listingMediaUpload,
      listingMediaDeleteAction: listingMediaDelete,
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
