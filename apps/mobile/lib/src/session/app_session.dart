import 'dart:async';
import 'package:flutter/foundation.dart';
import '../api/auth_api.dart';
import '../api/session_api.dart';
import '../config/mobile_environment.dart';
import 'access_state.dart';

class AppSession extends ChangeNotifier {
  AppSession({
    AccessState initial = const AccessState(value: ''),
    AuthApi? authApi,
    SessionApi? sessionApi,
  })  : _access = initial,
        _authApi = authApi ??
            AuthApi(baseUrl: Uri.parse(MobileEnvironment.apiBaseUrl)),
        _sessionApi = sessionApi ??
            SessionApi(baseUrl: Uri.parse(MobileEnvironment.apiBaseUrl));

  final AuthApi _authApi;
  final SessionApi _sessionApi;

  AccessState _access;
  String? _refreshToken;
  String? _userId;
  String? _displayName;
  Timer? _refreshTimer;
  Future<void>? _refreshTask;

  AccessState get access => _access;
  String? get refreshToken => _refreshToken;
  String? get userId => _userId;
  String? get displayName => _displayName;
  bool get isSignedIn => _access.isPresent;
  bool get isRefreshing => _refreshTask != null;

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
    _scheduleRefresh();
    notifyListeners();
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
    clear();

    if (refreshToken == null) {
      return;
    }

    try {
      await _sessionApi.revoke(refreshToken: refreshToken);
    } catch (_) {
      // Local sign-out remains authoritative even when remote revocation is delayed.
    }
  }

  void clear() {
    _refreshTimer?.cancel();
    _refreshTimer = null;
    _access = const AccessState(value: '');
    _refreshToken = null;
    _userId = null;
    _displayName = null;
    notifyListeners();
  }

  Future<void> _performRefresh() async {
    final token = _refreshToken;
    if (token == null) {
      clear();
      return;
    }

    try {
      final result = await _authApi.refresh(token);
      establish(
        access: AccessState.fromToken(result.accessToken),
        refreshToken: result.session.refreshToken,
        userId: result.user.id,
        displayName: result.user.displayName,
      );
    } catch (_) {
      final expiry = _access.expiresAtTime;
      final now = DateTime.now().toUtc();

      if (expiry != null && expiry.isAfter(now)) {
        _scheduleRetry(expiry.difference(now));
        return;
      }

      clear();
    }
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
