import 'package:flutter/material.dart';
import '../../api/auth_api.dart';
import '../../brand/brand.dart';
import '../../config/mobile_environment.dart';
import '../../session/access_state.dart';
import '../../session/session_scope.dart';

class SignInScreen extends StatefulWidget {
  const SignInScreen({super.key});

  @override
  State<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends State<SignInScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  late final AuthApi _api;

  bool _isSubmitting = false;
  bool _hidePassword = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _api = AuthApi(baseUrl: Uri.parse(MobileEnvironment.apiBaseUrl));
  }

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_isSubmitting || !_formKey.currentState!.validate()) {
      return;
    }

    setState(() {
      _isSubmitting = true;
      _error = null;
    });

    try {
      final result = await _api.login({
        'email': _emailController.text.trim().toLowerCase(),
        'password': _passwordController.text,
      });

      if (!mounted) return;

      SessionScope.of(context).establish(
        access: AccessState.fromToken(result.accessToken),
        refreshToken: result.session.refreshToken,
        userId: result.user.id,
        displayName: result.user.displayName,
      );

      Navigator.of(context).pop(true);
    } catch (_) {
      if (mounted) {
        final isArabic = Localizations.localeOf(context).languageCode == 'ar';
        setState(() {
          _error = isArabic
              ? 'تعذر تسجيل الدخول. تحقق من البريد الإلكتروني وكلمة المرور ثم حاول مرة أخرى.'
              : 'Sign in failed. Check your email and password, then try again.';
        });
      }
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isArabic = Localizations.localeOf(context).languageCode == 'ar';
    final signIn = isArabic ? 'تسجيل الدخول' : 'Sign in';
    final password = isArabic ? 'كلمة المرور' : 'Password';

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
                TextFormField(
                  controller: _emailController,
                  keyboardType: TextInputType.emailAddress,
                  textInputAction: TextInputAction.next,
                  autofillHints: const [AutofillHints.email],
                  decoration: InputDecoration(
                    labelText: isArabic ? 'البريد الإلكتروني' : 'Email',
                    prefixIcon: const Icon(Icons.email_outlined),
                    border: const OutlineInputBorder(),
                  ),
                  validator: (value) {
                    final email = value?.trim() ?? '';
                    if (email.isEmpty || !email.contains('@')) {
                      return isArabic ? 'أدخل بريداً إلكترونياً صالحاً' : 'Enter a valid email address';
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
                    labelText: password,
                    prefixIcon: const Icon(Icons.lock_outline),
                    border: const OutlineInputBorder(),
                    suffixIcon: IconButton(
                      tooltip: _hidePassword
                          ? (isArabic ? 'إظهار كلمة المرور' : 'Show password')
                          : (isArabic ? 'إخفاء كلمة المرور' : 'Hide password'),
                      onPressed: () => setState(() => _hidePassword = !_hidePassword),
                      icon: Icon(
                        _hidePassword ? Icons.visibility_outlined : Icons.visibility_off_outlined,
                      ),
                    ),
                  ),
                  validator: (value) {
                    if (value == null || value.isEmpty) {
                      return isArabic ? 'أدخل كلمة المرور' : 'Enter your password';
                    }
                    return null;
                  },
                ),
                if (_error != null) ...[
                  const SizedBox(height: 16),
                  Semantics(
                    liveRegion: true,
                    child: Text(
                      _error!,
                      style: TextStyle(color: Theme.of(context).colorScheme.error),
                    ),
                  ),
                ],
                const SizedBox(height: 24),
                FilledButton.icon(
                  onPressed: _isSubmitting ? null : _submit,
                  icon: _isSubmitting
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.login),
                  label: Text(_isSubmitting
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
