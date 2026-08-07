import 'dart:async';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../api/challenge_config_api.dart';
import '../../api/seller_verification_api.dart';
import '../../api/session_authed_api.dart';
import '../../brand/brand.dart';
import '../../config/mobile_environment.dart';
import '../../navigation/secure_web_handoff.dart';
import '../../session/app_session.dart';
import '../../session/session_scope.dart';

typedef HostedVerificationLauncher = Future<bool> Function(Uri uri);

class SellerVerificationScreen extends StatefulWidget {
  const SellerVerificationScreen({
    super.key,
    this.verificationGateway,
    this.challengeGateway,
    this.secureWebHandoffGateway,
    this.hostedLauncher,
    this.accessToken,
  });

  final SellerVerificationGateway? verificationGateway;
  final ChallengeConfigurationGateway? challengeGateway;
  final SecureWebHandoffGateway? secureWebHandoffGateway;
  final HostedVerificationLauncher? hostedLauncher;
  final String? accessToken;

  @override
  State<SellerVerificationScreen> createState() =>
      _SellerVerificationScreenState();
}

class _SellerVerificationScreenState extends State<SellerVerificationScreen> {
  SellerVerificationGateway? _verificationGateway;
  ChallengeConfigurationGateway? _challengeGateway;
  SecureWebHandoffGateway? _secureWebHandoffGateway;
  HostedVerificationLauncher? _hostedLauncher;
  AppSession? _session;
  MobileSellerVerificationStatus? _status;
  MobileChallengeConfiguration? _challenge;
  final _countryController = TextEditingController();
  bool _initialized = false;
  bool _loading = true;
  bool _busy = false;
  String? _error;

  bool get _isArabic =>
      Localizations.localeOf(context).languageCode == 'ar';

