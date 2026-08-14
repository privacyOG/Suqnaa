import 'package:flutter/material.dart';
import '../../api/auth_api.dart';
import '../../brand/brand.dart';
import '../../config/mobile_environment.dart';
import '../../session/access_state.dart';
import '../../session/session_scope.dart';
import 'password_recovery_screen.dart';

class AccountLoginScreen extends StatefulWidget {
  const AccountLoginScreen({super.key});

  @override
  State<AccountLoginScreen> createState() => _AccountLoginScreenState();
}

class _AccountLoginScreenState extends State<AccountLoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _contactController = TextEditingController();
  final _passwordController = TextEditingController();
  late final AuthApi _api;

  String _contactMode = 'email';
  bool _submitting = false;
  bool _hidePassword = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _api = AuthApi(baseUrl: Uri.parse(MobileEnvironment.apiBaseUrl));
  }

  @override
  void dispose() {
    _contactController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_submitting || !_formKey.currentState!.validate()) return;

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      final contact = _contactController.text.trim();
      final result = await _api.login({
        if (_contactMode == 'email') 'email': contact.toLowerCase(),
        if (_contactMode == 'phone') 'phone': contact,
        'password': _passwordController.text,
      });

      if (!mounted) return;

      await SessionScope.of(context).establish(
        access: AccessState.fromToken(result.accessToken),
        refreshToken: result.session.refreshToken,
        userId: result.user.id,
        displayName: result.user.displayName,
      );

      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (_) {
      if (mounted) {
        final isArabic = Localizations.localeOf(context).languageCode == 'ar';
        setState(() {
          _error = isArabic
              ? 'تعذر تسجيل الدخول. تحقق من بيانات الاتصال وكلمة المرور ثم حاول مرة أخرى.'
              : 'Sign in failed. Check your contact details and password, then try again.';
        });
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isArabic = Localizations.localeOf(context).languageCode == 'ar';
    final phoneMode = _contactMode == 'phone';
    final signIn = isArabic ? 'تسجيل الدخول' : 'Sign in';

    return Scaffold(
      appBar: AppBar(
        title: Text(signIn),
        backgroundColor: SuqnaaBrand.ivory,
      ),
      body: SafeArea(
        child: AutofillGroup(
          child: Form(
            key: _formKey,
            child: ListView(
              padding: const EdgeInsets.all(24),
              children: [
                Text(
                  isArabic ? 'مرحباً بعودتك' : 'Welcome back',
                  style: const TextStyle(
                    fontSize: 30,
                    fontWeight: FontWeight.w900,
                    color: SuqnaaBrand.blue,
                  ),
                ),
                const SizedBox(height: 8),
                Text(isArabic
                    ? 'سجّل الدخول للوصول إلى إعلاناتك وحسابك ورسائلك.'
                    : 'Sign in to access your listings, account, and messages.'),
                const SizedBox(height: 28),
                DropdownButtonFormField<String>(
                  initialValue: _contactMode,
                  decoration: InputDecoration(
                    labelText: isArabic ? 'تسجيل الدخول باستخدام' : 'Sign in with',
                    prefixIcon: const Icon(Icons.contact_phone_outlined),
                    border: const OutlineInputBorder(),
                  ),
                  items: [
                    DropdownMenuItem(value: 'email', child: Text(isArabic ? 'البريد الإلكتروني' : 'Email')),
                    DropdownMenuItem(value: 'phone', child: Text(isArabic ? 'الهاتف' : 'Phone')),
                  ],
                  onChanged: (value) {
                    if (value == null) return;
                    setState(() {
                      _contactMode = value;
                      _contactController.clear();
                      _error = null;
                    });
                  },
                ),
                const SizedBox(height: 16),
                TextFormField(
                  key: ValueKey(_contactMode),
                  controller: _contactController,
                  keyboardType: phoneMode ? TextInputType.phone : TextInputType.emailAddress,
                  textInputAction: TextInputAction.next,
                  autofillHints: [phoneMode ? AutofillHints.telephoneNumber : AutofillHints.email],
                  decoration: InputDecoration(
                    labelText: phoneMode
                        ? (isArabic ? 'رقم الهاتف الدولي' : 'International phone number')
                        : (isArabic ? 'البريد الإلكتروني' : 'Email'),
                    helperText: phoneMode
                        ? (isArabic
                            ? 'استخدم + ورمز الدولة، مثال: +61412345678'
                            : 'Use + and the country code, for example +61412345678')
                        : null,
                    prefixIcon: Icon(phoneMode ? Icons.phone_outlined : Icons.email_outlined),
                    border: const OutlineInputBorder(),
                  ),
                  validator: (value) {
                    final contact = value?.trim() ?? '';
                    if (!phoneMode) {
                      if (contact.isEmpty || !contact.contains('@')) {
                        return isArabic ? 'أدخل بريداً إلكترونياً صالحاً' : 'Enter a valid email address';
                      }
                      return null;
                    }
                    if (!(contact.startsWith('+') || contact.startsWith('00'))) {
                      return isArabic
                          ? 'استخدم الصيغة الدولية مع + ورمز الدولة'
                          : 'Use international format with + and country code';
                    }
                    if (contact.length < 8) {
                      return isArabic ? 'أدخل رقم هاتف دولياً صالحاً' : 'Enter a valid international phone number';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _passwordController,
                  obscureText: _hidePassword,
                  textInputAction: TextInputAction.done,
                  autofillHints: const [AutofillHints.password],
                  onFieldSubmitted: (_) => _submit(),
                  decoration: InputDecoration(
                    labelText: isArabic ? 'كلمة المرور' : 'Password',
                    prefixIcon: const Icon(Icons.lock_outline),
                    border: const OutlineInputBorder(),
                    suffixIcon: IconButton(
                      tooltip: _hidePassword
                          ? (isArabic ? 'إظهار كلمة المرور' : 'Show password')
                          : (isArabic ? 'إخفاء كلمة المرور' : 'Hide password'),
                      onPressed: () => setState(() => _hidePassword = !_hidePassword),
                      icon: Icon(_hidePassword ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                    ),
                  ),
                  validator: (value) => value == null || value.isEmpty
                      ? (isArabic ? 'أدخل كلمة المرور' : 'Enter your password')
                      : null,
                ),
                Align(
                  alignment: AlignmentDirectional.centerEnd,
                  child: TextButton(
                    onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute(builder: (_) => const PasswordRecoveryScreen()),
                    ),
                    child: Text(isArabic ? 'نسيت كلمة المرور؟' : 'Forgot your password?'),
                  ),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 16),
                  Semantics(
                    liveRegion: true,
                    child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                  ),
                ],
                const SizedBox(height: 16),
                FilledButton.icon(
                  onPressed: _submitting ? null : _submit,
                  icon: _submitting
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.login),
                  label: Text(_submitting
                      ? (isArabic ? 'جارٍ تسجيل الدخول...' : 'Signing in...')
                      : signIn),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
