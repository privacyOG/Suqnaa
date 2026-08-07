import 'package:flutter/material.dart';
import '../../api/password_security_api.dart';
import '../../brand/brand.dart';
import '../../config/mobile_environment.dart';
import '../../navigation/secure_web_handoff.dart';

class PasswordRecoveryScreen extends StatefulWidget {
  const PasswordRecoveryScreen({
    super.key,
    this.api,
    this.handoff,
  });

  final PasswordSecurityApi? api;
  final SecureWebHandoffGateway? handoff;

  @override
  State<PasswordRecoveryScreen> createState() => _PasswordRecoveryScreenState();
}

class _PasswordRecoveryScreenState extends State<PasswordRecoveryScreen> {
  final _contactController = TextEditingController();
  final _tokenController = TextEditingController();
  final _newPasswordController = TextEditingController();
  final _confirmController = TextEditingController();
  late final PasswordSecurityApi _api;
  SecureWebHandoffGateway? _handoff;
  String _contactMode = 'email';
  bool _busy = false;
  bool _requestAccepted = false;
  bool _resetComplete = false;
  bool _requiresWebCheck = false;
  String? _error;

  bool get _isArabic => Localizations.localeOf(context).languageCode == 'ar';

  @override
  void initState() {
    super.initState();
    _api = widget.api ?? PasswordSecurityApi(
      baseUrl: Uri.parse(MobileEnvironment.apiBaseUrl),
    );
    _handoff = widget.handoff;
    if (_handoff == null) {
      try {
        _handoff = BrowserSecureWebHandoff(
          webBaseUrl: Uri.parse(MobileEnvironment.webBaseUrl),
        );
      } catch (_) {
        _handoff = null;
      }
    }
  }

  @override
  void dispose() {
    _contactController.dispose();
    _tokenController.dispose();
    _newPasswordController.dispose();
    _confirmController.dispose();
    super.dispose();
  }