  String get _accessToken =>
      widget.accessToken ?? _session?.access.value ?? '';

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialized) return;
    _initialized = true;

    if (widget.verificationGateway != null &&
        widget.challengeGateway != null &&
        widget.secureWebHandoffGateway != null) {
      _verificationGateway = widget.verificationGateway;
      _challengeGateway = widget.challengeGateway;
      _secureWebHandoffGateway = widget.secureWebHandoffGateway;
    } else {
      final session = SessionScope.of(context);
      final apiBaseUrl = Uri.parse(MobileEnvironment.apiBaseUrl);
      _session = session;
      _verificationGateway = widget.verificationGateway ??
          SellerVerificationApi(
            authedApi: SessionAuthedApi(
              baseUrl: apiBaseUrl,
              sessionProvider: () => session,
            ),
          );
      _challengeGateway = widget.challengeGateway ??
          ChallengeConfigurationApi(baseUrl: apiBaseUrl);
      _secureWebHandoffGateway = widget.secureWebHandoffGateway ??
          BrowserSecureWebHandoff(
            webBaseUrl: Uri.parse(MobileEnvironment.webBaseUrl),
          );
    }
    _hostedLauncher = widget.hostedLauncher ?? _launchHostedVerification;
    unawaited(_load());
  }

  @override
  void dispose() {
    _countryController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final verificationGateway = _verificationGateway;
    final challengeGateway = _challengeGateway;
    final token = _accessToken;
    if (verificationGateway == null || challengeGateway == null || token.isEmpty) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = _isArabic ? 'سجّل الدخول أولاً.' : 'Sign in first.';
        });
      }
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait<Object>([
        verificationGateway.fetchStatus(token),
        challengeGateway.fetch(),
      ]);
      if (!mounted) return;
      final status = results[0] as MobileSellerVerificationStatus;
      setState(() {
        _status = status;
        _challenge = results[1] as MobileChallengeConfiguration;
        if (_countryController.text.isEmpty) {
          _countryController.text = status.profileCountryCode ?? '';
        }
      });
    } catch (_) {
      if (mounted) {
        setState(() => _error = _isArabic
            ? 'تعذر تحميل حالة التحقق وإعدادات الأمان.'
            : 'Verification status and security settings could not be loaded.');
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _statusMessage() {
    final current = _status?.current;
    if (current == null) {
      return _isArabic ? 'لم يبدأ التحقق بعد.' : 'Verification has not been started.';
    }
    switch (current.status) {
      case 'verified':
        return _isArabic ? 'تم التحقق من البائع.' : 'Seller verification is current.';
      case 'rejected':
        return _isArabic ? 'لم تتم الموافقة على آخر تحقق.' : 'The latest verification was not approved.';
      case 'expired':
        return _isArabic
            ? 'انتهت صلاحية التحقق ويلزم إعادة التحقق.'
            : 'Verification expired and must be renewed.';
      default:
        return current.providerResult == 'pending'
            ? (_isArabic ? 'جلسة التحقق لم تكتمل.' : 'The hosted verification session is still in progress.')
            : (_isArabic ? 'ينتظر مراجعة العمليات.' : 'Awaiting operations review.');
    }
  }

  Future<void> _openSecureWeb() async {
    final gateway = _secureWebHandoffGateway;
    if (gateway == null || _busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final opened = await gateway.openSellerVerification(
        locale: Localizations.localeOf(context).languageCode,
      );
      if (!opened && mounted) {
        setState(() => _error = _isArabic
            ? 'تعذر فتح صفحة التحقق الآمنة.'
            : 'The secure verification page could not be opened.');
      }
    } catch (_) {
      if (mounted) {
        setState(() => _error = _isArabic
            ? 'تعذر فتح صفحة التحقق الآمنة.'
            : 'The secure verification page could not be opened.');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _start() async {
    final status = _status;
    final challenge = _challenge;
    final gateway = _verificationGateway;
    final token = _accessToken;
    if (status == null || challenge == null || gateway == null || token.isEmpty || _busy) {
      return;
    }

    if (challenge.enabled) {
      await _openSecureWeb();
      return;
    }

    final country = _countryController.text.trim().toUpperCase();
    if (!RegExp(r'^[A-Z]{2}$').hasMatch(country)) {
      setState(() => _error = _isArabic
          ? 'أدخل رمز دولة من حرفين.'
          : 'Enter a two-letter country code.');
      return;
    }
    if (status.eligibleLevel == 'business' &&
        (status.businessName == null || status.businessName!.trim().isEmpty)) {
      setState(() => _error = _isArabic
          ? 'أضف اسم النشاط التجاري في الملف أولاً.'
          : 'Add your business name to the profile first.');
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final session = await gateway.start(
        token,
        level: status.eligibleLevel,
        countryCode: country,
      );
      final opened = await _hostedLauncher!(session.hostedUrl);
      if (!opened && mounted) {
        setState(() => _error = _isArabic
            ? 'تعذر فتح جلسة التحقق.'
            : 'The hosted verification session could not be opened.');
      }
    } on SessionRequestException catch (error) {
      if (!mounted) return;
      setState(() {
        if (error.statusCode == 429) {
          _error = _isArabic ? 'طلبات كثيرة. حاول لاحقاً.' : 'Too many requests. Try again later.';
        } else if (error.statusCode == 503) {
          _error = _isArabic ? 'خدمة التحقق غير متاحة حالياً.' : 'Verification service is temporarily unavailable.';
        } else {
          _error = _isArabic ? 'تعذر بدء التحقق.' : 'Verification could not be started.';
        }
      });
    } catch (_) {
      if (mounted) {
        setState(() => _error = _isArabic
            ? 'تعذر بدء التحقق.'
            : 'Verification could not be started.');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ar = _isArabic;
    final status = _status;
    final current = status?.current;
    final waitingReview = current?.status == 'pending' && current?.providerResult != 'pending';
    final currentVerified = current?.status == 'verified';
    final providerEnabled = status?.providerEnabled ?? false;
    final businessIncomplete = status?.eligibleLevel == 'business' &&
        (status?.businessName == null || status!.businessName!.trim().isEmpty);
    final canStart = providerEnabled && !waitingReview && !currentVerified && !businessIncomplete;

    return Scaffold(
      appBar: AppBar(
        title: Text(ar ? 'تحقق البائع' : 'Seller verification'),
        backgroundColor: SuqnaaBrand.ivory,
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text(
            ar ? 'التحقق من البائع أو النشاط التجاري' : 'Seller or business verification',
            style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w900, color: SuqnaaBrand.blue),
          ),
          const SizedBox(height: 8),
          Text(ar
              ? 'تابع حالة التحقق وأعد التحقق عند انتهاء الصلاحية.'
              : 'Track verification status and renew it when required.'),
          const SizedBox(height: 24),
          if (_loading) const Center(child: CircularProgressIndicator()),
          if (!_loading && status != null) ...[
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(_statusMessage(), style: const TextStyle(fontWeight: FontWeight.w800)),
                    const SizedBox(height: 8),
                    Text('${ar ? 'المستوى' : 'Level'}: ${status.eligibleLevel}'),
                    if (current?.countryCode != null)
                      Text('${ar ? 'الدولة' : 'Country'}: ${current!.countryCode}'),
                    if (current?.reasonCode != null)
                      Text('${ar ? 'الحالة' : 'Status detail'}: ${current!.reasonCode}'),
                    if (current?.expiresAt != null)
                      Text('${ar ? 'تنتهي الصلاحية' : 'Expires'}: ${current!.expiresAt!.toLocal()}'),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _countryController,
              maxLength: 2,
              textCapitalization: TextCapitalization.characters,
              enabled: canStart,
              decoration: InputDecoration(
                labelText: ar ? 'رمز الدولة' : 'Country code',
                hintText: 'AU',
                helperText: ar ? 'رمز ISO من حرفين؛ لا يتم افتراض دولة.' : 'Two-letter ISO code; no country is inferred.',
                border: const OutlineInputBorder(),
              ),
            ),
            if (!providerEnabled)
              Text(ar ? 'خدمة التحقق غير مفعّلة حالياً.' : 'Seller verification is not enabled in this deployment.'),
            if (businessIncomplete)
              Text(ar ? 'أضف اسم النشاط التجاري في الملف أولاً.' : 'Add your business name to the profile first.'),
            const SizedBox(height: 12),
            FilledButton.icon(
              key: const Key('seller-verification-start-button'),
              onPressed: canStart && !_busy ? _start : null,
              icon: const Icon(Icons.verified_user_outlined),
              label: Text(
                _challenge?.enabled == true
                    ? (ar ? 'متابعة التحقق في الموقع الآمن' : 'Continue on secure verification page')
                    : current?.status == 'pending' && current?.providerResult == 'pending'
                        ? (ar ? 'متابعة جلسة التحقق' : 'Continue hosted verification')
                        : (ar ? 'بدء التحقق' : 'Start verification'),
              ),
            ),
            const SizedBox(height: 16),
            Text(
              ar
                  ? 'نتيجة خدمة التحقق لا تعتمد الحساب تلقائياً؛ الموافقة النهائية تحتاج مراجعة العمليات.'
                  : 'A verification-service result never approves the account automatically; final approval requires operations review.',
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

Future<bool> _launchHostedVerification(Uri uri) {
  if (uri.scheme != 'https' || uri.host.isEmpty || uri.userInfo.isNotEmpty) {
    return Future<bool>.value(false);
  }
  return launchUrl(uri, mode: LaunchMode.externalApplication);
}
