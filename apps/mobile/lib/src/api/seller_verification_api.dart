import 'authed_api.dart';

const sellerVerificationPath = '/v1/account/seller-verification';
const sellerVerificationStartPath = '/v1/account/seller-verification/start';

abstract interface class SellerVerificationGateway {
  Future<MobileSellerVerificationStatus> fetchStatus(String accessToken);

  Future<MobileSellerVerificationSession> start(
    String accessToken, {
    required String level,
    required String countryCode,
  });
}

class SellerVerificationApi implements SellerVerificationGateway {
  const SellerVerificationApi({required this.authedApi});

  final AuthedApi authedApi;

  @override
  Future<MobileSellerVerificationStatus> fetchStatus(String accessToken) async {
    final payload = await authedApi.get(sellerVerificationPath, accessToken);
    final raw = payload['verification'];
    if (raw is! Map) {
      throw const FormatException('Invalid seller verification status');
    }
    return MobileSellerVerificationStatus.fromJson(
      Map<String, dynamic>.from(raw),
    );
  }

  @override
  Future<MobileSellerVerificationSession> start(
    String accessToken, {
    required String level,
    required String countryCode,
  }) async {
    final payload = await authedApi.post(
      sellerVerificationStartPath,
      accessToken,
      {
        'level': level,
        'countryCode': countryCode,
      },
    );
    final raw = payload['session'];
    if (raw is! Map) {
      throw const FormatException('Invalid seller verification session');
    }
    return MobileSellerVerificationSession.fromJson(
      Map<String, dynamic>.from(raw),
    );
  }
}

class MobileSellerVerificationCheck {
  const MobileSellerVerificationCheck({
    required this.id,
    required this.level,
    required this.status,
    required this.providerResult,
    required this.countryCode,
    required this.reasonCode,
    required this.submittedAt,
    required this.verifiedAt,
    required this.expiresAt,
    required this.sessionExpiresAt,
  });

  final String id;
  final String level;
  final String status;
  final String providerResult;
  final String? countryCode;
  final String? reasonCode;
  final DateTime submittedAt;
  final DateTime? verifiedAt;
  final DateTime? expiresAt;
  final DateTime? sessionExpiresAt;

  factory MobileSellerVerificationCheck.fromJson(Map<String, dynamic> json) {
    final id = json['id'];
    final level = json['level'];
    final status = json['status'];
    final providerResult = json['providerResult'];
    final submittedAt = DateTime.tryParse(json['submittedAt']?.toString() ?? '');
    if (id is! String ||
        level is! String ||
        !const {'seller', 'business'}.contains(level) ||
        status is! String ||
        !const {'pending', 'verified', 'rejected', 'expired'}.contains(status) ||
        providerResult is! String ||
        !const {'pending', 'passed', 'failed', 'review_required', 'expired'}
            .contains(providerResult) ||
        submittedAt == null) {
      throw const FormatException('Invalid seller verification check');
    }

    DateTime? optionalDate(String key) {
      final value = json[key];
      if (value == null) return null;
      final parsed = DateTime.tryParse(value.toString());
      if (parsed == null) {
        throw FormatException('Invalid seller verification $key');
      }
      return parsed.toUtc();
    }

    final countryCode = json['countryCode'];
    if (countryCode != null &&
        (countryCode is! String || !RegExp(r'^[A-Z]{2}$').hasMatch(countryCode))) {
      throw const FormatException('Invalid seller verification country');
    }
    final reasonCode = json['reasonCode'];
    if (reasonCode != null && reasonCode is! String) {
      throw const FormatException('Invalid seller verification reason');
    }

    return MobileSellerVerificationCheck(
      id: id,
      level: level,
      status: status,
      providerResult: providerResult,
      countryCode: countryCode as String?,
      reasonCode: reasonCode as String?,
      submittedAt: submittedAt.toUtc(),
      verifiedAt: optionalDate('verifiedAt'),
      expiresAt: optionalDate('expiresAt'),
      sessionExpiresAt: optionalDate('sessionExpiresAt'),
    );
  }
}

class MobileSellerVerificationStatus {
  const MobileSellerVerificationStatus({
    required this.providerEnabled,
    required this.eligibleLevel,
    required this.isBusiness,
    required this.businessName,
    required this.profileCountryCode,
    required this.current,
  });

  final bool providerEnabled;
  final String eligibleLevel;
  final bool isBusiness;
  final String? businessName;
  final String? profileCountryCode;
  final MobileSellerVerificationCheck? current;

  factory MobileSellerVerificationStatus.fromJson(Map<String, dynamic> json) {
    final providerEnabled = json['providerEnabled'];
    final eligibleLevel = json['eligibleLevel'];
    final profile = json['profile'];
    if (providerEnabled is! bool ||
        eligibleLevel is! String ||
        !const {'seller', 'business'}.contains(eligibleLevel) ||
        profile is! Map) {
      throw const FormatException('Invalid seller verification status');
    }
    final profileMap = Map<String, dynamic>.from(profile);
    final isBusiness = profileMap['isBusiness'];
    final businessName = profileMap['businessName'];
    final countryCode = profileMap['countryCode'];
    if (isBusiness is! bool ||
        (businessName != null && businessName is! String) ||
        (countryCode != null &&
            (countryCode is! String || !RegExp(r'^[A-Z]{2}$').hasMatch(countryCode)))) {
      throw const FormatException('Invalid seller verification profile');
    }
    final rawCurrent = json['current'];
    final current = rawCurrent == null
        ? null
        : rawCurrent is Map
            ? MobileSellerVerificationCheck.fromJson(
                Map<String, dynamic>.from(rawCurrent),
              )
            : throw const FormatException('Invalid current seller verification');

    return MobileSellerVerificationStatus(
      providerEnabled: providerEnabled,
      eligibleLevel: eligibleLevel,
      isBusiness: isBusiness,
      businessName: businessName as String?,
      profileCountryCode: countryCode as String?,
      current: current,
    );
  }
}

class MobileSellerVerificationSession {
  const MobileSellerVerificationSession({
    required this.checkId,
    required this.action,
    required this.hostedUrl,
    required this.sessionExpiresAt,
  });

  final String checkId;
  final String action;
  final Uri hostedUrl;
  final DateTime sessionExpiresAt;

  factory MobileSellerVerificationSession.fromJson(Map<String, dynamic> json) {
    final checkId = json['checkId'];
    final action = json['action'];
    final hostedUrl = Uri.tryParse(json['hostedUrl']?.toString() ?? '');
    final sessionExpiresAt = DateTime.tryParse(
      json['sessionExpiresAt']?.toString() ?? '',
    );
    if (checkId is! String ||
        action is! String ||
        !const {'create', 'resume'}.contains(action) ||
        hostedUrl == null ||
        hostedUrl.scheme != 'https' ||
        hostedUrl.host.isEmpty ||
        hostedUrl.userInfo.isNotEmpty ||
        sessionExpiresAt == null) {
      throw const FormatException('Invalid seller verification session');
    }
    return MobileSellerVerificationSession(
      checkId: checkId,
      action: action,
      hostedUrl: hostedUrl,
      sessionExpiresAt: sessionExpiresAt.toUtc(),
    );
  }
}