  Future<void> _requestReset() async {
    final contact = _contactController.text.trim();
    final phoneMode = _contactMode == 'phone';
    final valid = phoneMode
        ? (contact.startsWith('+') || contact.startsWith('00')) && contact.length >= 8
        : contact.isNotEmpty && contact.contains('@');
    if (_busy || !valid) {
      setState(() {
        _error = phoneMode
            ? (_isArabic ? 'استخدم الصيغة الدولية مع + ورمز الدولة.' : 'Use international format with + and country code.')
            : (_isArabic ? 'أدخل بريداً إلكترونياً صالحاً.' : 'Enter a valid email address.');
      });
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
      _requiresWebCheck = false;
    });
    try {
      if (phoneMode) {
        await _api.requestPhonePasswordReset(contact);
      } else {
        await _api.requestPasswordReset(contact.toLowerCase());
      }
      if (!mounted) return;
      setState(() => _requestAccepted = true);
    } on PasswordRecoveryException catch (error) {
      if (!mounted) return;
      setState(() {
        _requiresWebCheck = error.statusCode == 403;
        _error = error.statusCode == 429
            ? (_isArabic ? 'طلبات كثيرة. حاول لاحقاً.' : 'Too many requests. Try again later.')
            : error.statusCode == 403
                ? (_isArabic ? 'يتطلب طلب الاستعادة فحص الأمان في الموقع الآمن.' : 'Recovery requires the security check on the secure website.')
                : error.statusCode == 400 && phoneMode
                    ? (_isArabic ? 'رقم الهاتف ليس بصيغة دولية صالحة.' : 'The phone number is not valid international format.')
                    : (_isArabic ? 'تعذر إرسال طلب الاستعادة.' : 'The recovery request could not be submitted.');
      });
    } catch (_) {
      if (mounted) {
        setState(() => _error = _isArabic ? 'تعذر إرسال طلب الاستعادة.' : 'The recovery request could not be submitted.');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _openSecureRecovery() async {
    final handoff = _handoff;
    if (handoff == null) return;
    final opened = await handoff.openPasswordRecovery(
      locale: Localizations.localeOf(context).languageCode,
    );
    if (!opened && mounted) {
      setState(() => _error = _isArabic ? 'تعذر فتح الموقع الآمن.' : 'Unable to open the secure website.');
    }
  }

  Future<void> _resetPassword() async {
    final token = _tokenController.text.trim();
    final password = _newPasswordController.text;
    if (_busy || token.length < 40 || password.length < 10) return;
    if (password != _confirmController.text) {
      setState(() => _error = _isArabic ? 'كلمتا المرور غير متطابقتين.' : 'The passwords do not match.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await _api.resetPassword(token, password);
      if (!mounted) return;
      setState(() => _resetComplete = true);
    } on PasswordRecoveryException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.statusCode == 409
            ? (_isArabic ? 'اختر كلمة مرور مختلفة.' : 'Choose a different password.')
            : error.statusCode == 429
                ? (_isArabic ? 'محاولات كثيرة. حاول لاحقاً.' : 'Too many attempts. Try again later.')
                : (_isArabic ? 'رمز إعادة التعيين غير صالح أو انتهت صلاحيته.' : 'The reset token is invalid or expired.');
      });
    } catch (_) {
      if (mounted) {
        setState(() => _error = _isArabic ? 'تعذر تغيير كلمة المرور.' : 'The password could not be reset.');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ar = _isArabic;
    final phoneMode = _contactMode == 'phone';
    return Scaffold(
      appBar: AppBar(
        title: Text(ar ? 'استعادة الحساب' : 'Account recovery'),
        backgroundColor: SuqnaaBrand.ivory,
      ),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          Text(
            ar ? 'إعادة تعيين كلمة المرور' : 'Reset your password',
            style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w900, color: SuqnaaBrand.blue),
          ),
          const SizedBox(height: 8),
          Text(ar
              ? 'لن نؤكد ما إذا كانت وسيلة الاتصال مرتبطة بحساب.'
              : 'We never confirm whether a contact detail is linked to an account.'),
          const SizedBox(height: 24),
          DropdownButtonFormField<String>(
            initialValue: _contactMode,
            decoration: InputDecoration(
              labelText: ar ? 'طريقة الاستعادة' : 'Recovery method',
              border: const OutlineInputBorder(),
            ),
            items: [
              DropdownMenuItem(value: 'email', child: Text(ar ? 'البريد الإلكتروني' : 'Email')),
              DropdownMenuItem(value: 'phone', child: Text(ar ? 'رقم الهاتف' : 'Phone')),
            ],
            onChanged: (value) {
              if (value == null) return;
              setState(() {
                _contactMode = value;
                _contactController.clear();
                _requestAccepted = false;
                _error = null;
              });
            },
          ),
          const SizedBox(height: 12),
          TextField(
            key: ValueKey(_contactMode),
            controller: _contactController,
            keyboardType: phoneMode ? TextInputType.phone : TextInputType.emailAddress,
            autofillHints: [phoneMode ? AutofillHints.telephoneNumber : AutofillHints.email],
            decoration: InputDecoration(
              labelText: phoneMode
                  ? (ar ? 'رقم الهاتف الدولي' : 'International phone number')
                  : (ar ? 'البريد الإلكتروني' : 'Email'),
              helperText: phoneMode ? (ar ? 'استخدم + ورمز الدولة.' : 'Use + and the country code.') : null,
              border: const OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: _busy ? null : _requestReset,
            child: Text(ar ? 'إرسال تعليمات الاستعادة' : 'Send recovery instructions'),
          ),
          if (_requestAccepted) ...[
            const SizedBox(height: 12),
            Text(
              ar
                  ? 'إذا كان الحساب موجوداً فسيتم إرسال تعليمات إعادة التعيين.'
                  : 'If the account exists, reset instructions will be delivered.',
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
          ],
          if (_requiresWebCheck && _handoff != null) ...[
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: _busy ? null : _openSecureRecovery,
              icon: const Icon(Icons.open_in_browser),
              label: Text(ar ? 'فتح الاستعادة الآمنة' : 'Open secure recovery'),
            ),
          ],
          const Divider(height: 40),
          Text(
            ar ? 'هل لديك رمز إعادة التعيين؟' : 'Have a reset token?',
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _tokenController,
            autocorrect: false,
            enableSuggestions: false,
            autofillHints: const [AutofillHints.oneTimeCode],
            decoration: InputDecoration(
              labelText: ar ? 'رمز إعادة التعيين' : 'Reset token',
              border: const OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _newPasswordController,
            obscureText: true,
            autofillHints: const [AutofillHints.newPassword],
            decoration: InputDecoration(
              labelText: ar ? 'كلمة المرور الجديدة' : 'New password',
              helperText: ar ? '10 أحرف على الأقل' : 'At least 10 characters',
              border: const OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _confirmController,
            obscureText: true,
            autofillHints: const [AutofillHints.newPassword],
            decoration: InputDecoration(
              labelText: ar ? 'تأكيد كلمة المرور' : 'Confirm password',
              border: const OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: _busy ? null : _resetPassword,
            child: Text(ar ? 'تغيير كلمة المرور' : 'Reset password'),
          ),
          if (_resetComplete) ...[
            const SizedBox(height: 12),
            Text(
              ar
                  ? 'تم تغيير كلمة المرور وإلغاء جميع الجلسات الحالية. يمكنك تسجيل الدخول الآن.'
                  : 'Password changed. All existing sessions were revoked; you can sign in now.',
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
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
