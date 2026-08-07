import 'package:flutter/material.dart';
import '../../api/account_profile_api.dart';
import '../../api/session_authed_api.dart';
import '../../brand/brand.dart';
import '../../config/mobile_environment.dart';
import '../../navigation/secure_web_handoff.dart';
import '../../session/session_scope.dart';

class AccountProfileScreen extends StatefulWidget {
  const AccountProfileScreen({super.key});

  @override
  State<AccountProfileScreen> createState() => _AccountProfileScreenState();
}

class _AccountProfileScreenState extends State<AccountProfileScreen> {
  final _displayName = TextEditingController();
  final _bio = TextEditingController();
  final _city = TextEditingController();
  final _country = TextEditingController();
  final _businessName = TextEditingController();
  final _businessDescription = TextEditingController();
  final _businessWebsite = TextEditingController();
  final _currentPassword = TextEditingController();
  final _acknowledgement = TextEditingController();

  AccountProfileApi? _api;
  SecureWebHandoffGateway? _handoff;
  bool _loading = true;
  bool _busy = false;
  bool _isBusiness = false;
  bool _showCity = false;
  bool _showCountry = true;
  bool _showBusinessDetails = true;
  bool _showAvatar = true;
  String _visibility = 'public';
  String _closureMode = 'close';
  bool _hasAvatar = false;
  String? _error;
  String? _success;

