import 'package:flutter/foundation.dart';
import 'access_state.dart';

class AppSession extends ChangeNotifier {
  AppSession({AccessState initial = const AccessState(value: '')})
      : _access = initial;

  AccessState _access;
  String? _refreshToken;
  String? _userId;
  String? _displayName;

  AccessState get access => _access;
  String? get refreshToken => _refreshToken;
  String? get userId => _userId;
  String? get displayName => _displayName;
  bool get isSignedIn => _access.isPresent;

  void establish({
    required AccessState access,
    required String refreshToken,
    required String userId,
    required String displayName,
  }) {
    _access = access;
    _refreshToken = refreshToken;
    _userId = userId;
    _displayName = displayName;
    notifyListeners();
  }

  void updateAccess(AccessState next) {
    if (_access.value == next.value && _access.expiresAt == next.expiresAt) {
      return;
    }

    _access = next;
    notifyListeners();
  }

  void clear() {
    _access = const AccessState(value: '');
    _refreshToken = null;
    _userId = null;
    _displayName = null;
    notifyListeners();
  }
}
