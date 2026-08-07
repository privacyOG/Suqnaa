import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:suqnaa/src/api/account_profile_api.dart';
import 'package:suqnaa/src/api/authed_api.dart';

class FakeAuthedApi extends AuthedApi {
  FakeAuthedApi() : super(baseUrl: Uri.parse('https://example.test'));

  String? lastMethod;
  String? lastPath;
  Map<String, dynamic>? lastBody;

  @override
  Future<Map<String, dynamic>> get(String path, String accessToken) async {
    lastMethod = 'GET';
    lastPath = path;
    return {
      'user': {
        'id': '123e4567-e89b-42d3-a456-426614174000',
        'email': 'person@example.test',
        'phoneE164': '+61412345678',
        'displayName': 'Profile User',
        'status': 'active',
      },
      'profile': {
        'bio': 'Bio',
        'city': 'Sydney',
        'countryCode': 'AU',
        'isBusiness': true,
        'businessName': 'Trading Name',
        'businessDescription': 'Description',
        'businessWebsite': 'https://example.test',
        'profileVisibility': 'public',
        'showCity': false,
        'showCountry': true,
        'showBusinessDetails': true,
        'showAvatar': true,
        'hasAvatar': true,
      },
    };
  }

  @override
  Future<Map<String, dynamic>> post(
    String path,
    String accessToken,
    Map<String, dynamic> body,
  ) async {
    lastMethod = 'POST';
    lastPath = path;
    lastBody = body;
    if (path == '/v1/account/profile') {
      return get(path, accessToken);
    }
    return const {'closed': true};
  }
}

void main() {
  test('loads, updates and closes account profile through protected paths', () async {
    final transport = FakeAuthedApi();
    final api = AccountProfileApi(authedApi: transport);

    final loaded = await api.load('access');
    expect(transport.lastMethod, 'GET');
    expect(transport.lastPath, '/v1/account/profile');
    expect(loaded.displayName, 'Profile User');
    expect(loaded.profile.isBusiness, isTrue);
    expect(loaded.profile.showCity, isFalse);
    expect(loaded.profile.hasAvatar, isTrue);

    await api.save('access', {
      'displayName': 'Updated User',
      'bio': null,
      'city': 'Sydney',
      'countryCode': 'AU',
      'isBusiness': false,
      'businessName': null,
      'businessDescription': null,
      'businessWebsite': null,
      'profileVisibility': 'private',
      'showCity': false,
      'showCountry': false,
      'showBusinessDetails': false,
      'showAvatar': false,
    });
    expect(transport.lastPath, '/v1/account/profile');

    await api.close(
      'access',
      currentPassword: 'current-password',
      mode: 'delete',
      acknowledgement: 'DELETE',
    );
    expect(transport.lastPath, '/v1/account/closure');
    expect(transport.lastBody, {
      'currentPassword': 'current-password',
      'mode': 'delete',
      'acknowledgement': 'DELETE',
    });
  });

  test('mobile account surfaces expose profile privacy and lifecycle controls', () {
    final accountSource = File(
      'lib/src/features/account/account_screen.dart',
    ).readAsStringSync();
    final profileSource = File(
      'lib/src/features/account/account_profile_screen.dart',
    ).readAsStringSync();

    expect(accountSource, contains('account-profile-tile'));
    expect(accountSource, contains('AccountProfileScreen'));
    expect(profileSource, contains('profile-avatar-export-web-handoff'));
    expect(profileSource, contains('openAccountProfile'));
    expect(profileSource, contains('updateDisplayName'));
    expect(profileSource, contains('session.clear()'));
    expect(profileSource, contains('DELETE'));
    expect(profileSource, contains('profileVisibility'));
    expect(profileSource, contains('showBusinessDetails'));
    expect(profileSource, contains('البريد ورقم الهاتف'));
  });
}
