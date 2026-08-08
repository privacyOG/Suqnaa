import 'authed_api.dart';

const sellerPayoutPath = '/v1/account/payouts';
const sellerPayoutOnboardingPath = '/v1/account/payouts/onboarding';

class MobileSellerPayoutStatus {
  const MobileSellerPayoutStatus({
    required this.enabled,
    required this.onboardingStatus,
    required this.transfersEnabled,
    required this.payoutsEnabled,
    required this.requirementsDue,
    required this.disabledReason,
  });

  final bool enabled;
  final String? onboardingStatus;
  final bool transfersEnabled;
  final bool payoutsEnabled;
  final int requirementsDue;
  final String? disabledReason;

  factory MobileSellerPayoutStatus.fromJson(Map<String, dynamic> json) {
    final enabled = json['enabled'];
    final rawAccount = json['account'];
    if (enabled is! bool || (rawAccount != null && rawAccount is! Map)) {
      throw const FormatException('Invalid seller payout status');
    }
    if (rawAccount == null) {
      return MobileSellerPayoutStatus(
        enabled: enabled,
        onboardingStatus: null,
        transfersEnabled: false,
        payoutsEnabled: false,
        requirementsDue: 0,
        disabledReason: null,
      );
    }
    final account = Map<String, dynamic>.from(rawAccount);
    final status = account['onboardingStatus'];
    final transfers = account['transfersEnabled'];
    final payouts = account['payoutsEnabled'];
    final due = account['requirementsDue'];
    if (status is! String || transfers is! bool || payouts is! bool || due is! num) {
      throw const FormatException('Invalid seller payout account');
    }
    return MobileSellerPayoutStatus(
      enabled: enabled,
      onboardingStatus: status,
      transfersEnabled: transfers,
      payoutsEnabled: payouts,
      requirementsDue: due.toInt(),
      disabledReason: account['disabledReason']?.toString(),
    );
  }
}

class MobileSellerPayoutOnboarding {
  const MobileSellerPayoutOnboarding({required this.hostedUrl, required this.expiresAt});
  final Uri hostedUrl;
  final DateTime expiresAt;

  factory MobileSellerPayoutOnboarding.fromJson(Map<String, dynamic> json) {
    final url = Uri.tryParse(json['hostedUrl']?.toString() ?? '');
    final expiresAt = DateTime.tryParse(json['expiresAt']?.toString() ?? '');
    if (url == null || url.scheme != 'https' || expiresAt == null ||
        !(url.host == 'connect.stripe.com' || url.host.endsWith('.connect.stripe.com') ||
          url.host == 'accounts.stripe.com' || url.host.endsWith('.accounts.stripe.com'))) {
      throw const FormatException('Invalid seller payout onboarding');
    }
    return MobileSellerPayoutOnboarding(hostedUrl: url, expiresAt: expiresAt.toUtc());
  }
}

class SellerPayoutApi {
  const SellerPayoutApi({required this.authedApi});
  final AuthedApi authedApi;

  Future<MobileSellerPayoutStatus> fetchStatus(String accessToken) async {
    final payload = await authedApi.get(sellerPayoutPath, accessToken);
    final raw = payload['payouts'];
    if (raw is! Map) throw const FormatException('Invalid seller payout response');
    return MobileSellerPayoutStatus.fromJson(Map<String, dynamic>.from(raw));
  }

  Future<MobileSellerPayoutOnboarding> beginOnboarding(String accessToken, String locale) async {
    final payload = await authedApi.post(sellerPayoutOnboardingPath, accessToken, {
      'locale': locale == 'ar' ? 'ar' : 'en',
    });
    final raw = payload['onboarding'];
    if (raw is! Map) throw const FormatException('Invalid seller payout onboarding response');
    return MobileSellerPayoutOnboarding.fromJson(Map<String, dynamic>.from(raw));
  }
}
