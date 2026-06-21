import 'dart:async';
import 'package:flutter/foundation.dart';
import '../api/auth_api.dart';
import '../api/session_api.dart';
import '../config/mobile_environment.dart';
import 'access_state.dart';
import 'session_vault.dart';

class AppSession extends ChangeNotifier {
  AppSession({
    AccessState initial = const AccessState(value: ''),
    AuthApi? authApi,
    SessionApi? sessionApi,
    SessionVault? vault,
  })  : _access = initial,
        _authApi = authApi ??
            AuthApi(baseUrl: Uri.parse(MobileEnvironment.apiBaseUrl)),
        _sessionApi = sessionApi ??
            SessionApi(baseUrl: Uri.parse(MobileEnvironment.apiBaseUrl)),
        _vault = vault ?? SecureSessionVault();

  final AuthApi _authApi;
  final SessionApi _sessionApi;
  final SessionVault _vault;

  AccessState _access;
  String? _refreshToken;
  String? _userId;
  String? _displayName;
  Timer? _refreshTimer;
  Future<void>? _refreshTask;
  Future<void>? _restoreTask;
  bool _isRestoring = false;
  int _revision = 0;

  AccessState get access => _access;
  String? get refreshToken => _refreshToken;
  String? get userId => _userId;
  String? get displayName => _displayName;
  bool get isSignedIn => _access.isPresent;
  bool get isRefreshing => _refreshTask != null;
  bool get isRestoring => _isRestoring;

  Future<void> restore() {
    final running = _restoreTask;
    if (running != null) {
      return running;
    }

    if (isSignedIn) {
      return Future.value();
    }

    final task = _performRestore();
    _restoreTask = task;
    task.whenComplete(() {
      if (identical(_restoreTask, task)) {
        _restoreTask = null;
      }
    });
    return task;
  }

  Future<void> establish({
    required AccessState access,
    required String refreshToken,
    required String userId,
    required String displayName,
  }) async {
    _revision += 1;
    _applySession(
      access: access,
      refreshToken: refreshToken,
      userId: userId,
      displayName: displayName,
    );

    try {
      await _vault.writeRefreshToken(refreshToken);
    } catch (_) {
      // The active in-memory session remains usable if secure storage is unavailable.
    }
  }

  void updateAccess(AccessState next) {
    if (_access.value == next.value && _access.expiresAt == next.expiresAt) {
      return;
    }

    _access = next;
    _scheduleRefresh();
    notifyListeners();
  }

  Future<void> ensureFreshAccess({bool force = false}) {
    if (!isSignedIn || _refreshToken == null) {
      return Future.value();
    }

    if (!force && !_access.shouldRefresh()) {
      return Future.value();
    }

    final running = _refreshTask;
    if (running != null) {
      return running;
    }

    final task = _performRefresh();
    _refreshTask = task;
    task.whenComplete(() {
      if (identical(_refreshTask, task)) {
        _refreshTask = null;
      }
    });
    return task;
  }

  Future<void> signOut() async {
    final refreshToken = _refreshToken;
    _revision += 1;
    _clearLocal();

    try {
      await _vault.clear();
    } catch (_) {
      // Local sign-out remains authoritative if secure storage cleanup fails.
    }

    if (refreshToken == null) {
      return;
    }

    try {
      await _sessionApi.revoke(refreshToken: refreshToken);
    } catch (_) {
      // A later server-side expiry still limits an unreachable revocation request.
    }
  }

  Future<void> clear() async {
    _revision += 1;
    _clearLocal();

    try {
      await _vault.clear();
    } catch (_) {
      // Local state is already cleared.
    }
  }

  Future<void> _performRestore() async {
    final revision = _revision;
    _isRestoring = true;
    notifyListeners();

    try {
      final storedToken = await _vault.readRefreshToken();
      if (storedToken == null || storedToken.isEmpty || revision != _revision) {
        return;
      }

      final result = await _authApi.refresh(storedToken);
      if (revision != _revision || isSignedIn) {
        return;
      }

      await establish(
        access: AccessState.fromToken(result.accessToken),
        refreshToken: result.session.refreshToken,
        userId: result.user.id,
        displayName: result.user.displayName,
      );
    } catch (_) {
      if (revision == _revision && !isSignedIn) {
        try {
          await _vault.clear();
        } catch (_) {
          // Invalid stored credentials remain unusable even if deletion is delayed.
        }
      }
    } finally {
      _isRestoring = false;
      notifyListeners();
    }
  }

  Future<void> _performRefresh() async {
    final token = _refreshToken;
    final revision = _revision;
    if (token == null) {
      await clear();
      return;
    }

    try {
      final result = await _authApi.refresh(token);
      if (revision != _revision || _refreshToken != token) {
        return;
      }

      await establish(
        access: AccessState.fromToken(result.accessToken),
        refreshToken: result.session.refreshToken,
        userId: result.user.id,
        displayName: result.user.displayName,
      );
    } catch (_) {
      if (revision != _revision || _refreshToken != token) {
        return;
      }

      final expiry = _access.expiresAtTime;
      final now = DateTime.now().toUtc();

      if (expiry != null && expiry.isAfter(now)) {
        _scheduleRetry(expiry.difference(now));
        return;
      }

      await clear();
    }
  }

  void _applySession({
    required AccessState access,
    required String refreshToken,
    required String userId,
    required String displayName,
  }) {
    _access = access;
    _refreshToken = refreshToken;
    _userId = userId;
    _displayName = displayName;
    _scheduleRefresh();
    notifyListeners();
  }

  void _clearLocal() {
    _refreshTimer?.cancel();
    _refreshTimer = null;
    _access = const AccessState(value: '');
    _refreshToken = null;
    _userId = null;
    _displayName = null;
    notifyListeners();
  }

  void _scheduleRefresh() {
    _refreshTimer?.cancel();
    _refreshTimer = null;

    final expiry = _access.expiresAtTime;
    if (!isSignedIn || _refreshToken == null || expiry == null) {
      return;
    }

    final refreshAt = expiry.subtract(const Duration(minutes: 2));
    final now = DateTime.now().toUtc();
    final delay = refreshAt.isAfter(now)
        ? refreshAt.difference(now)
        : Duration.zero;

    _refreshTimer = Timer(delay, () {
      ensureFreshAccess(force: true);
    });
  }

  void _scheduleRetry(Duration remainingValidity) {
    _refreshTimer?.cancel();
    final delay = remainingValidity > const Duration(seconds: 30)
        ? const Duration(seconds: 30)
        : remainingValidity;

    _refreshTimer = Timer(delay, () {
      ensureFreshAccess(force: true);
    });
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    super.dispose();
  }
}
