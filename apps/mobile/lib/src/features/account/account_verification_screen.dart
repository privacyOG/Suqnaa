import 'package:flutter/material.dart';
import '../../api/account_verification_api.dart';
import '../../api/session_authed_api.dart';
import '../../brand/brand.dart';
import '../../config/mobile_environment.dart';
import '../../session/session_scope.dart';

class AccountVerificationScreen extends StatefulWidget {
  const AccountVerificationScreen({super.key});

  @override
  State<AccountVerificationScreen> createState() => _AccountVerificationScreenState();
}

class _AccountVerificationScreenState extends State<AccountVerificationScreen> {
  final _codeController = TextEditingController();
  AccountVerificationApi? _api;
  AccountVerificationState? _state;
  VerificationChannel _selected = VerificationChannel.email;
  bool _loading = true;
  bool _busy = false;
  String? _error;
  String? _success;
  DateTime? _expiresAt;

  bool get _isArabic => Localizations.localeOf(context).languageCode == 'ar';

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _api ??= AccountVerificationApi(
      api: SessionAuthedApi(
        baseUrl: Uri.parse(MobileEnvironment.apiBaseUrl),
        sessionProvider: () => SessionScope.of(context),
      ),
    );
    if (_state == null && _loading) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _load());
    }
  }

  @override
  void dispose() {
    _codeController.dispose();
    super.dispose();
  }

  String _channelLabel(VerificationChannel channel) {
    if (channel == VerificationChannel.email) {
      return _isArabic ? 'البريد الإلكتروني' : 'Email';
    }
    return _isArabic ? 'رقم الهاتف' : 'Phone';
  }

  String _failureMessage(Object error) {
    if (error is SessionRequestException) {
      if (error.statusCode == 401) {
        return _isArabic
            ? 'انتهت جلسة الحساب. سجّل الدخول مرة أخرى.'
            : 'Your account session ended. Sign in again.';
      }
      if (error.statusCode == 429) {
        return _isArabic
            ? 'طلبات كثيرة. حاول مرة أخرى لاحقاً.'
            : 'Too many requests. Try again later.';
      }
      if (error.statusCode == 410) {
        return _isArabic
            ? 'انتهت صلاحية الرمز. اطلب رمزاً جديداً.'
            : 'That code expired. Request a new code.';
      }
      if (error.statusCode == 503) {
        return _isArabic
            ? 'خدمة إرسال الرمز غير متاحة مؤقتاً.'
            : 'Code delivery is temporarily unavailable.';
      }
      if (error.statusCode == 400) {
        return _isArabic
            ? 'الرمز غير صحيح أو تم استنفاد المحاولات.'
            : 'The code is incorrect or its attempts are exhausted.';
      }
    }

    return _isArabic
        ? 'تعذر إكمال التحقق حالياً.'
        : 'Verification could not be completed right now.';
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
      final next = await api.load(session.access.value);
      if (!mounted) return;
      final unverified = next.channels.where(
        (item) => item.available && !item.isVerified,
      );
      setState(() {
        _state = next;
        if (unverified.isNotEmpty) {
          _selected = unverified.first.channel;
        }
        _error = null;
      });
    } catch (error) {
      if (mounted) {
        setState(() => _error = _failureMessage(error));
      }
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _requestCode(VerificationChannel channel) async {
    if (_busy || _api == null) return;
    final session = SessionScope.of(context);
    setState(() {
      _busy = true;
      _selected = channel;
      _error = null;
      _success = null;
      _expiresAt = null;
      _codeController.clear();
    });

    try {
      final result = await _api!.requestCode(session.access.value, channel);
      if (!mounted) return;
      setState(() {
        _expiresAt = result.expiresAt;
        _success = _isArabic
            ? 'تم إرسال رمز من 6 أرقام إلى ${_channelLabel(channel)} المسجل.'
            : 'A 6-digit code was sent to your registered ${_channelLabel(channel).toLowerCase()}.';
      });
    } catch (error) {
      if (mounted) {
        setState(() => _error = _failureMessage(error));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _confirmCode() async {
    final code = _codeController.text.trim();
    if (_busy || _api == null || !RegExp(r'^\d{6}$').hasMatch(code)) return;
    final session = SessionScope.of(context);
    setState(() {
      _busy = true;
      _error = null;
      _success = null;
    });

    try {
      await _api!.confirmCode(session.access.value, _selected, code);
      await session.ensureFreshAccess(force: true);
      if (!mounted) return;
      _codeController.clear();
      setState(() {
        _expiresAt = null;
        _success = _isArabic
            ? 'تم التحقق من ${_channelLabel(_selected)} بنجاح.'
            : '${_channelLabel(_selected)} verified successfully.';
      });
      await _load();
    } catch (error) {
      if (mounted) {
        setState(() => _error = _failureMessage(error));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_isArabic ? 'التحقق من الحساب' : 'Account verification'),
        backgroundColor: SuqnaaBrand.ivory,
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(20),
              children: [
                Text(
                  _isArabic ? 'تحقق من وسيلة الاتصال' : 'Verify your contact details',
                  style: const TextStyle(
                    fontSize: 28,
                    fontWeight: FontWeight.w900,
                    color: SuqnaaBrand.blue,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  _isArabic
                      ? 'الرمز صالح لمدة 10 دقائق ويُستخدم مرة واحدة فقط.'
                      : 'Each code is valid for 10 minutes and can be used only once.',
                ),
                const SizedBox(height: 20),
                if (_state != null)
                  ..._state!.channels.map((item) => Card(
                        child: ListTile(
                          leading: Icon(
                            item.channel == VerificationChannel.email
                                ? Icons.email_outlined
                                : Icons.phone_outlined,
                            color: SuqnaaBrand.blue,
                          ),
                          title: Text(_channelLabel(item.channel)),
                          subtitle: Text(
                            !item.available
                                ? (_isArabic ? 'غير مضاف إلى الحساب' : 'Not added to this account')
                                : item.isVerified
                                    ? (_isArabic
                                        ? 'تم التحقق: ${item.destination}'
                                        : 'Verified: ${item.destination}')
                                    : (_isArabic
                                        ? 'بانتظار التحقق: ${item.destination}'
                                        : 'Verification required: ${item.destination}'),
                          ),
                          trailing: item.isVerified
                              ? const Icon(Icons.verified, color: Colors.green)
                              : item.available
                                  ? TextButton(
                                      onPressed: _busy
                                          ? null
                                          : () => _requestCode(item.channel),
                                      child: Text(_isArabic ? 'إرسال رمز' : 'Send code'),
                                    )
                                  : null,
                        ),
                      )),
                const SizedBox(height: 16),
                if ((_state?.channels.any((item) => item.available && !item.isVerified) ?? false)) ...[
                  TextField(
                    controller: _codeController,
                    keyboardType: TextInputType.number,
                    textInputAction: TextInputAction.done,
                    autofillHints: const [AutofillHints.oneTimeCode],
                    maxLength: 6,
                    onSubmitted: (_) => _confirmCode(),
                    decoration: InputDecoration(
                      labelText: _isArabic ? 'رمز التحقق' : 'Verification code',
                      hintText: '000000',
                      prefixIcon: const Icon(Icons.password_outlined),
                      border: const OutlineInputBorder(),
                    ),
                  ),
                  if (_expiresAt != null)
                    Text(
                      _isArabic
                          ? 'استخدم أحدث رمز تم إرساله فقط.'
                          : 'Use only the most recently sent code.',
                    ),
                  const SizedBox(height: 12),
                  FilledButton.icon(
                    onPressed: _busy ? null : _confirmCode,
                    icon: const Icon(Icons.verified_user_outlined),
                    label: Text(_busy
                        ? (_isArabic ? 'جارٍ التحقق…' : 'Verifying…')
                        : (_isArabic ? 'تأكيد الرمز' : 'Confirm code')),
                  ),
                ],
                if (_success != null) ...[
                  const SizedBox(height: 16),
                  Text(_success!, style: const TextStyle(color: Colors.green)),
                ],
                if (_error != null) ...[
                  const SizedBox(height: 16),
                  Text(
                    _error!,
                    style: TextStyle(color: Theme.of(context).colorScheme.error),
                  ),
                ],
              ],
            ),
    );
  }
}
