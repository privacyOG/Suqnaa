import 'package:flutter/material.dart';
import '../../api/password_security_api.dart';
import '../../api/session_authed_api.dart';
import '../../brand/brand.dart';
import '../../config/mobile_environment.dart';
import '../../session/session_scope.dart';

class AccountSecurityScreen extends StatefulWidget {
  const AccountSecurityScreen({super.key});

  @override
  State<AccountSecurityScreen> createState() => _AccountSecurityScreenState();
}

class _AccountSecurityScreenState extends State<AccountSecurityScreen> {
  final _currentController = TextEditingController();
  final _newController = TextEditingController();
  final _confirmController = TextEditingController();
  PasswordSecurityApi? _api;
  List<SecuritySessionRecord> _sessions = const [];
  bool _loading = true;
  bool _busy = false;
  String? _error;
  String? _success;

  bool get _isArabic => Localizations.localeOf(context).languageCode == 'ar';

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _api ??= PasswordSecurityApi(
      baseUrl: Uri.parse(MobileEnvironment.apiBaseUrl),
      authedApi: SessionAuthedApi(
        baseUrl: Uri.parse(MobileEnvironment.apiBaseUrl),
        sessionProvider: () => SessionScope.of(context),
      ),
    );
    if (_loading && _sessions.isEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _load());
    }
  }

  @override
  void dispose() {
    _currentController.dispose();
    _newController.dispose();
    _confirmController.dispose();
    super.dispose();
  }

  String _failure(Object error) {
    if (error is SessionRequestException) {
      if (error.statusCode == 401) {
        return _isArabic ? 'انتهت جلسة الحساب. سجّل الدخول مرة أخرى.' : 'Your session ended. Sign in again.';
      }
      if (error.statusCode == 429) {
        return _isArabic ? 'طلبات كثيرة. حاول لاحقاً.' : 'Too many security requests. Try again later.';
      }
      if (error.statusCode == 400) {
        return _isArabic ? 'تحقق من كلمة المرور الحالية.' : 'Check your current password.';
      }
      if (error.statusCode == 409) {
        return _isArabic ? 'اختر كلمة مرور جديدة مختلفة.' : 'Choose a different new password.';
      }
    }
    return _isArabic ? 'تعذر تحديث أمان الحساب.' : 'Account security could not be updated.';
  }

  Future<void> _load() async {
    final api = _api;
    if (api == null || !mounted) return;
    final session = SessionScope.of(context);
    if (!session.isSignedIn) {
      setState(() {
        _loading = false;
        _error = _isArabic ? 'سجّل الدخول أولاً.' : 'Sign in first.';
      });
      return;
    }
    try {
      final next = await api.listSessions(session.access.value);
      if (!mounted) return;
      setState(() {
        _sessions = next;
        _error = null;
      });
    } catch (error) {
      if (mounted) setState(() => _error = _failure(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _changePassword() async {
    if (_busy) return;
    final current = _currentController.text;
    final next = _newController.text;
    if (current.isEmpty || next.length < 10) return;
    if (next != _confirmController.text) {
      setState(() => _error = _isArabic ? 'كلمتا المرور الجديدتان غير متطابقتين.' : 'The new passwords do not match.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
      _success = null;
    });
    try {
      final session = SessionScope.of(context);
      await _api!.changePassword(session.access.value, current, next);
      await session.clear();
      if (!mounted) return;
      Navigator.of(context).pop(true);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_isArabic ? 'تم تغيير كلمة المرور. سجّل الدخول مجدداً.' : 'Password changed. Sign in again.')),
      );
    } catch (error) {
      if (mounted) setState(() => _error = _failure(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _revokeOne(String id) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
      _success = null;
    });
    try {
      final session = SessionScope.of(context);
      await _api!.revokeSession(session.access.value, id);
      await _load();
      if (mounted) {
        setState(() => _success = _isArabic ? 'تم إلغاء الجلسة.' : 'Session revoked.');
      }
    } catch (error) {
      if (mounted) setState(() => _error = _failure(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _revokeAll() async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
      _success = null;
    });
    try {
      final session = SessionScope.of(context);
      await _api!.revokeAllSessions(session.access.value);
      await session.clear();
      if (!mounted) return;
      Navigator.of(context).pop(true);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_isArabic ? 'تم إلغاء جميع الجلسات.' : 'All sessions were revoked.')),
      );
    } catch (error) {
      if (mounted) setState(() => _error = _failure(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _date(DateTime value) => value.toLocal().toString();

  @override
  Widget build(BuildContext context) {
    final ar = _isArabic;
    return Scaffold(
      appBar: AppBar(
        title: Text(ar ? 'أمان الحساب' : 'Account security'),
        backgroundColor: SuqnaaBrand.ivory,
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text(
            ar ? 'كلمة المرور والجلسات' : 'Password and sessions',
            style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w900, color: SuqnaaBrand.blue),
          ),
          const SizedBox(height: 8),
          Text(ar
              ? 'تغيير كلمة المرور يلغي جميع الجلسات ويطلب تسجيل الدخول مجدداً.'
              : 'Changing your password revokes every session and requires a fresh sign-in.'),
          const SizedBox(height: 24),
          TextField(
            controller: _currentController,
            obscureText: true,
            autofillHints: const [AutofillHints.password],
            decoration: InputDecoration(labelText: ar ? 'كلمة المرور الحالية' : 'Current password', border: const OutlineInputBorder()),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _newController,
            obscureText: true,
            autofillHints: const [AutofillHints.newPassword],
            decoration: InputDecoration(labelText: ar ? 'كلمة المرور الجديدة' : 'New password', border: const OutlineInputBorder()),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _confirmController,
            obscureText: true,
            autofillHints: const [AutofillHints.newPassword],
            decoration: InputDecoration(labelText: ar ? 'تأكيد كلمة المرور' : 'Confirm new password', border: const OutlineInputBorder()),
          ),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: _busy ? null : _changePassword,
            child: Text(ar ? 'تغيير كلمة المرور' : 'Change password'),
          ),
          const Divider(height: 40),
          Text(ar ? 'الجلسات النشطة' : 'Active sessions', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          if (_loading) const Center(child: CircularProgressIndicator()),
          if (!_loading && _sessions.isEmpty)
            Text(ar ? 'لا توجد جلسات تجديد نشطة.' : 'No active refresh sessions remain.'),
          ..._sessions.map((session) => Card(
                child: ListTile(
                  leading: const Icon(Icons.devices_outlined, color: SuqnaaBrand.blue),
                  title: Text(session.userAgent ?? (ar ? 'جهاز غير معروف' : 'Unknown device')),
                  subtitle: Text(
                    '${ar ? 'عنوان الشبكة' : 'Network address'}: ${session.ipAddress ?? '—'}\n'
                    '${ar ? 'بدأت' : 'Started'}: ${_date(session.createdAt)}\n'
                    '${ar ? 'تنتهي' : 'Expires'}: ${_date(session.expiresAt)}',
                  ),
                  isThreeLine: true,
                  trailing: IconButton(
                    tooltip: ar ? 'إلغاء الجلسة' : 'Revoke session',
                    onPressed: _busy ? null : () => _revokeOne(session.id),
                    icon: const Icon(Icons.logout),
                  ),
                ),
              )),
          if (_sessions.isNotEmpty) ...[
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: _busy ? null : _revokeAll,
              icon: const Icon(Icons.phonelink_erase_outlined),
              label: Text(ar ? 'إلغاء جميع الجلسات' : 'Revoke all sessions'),
            ),
          ],
          if (_success != null) ...[
            const SizedBox(height: 12),
            Text(_success!, style: const TextStyle(fontWeight: FontWeight.w700)),
          ],
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
          ],
        ],
      ),
    );
  }
}
