import 'package:flutter/material.dart';
import '../../api/auth_api.dart';
import '../../brand/brand.dart';
import '../../config/mobile_environment.dart';
import '../../session/access_state.dart';
import '../../session/session_scope.dart';
import 'account_verification_screen.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _contactController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmController = TextEditingController();
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
    _nameController.dispose();
    _contactController.dispose();
    _passwordController.dispose();
    _confirmController.dispose();
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
      final result = await _api.register({
        'displayName': _nameController.text.trim(),
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
      await Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const AccountVerificationScreen()),
      );
    } catch (_) {
      if (mounted) {
        final isArabic = Localizations.localeOf(context).languageCode == 'ar';
        setState(() {
          _error = isArabic
              ? 'تعذر إنشاء الحساب. قد تكون بيانات الاتصال مسجلة مسبقاً أو قد تكون صيغة الهاتف غير صالحة.'
              : 'Account creation failed. The contact detail may already be registered or the phone format may be invalid.';
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
    final createAccount = isArabic ? 'إنشاء حساب' : 'Create account';

    return Scaffold(
      appBar: AppBar(
        title: Text(createAccount),
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
                  isArabic ? 'انضم إلى سوقنا' : 'Join Suqnaa',
                  style: const TextStyle(
                    fontSize: 30,
                    fontWeight: FontWeight.w900,
                    color: SuqnaaBrand.blue,
                  ),
                ),
                const SizedBox(height: 8),
                Text(isArabic
                    ? 'أنشئ حسابك في السوق للشراء والبيع والمراسلة بأمان.'
                    : 'Create your marketplace account to buy, sell, and message securely.'),
                const SizedBox(height: 28),
                TextFormField(
                  controller: _nameController,
                  textInputAction: TextInputAction.next,
                  autofillHints: const [AutofillHints.name],
                  decoration: InputDecoration(
                    labelText: isArabic ? 'اسم العرض' : 'Display name',
                    prefixIcon: const Icon(Icons.person_outline),
                    border: const OutlineInputBorder(),
                  ),
                  validator: (value) {
                    final name = value?.trim() ?? '';
                    if (name.length < 2) {
                      return isArabic ? 'أدخل حرفين على الأقل' : 'Enter at least 2 characters';
                    }
                    if (name.length > 80) {
                      return isArabic ? 'اسم العرض طويل جداً' : 'Display name is too long';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 16),
                DropdownButtonFormField<String>(
                  initialValue: _contactMode,
                  decoration: InputDecoration(
                    labelText: isArabic ? 'طريقة الاتصال' : 'Contact method',
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
                  textInputAction: TextInputAction.next,
                  autofillHints: const [AutofillHints.newPassword],
                  decoration: InputDecoration(
                    labelText: isArabic ? 'كلمة المرور' : 'Password',
                    helperText: isArabic ? 'استخدم 10 أحرف على الأقل' : 'Use at least 10 characters',
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
                  validator: (value) => value == null || value.length < 10
                      ? (isArabic ? 'يجب أن تتكون كلمة المرور من 10 أحرف على الأقل' : 'Password must contain at least 10 characters')
                      : null,
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _confirmController,
                  obscureText: _hidePassword,
                  textInputAction: TextInputAction.done,
                  autofillHints: const [AutofillHints.newPassword],
                  onFieldSubmitted: (_) => _submit(),
                  decoration: InputDecoration(
                    labelText: isArabic ? 'تأكيد كلمة المرور' : 'Confirm password',
                    prefixIcon: const Icon(Icons.lock_reset_outlined),
                    border: const OutlineInputBorder(),
                  ),
                  validator: (value) => value != _passwordController.text
                      ? (isArabic ? 'كلمتا المرور غير متطابقتين' : 'Passwords do not match')
                      : null,
                ),
                if (_error != null) ...[
                  const SizedBox(height: 16),
                  Semantics(
                    liveRegion: true,
                    child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                  ),
                ],
                const SizedBox(height: 24),
                FilledButton.icon(
                  onPressed: _submitting ? null : _submit,
                  icon: _submitting
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.person_add_alt_1),
                  label: Text(_submitting
                      ? (isArabic ? 'جارٍ إنشاء الحساب...' : 'Creating account...')
                      : createAccount),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
