import 'authed_api.dart';

class AccountVerificationApi {
  AccountVerificationApi({required this.api});

  final AuthedApi api;

  Future<AccountVerificationState> load(String accessToken) async {
    final payload = await api.get('/v1/account/verification', accessToken);
    final verification = payload['verification'];
    if (verification is! Map) {
      throw const FormatException('Invalid verification response');
    }
    return AccountVerificationState.fromJson(
      Map<String, dynamic>.from(verification),
    );
  }

  Future<VerificationRequestResult> requestCode(
    String accessToken,
    VerificationChannel channel,
  ) async {
    final payload = await api.post(
      '/v1/account/verification/request',
      accessToken,
      {'channel': channel.name},
    );
    return VerificationRequestResult.fromJson(payload);
  }

  Future<VerificationConfirmResult> confirmCode(
    String accessToken,
    VerificationChannel channel,
    String code,
  ) async {
    final payload = await api.post(
      '/v1/account/verification/confirm',
      accessToken,
      {'channel': channel.name, 'code': code},
    );
    return VerificationConfirmResult.fromJson(payload);
  }
}

enum VerificationChannel { email, phone }

class VerificationChannelState {
  const VerificationChannelState({
    required this.channel,
    required this.available,
    required this.destination,
    required this.verifiedAt,
  });

  final VerificationChannel channel;
  final bool available;
  final String? destination;
  final DateTime? verifiedAt;

  bool get isVerified => verifiedAt != null;

  factory VerificationChannelState.fromJson(Map<String, dynamic> json) {
    final channelName = json['channel'];
    final channel = VerificationChannel.values.firstWhere(
      (value) => value.name == channelName,
      orElse: () => throw const FormatException('Unknown verification channel'),
    );
    final verifiedValue = json['verifiedAt'];

    return VerificationChannelState(
      channel: channel,
      available: json['available'] == true,
      destination: json['destination'] as String?,
      verifiedAt: verifiedValue == null
          ? null
          : DateTime.parse(verifiedValue.toString()).toUtc(),
    );
  }
}

class AccountVerificationState {
  const AccountVerificationState({
    required this.status,
    required this.channels,
  });

  final String status;
  final List<VerificationChannelState> channels;

  factory AccountVerificationState.fromJson(Map<String, dynamic> json) {
    final channelValues = json['channels'];
    if (channelValues is! List) {
      throw const FormatException('Missing verification channels');
    }

    return AccountVerificationState(
      status: json['status']?.toString() ?? 'pending',
      channels: channelValues
          .map((value) => VerificationChannelState.fromJson(
                Map<String, dynamic>.from(value as Map),
              ))
          .toList(growable: false),
    );
  }
}

class VerificationRequestResult {
  const VerificationRequestResult({
    required this.expiresAt,
    required this.resendAfterSeconds,
  });

  final DateTime expiresAt;
  final int resendAfterSeconds;

  factory VerificationRequestResult.fromJson(Map<String, dynamic> json) {
    return VerificationRequestResult(
      expiresAt: DateTime.parse(json['expiresAt'].toString()).toUtc(),
      resendAfterSeconds: json['resendAfterSeconds'] as int,
    );
  }
}

class VerificationConfirmResult {
  const VerificationConfirmResult({
    required this.verifiedAt,
    required this.status,
  });

  final DateTime verifiedAt;
  final String status;

  factory VerificationConfirmResult.fromJson(Map<String, dynamic> json) {
    return VerificationConfirmResult(
      verifiedAt: DateTime.parse(json['verifiedAt'].toString()).toUtc(),
      status: json['status'] as String,
    );
  }
}
