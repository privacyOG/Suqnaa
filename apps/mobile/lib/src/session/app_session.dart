import 'package:flutter/foundation.dart';
import 'access_state.dart';

class AppSession extends ChangeNotifier {
  AppSession({AccessState initial = const AccessState(value: '')})
      : _access = initial;

  AccessState _access;

  AccessState get access => _access;
  bool get isSignedIn => _access.isPresent;

  void updateAccess(AccessState next) {
    if (_access.value == next.value && _access.expiresAt == next.expiresAt) {
      return;
    }

    _access = next;
    notifyListeners();
  }

  void clear() {
    updateAccess(const AccessState(value: ''));
  }
}
