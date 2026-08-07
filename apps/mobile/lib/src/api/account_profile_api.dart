import 'authed_api.dart';

class AccountProfileApi {
  AccountProfileApi({required this.authedApi});

  final AuthedApi authedApi;

  Future<AccountProfileRecord> load(String accessToken) async {
    final payload = await authedApi.get('/v1/account/profile', accessToken);
    return AccountProfileRecord.fromJson(payload);
  }

  Future<AccountProfileRecord> save(
    String accessToken,
    Map<String, dynamic> input,
  ) async {
    final payload = await authedApi.post('/v1/account/profile', accessToken, input);
    return AccountProfileRecord.fromJson(payload);
  }

  Future<void> close(
    String accessToken, {
    required String currentPassword,
    required String mode,
    required String acknowledgement,
  }) async {
    await authedApi.post('/v1/account/closure', accessToken, {
      'currentPassword': currentPassword,
      'mode': mode,
      'acknowledgement': acknowledgement,
    });
  }
}

class AccountProfileRecord {
  const AccountProfileRecord({
    required this.displayName,
    required this.email,
    required this.phoneE164,
    required this.profile,
  });

  final String displayName;
  final String? email;
  final String? phoneE164;
  final AccountProfileDetails profile;

  factory AccountProfileRecord.fromJson(Map<String, dynamic> json) {
    final user = Map<String, dynamic>.from(json['user'] as Map);
    final profile = Map<String, dynamic>.from(json['profile'] as Map);
    return AccountProfileRecord(
      displayName: user['displayName'] as String,
      email: user['email'] as String?,
      phoneE164: user['phoneE164'] as String?,
      profile: AccountProfileDetails.fromJson(profile),
    );
  }
}

class AccountProfileDetails {
  const AccountProfileDetails({
    required this.bio,
    required this.city,
    required this.countryCode,
    required this.isBusiness,
    required this.businessName,
    required this.businessDescription,
    required this.businessWebsite,
    required this.profileVisibility,
    required this.showCity,
    required this.showCountry,
    required this.showBusinessDetails,
    required this.showAvatar,
    required this.hasAvatar,
  });

  final String? bio;
  final String? city;
  final String? countryCode;
  final bool isBusiness;
  final String? businessName;
  final String? businessDescription;
  final String? businessWebsite;
  final String profileVisibility;
  final bool showCity;
  final bool showCountry;
  final bool showBusinessDetails;
  final bool showAvatar;
  final bool hasAvatar;

  factory AccountProfileDetails.fromJson(Map<String, dynamic> json) {
    return AccountProfileDetails(
      bio: json['bio'] as String?,
      city: json['city'] as String?,
      countryCode: json['countryCode'] as String?,
      isBusiness: json['isBusiness'] == true,
      businessName: json['businessName'] as String?,
      businessDescription: json['businessDescription'] as String?,
      businessWebsite: json['businessWebsite'] as String?,
      profileVisibility: json['profileVisibility'] as String? ?? 'public',
      showCity: json['showCity'] == true,
      showCountry: json['showCountry'] != false,
      showBusinessDetails: json['showBusinessDetails'] != false,
      showAvatar: json['showAvatar'] != false,
      hasAvatar: json['hasAvatar'] == true,
    );
  }
}