  bool get _isArabic => Localizations.localeOf(context).languageCode == 'ar';

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _api ??= AccountProfileApi(
      authedApi: SessionAuthedApi(
        baseUrl: Uri.parse(MobileEnvironment.apiBaseUrl),
        sessionProvider: () => SessionScope.of(context),
      ),
    );
    if (_handoff == null) {
      try {
        _handoff = BrowserSecureWebHandoff(
          webBaseUrl: Uri.parse(MobileEnvironment.webBaseUrl),
        );
      } catch (_) {
        _handoff = null;
      }
    }
    if (_loading) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _load());
    }
  }

  @override
  void dispose() {
    _displayName.dispose();
    _bio.dispose();
    _city.dispose();
    _country.dispose();
    _businessName.dispose();
    _businessDescription.dispose();
    _businessWebsite.dispose();
    _currentPassword.dispose();
    _acknowledgement.dispose();
    super.dispose();
  }

  String _failure(Object error) {
    if (error is SessionRequestException) {
      if (error.statusCode == 401) {
        return _isArabic ? 'انتهت جلسة الحساب.' : 'Your account session ended.';
      }
      if (error.statusCode == 429) {
        return _isArabic ? 'طلبات كثيرة. حاول لاحقاً.' : 'Too many requests. Try again later.';
      }
      if (error.statusCode == 400) {
        return _isArabic ? 'تحقق من البيانات وكلمة المرور.' : 'Check the profile values and current password.';
      }
    }
    return _isArabic ? 'تعذر تحديث ملف الحساب.' : 'The account profile could not be updated.';
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
      final value = await api.load(session.access.value);
      if (!mounted) return;
      _displayName.text = value.displayName;
      _bio.text = value.profile.bio ?? '';
      _city.text = value.profile.city ?? '';
      _country.text = value.profile.countryCode ?? '';
      _businessName.text = value.profile.businessName ?? '';
      _businessDescription.text = value.profile.businessDescription ?? '';
      _businessWebsite.text = value.profile.businessWebsite ?? '';
      setState(() {
        _isBusiness = value.profile.isBusiness;
        _showCity = value.profile.showCity;
        _showCountry = value.profile.showCountry;
        _showBusinessDetails = value.profile.showBusinessDetails;
        _showAvatar = value.profile.showAvatar;
        _visibility = value.profile.profileVisibility;
        _hasAvatar = value.profile.hasAvatar;
        _error = null;
      });
    } catch (error) {
      if (mounted) setState(() => _error = _failure(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String? _optional(TextEditingController controller) {
    final value = controller.text.trim();
    return value.isEmpty ? null : value;
  }

  Future<void> _save() async {
    if (_busy || _displayName.text.trim().length < 2) return;
    if (_isBusiness && _businessName.text.trim().length < 2) {
      setState(() => _error = _isArabic ? 'أدخل اسم النشاط.' : 'Enter a business name.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
      _success = null;
    });
    try {
      final session = SessionScope.of(context);
      final value = await _api!.save(session.access.value, {
        'displayName': _displayName.text.trim(),
        'bio': _optional(_bio),
        'city': _optional(_city),
        'countryCode': _country.text.trim().isEmpty ? null : _country.text.trim().toUpperCase(),
        'isBusiness': _isBusiness,
        'businessName': _optional(_businessName),
        'businessDescription': _optional(_businessDescription),
        'businessWebsite': _optional(_businessWebsite),
        'profileVisibility': _visibility,
        'showCity': _showCity,
        'showCountry': _showCountry,
        'showBusinessDetails': _showBusinessDetails,
        'showAvatar': _showAvatar,
      });
      session.updateDisplayName(value.displayName);
      if (!mounted) return;
      setState(() => _success = _isArabic ? 'تم حفظ الملف الشخصي.' : 'Profile saved.');
    } catch (error) {
      if (mounted) setState(() => _error = _failure(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _openWebProfile() async {
    final handoff = _handoff;
    if (handoff == null) return;
    final opened = await handoff.openAccountProfile(
      locale: Localizations.localeOf(context).languageCode,
    );
    if (!opened && mounted) {
      setState(() => _error = _isArabic ? 'تعذر فتح صفحة الملف الآمنة.' : 'Unable to open the secure profile page.');
    }
  }

  Future<void> _closeAccount() async {
    if (_busy || _currentPassword.text.isEmpty) return;
    final expected = _closureMode == 'delete' ? 'DELETE' : 'CLOSE';
    if (_acknowledgement.text.trim() != expected) {
      setState(() => _error = _isArabic ? 'اكتب $expected للتأكيد.' : 'Type $expected to confirm.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
      _success = null;
    });
    try {
      final session = SessionScope.of(context);
      await _api!.close(
        session.access.value,
        currentPassword: _currentPassword.text,
        mode: _closureMode,
        acknowledgement: expected,
      );
      await session.clear();
      if (!mounted) return;
      Navigator.of(context).pop(true);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_isArabic ? 'تم إغلاق الحساب.' : 'Account closed.')),
      );
    } catch (error) {
      if (mounted) setState(() => _error = _failure(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ar = _isArabic;
    return Scaffold(
      appBar: AppBar(
        title: Text(ar ? 'الملف والخصوصية' : 'Profile and privacy'),
        backgroundColor: SuqnaaBrand.ivory,
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(20),
              children: [
                Text(
                  ar ? 'ملف السوق' : 'Marketplace profile',
                  style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w900, color: SuqnaaBrand.blue),
                ),
                const SizedBox(height: 8),
                Text(ar
                    ? 'عدّل بيانات الملف والخصوصية. البريد ورقم الهاتف لا يظهران في الملف العام.'
                    : 'Edit profile and privacy settings. Email and phone are never exposed by the public profile.'),
                const SizedBox(height: 20),
                TextField(controller: _displayName, decoration: InputDecoration(labelText: ar ? 'الاسم المعروض' : 'Display name', border: const OutlineInputBorder())),
                const SizedBox(height: 12),
                TextField(controller: _bio, maxLength: 1000, maxLines: 4, decoration: InputDecoration(labelText: ar ? 'نبذة' : 'Bio', border: const OutlineInputBorder())),
                const SizedBox(height: 12),
                TextField(controller: _city, maxLength: 120, decoration: InputDecoration(labelText: ar ? 'المدينة' : 'City', border: const OutlineInputBorder())),
                const SizedBox(height: 12),
                TextField(controller: _country, maxLength: 2, textCapitalization: TextCapitalization.characters, decoration: InputDecoration(labelText: ar ? 'رمز الدولة' : 'Country code', hintText: 'AU', border: const OutlineInputBorder())),
                SwitchListTile(
                  value: _isBusiness,
                  onChanged: _busy ? null : (value) => setState(() => _isBusiness = value),
                  title: Text(ar ? 'ملف تجاري' : 'Business profile'),
                ),
                if (_isBusiness) ...[
                  TextField(controller: _businessName, maxLength: 120, decoration: InputDecoration(labelText: ar ? 'اسم النشاط' : 'Business name', border: const OutlineInputBorder())),
                  const SizedBox(height: 12),
                  TextField(controller: _businessDescription, maxLength: 1000, maxLines: 3, decoration: InputDecoration(labelText: ar ? 'وصف النشاط' : 'Business description', border: const OutlineInputBorder())),
                  const SizedBox(height: 12),
                  TextField(controller: _businessWebsite, keyboardType: TextInputType.url, decoration: InputDecoration(labelText: ar ? 'موقع النشاط' : 'Business website', border: const OutlineInputBorder())),
                ],
                const Divider(height: 36),
                DropdownButtonFormField<String>(
                  value: _visibility,
                  decoration: InputDecoration(labelText: ar ? 'ظهور الملف' : 'Profile visibility', border: const OutlineInputBorder()),
                  items: [
                    DropdownMenuItem(value: 'public', child: Text(ar ? 'عام' : 'Public')),
                    DropdownMenuItem(value: 'private', child: Text(ar ? 'خاص' : 'Private')),
                  ],
                  onChanged: _busy ? null : (value) => setState(() => _visibility = value ?? 'public'),
                ),
                SwitchListTile(value: _showCity, onChanged: _busy ? null : (value) => setState(() => _showCity = value), title: Text(ar ? 'إظهار المدينة' : 'Show city')),
                SwitchListTile(value: _showCountry, onChanged: _busy ? null : (value) => setState(() => _showCountry = value), title: Text(ar ? 'إظهار الدولة' : 'Show country')),
                SwitchListTile(value: _showBusinessDetails, onChanged: _busy ? null : (value) => setState(() => _showBusinessDetails = value), title: Text(ar ? 'إظهار بيانات النشاط' : 'Show business details')),
                SwitchListTile(value: _showAvatar, onChanged: _busy ? null : (value) => setState(() => _showAvatar = value), title: Text(ar ? 'إظهار الصورة الشخصية' : 'Show avatar')),
                FilledButton(onPressed: _busy ? null : _save, child: Text(ar ? 'حفظ الملف' : 'Save profile')),
                const Divider(height: 36),
                ListTile(
                  key: const Key('profile-avatar-export-web-handoff'),
                  leading: const Icon(Icons.open_in_browser, color: SuqnaaBrand.blue),
                  title: Text(ar ? 'الصورة الشخصية ونسخة البيانات' : 'Avatar and account export'),
                  subtitle: Text(ar
                      ? '${_hasAvatar ? 'لديك صورة حالية. ' : ''}استخدم صفحة الملف الآمنة لرفع الصورة أو تنزيل نسخة JSON من البيانات.'
                      : '${_hasAvatar ? 'You have an avatar. ' : ''}Use the secure profile page to upload an avatar or download the JSON account export.'),
                  onTap: _openWebProfile,
                ),
                const Divider(height: 36),
                Text(ar ? 'إغلاق أو حذف الحساب' : 'Close or delete account', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
                const SizedBox(height: 8),
                Text(ar
                    ? 'الإغلاق يعطّل تسجيل الدخول ويخفي الملف. الحذف يزيل أيضاً بيانات الاتصال والملف الشخصي مع الاحتفاظ بسجلات السوق اللازمة للطلبات والتدقيق.'
                    : 'Closing disables sign-in and hides the profile. Deletion also removes contact/profile identity while retaining marketplace records needed for order and audit integrity.'),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  value: _closureMode,
                  decoration: InputDecoration(labelText: ar ? 'الإجراء' : 'Action', border: const OutlineInputBorder()),
                  items: [
                    DropdownMenuItem(value: 'close', child: Text(ar ? 'إغلاق الحساب' : 'Close account')),
                    DropdownMenuItem(value: 'delete', child: Text(ar ? 'حذف البيانات الشخصية' : 'Delete personal account data')),
                  ],
                  onChanged: _busy ? null : (value) {
                    setState(() {
                      _closureMode = value ?? 'close';
                      _acknowledgement.clear();
                    });
                  },
                ),
                const SizedBox(height: 12),
                TextField(controller: _currentPassword, obscureText: true, autofillHints: const [AutofillHints.password], decoration: InputDecoration(labelText: ar ? 'كلمة المرور الحالية' : 'Current password', border: const OutlineInputBorder())),
                const SizedBox(height: 12),
                TextField(controller: _acknowledgement, decoration: InputDecoration(labelText: ar ? 'التأكيد' : 'Confirmation', helperText: '${ar ? 'اكتب' : 'Type'} ${_closureMode == 'delete' ? 'DELETE' : 'CLOSE'}', border: const OutlineInputBorder())),
                const SizedBox(height: 12),
                OutlinedButton(onPressed: _busy ? null : _closeAccount, child: Text(_closureMode == 'delete' ? (ar ? 'حذف البيانات وإغلاق الحساب' : 'Delete data and close account') : (ar ? 'إغلاق الحساب' : 'Close account'))),
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
