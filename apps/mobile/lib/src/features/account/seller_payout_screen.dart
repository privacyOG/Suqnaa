import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../api/seller_payout_api.dart';
import '../../api/session_authed_api.dart';
import '../../brand/brand.dart';
import '../../config/mobile_environment.dart';
import '../../session/session_scope.dart';

class SellerPayoutScreen extends StatefulWidget {
  const SellerPayoutScreen({super.key});

  @override
  State<SellerPayoutScreen> createState() => _SellerPayoutScreenState();
}

class _SellerPayoutScreenState extends State<SellerPayoutScreen> {
  MobileSellerPayoutStatus? _status;
  bool _loading = true;
  bool _busy = false;
  String? _error;

  SellerPayoutApi _api() {
    final session = SessionScope.of(context);
    return SellerPayoutApi(
      authedApi: SessionAuthedApi(
        baseUrl: Uri.parse(MobileEnvironment.apiBaseUrl),
        sessionProvider: () => session,
      ),
    );
  }

  String get _token => SessionScope.of(context).access.value;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_loading) _load();
  }

  Future<void> _load() async {
    try {
      final status = await _api().fetchStatus(_token);
      if (mounted) setState(() { _status = status; _loading = false; _error = null; });
    } catch (_) {
      if (mounted) setState(() { _loading = false; _error = 'Payout status could not be loaded.'; });
    }
  }

  Future<void> _onboard() async {
    if (_busy) return;
    setState(() { _busy = true; _error = null; });
    try {
      final locale = Localizations.localeOf(context).languageCode;
      final session = await _api().beginOnboarding(_token, locale);
      final opened = await launchUrl(session.hostedUrl, mode: LaunchMode.externalApplication);
      if (!opened) throw StateError('Could not open hosted onboarding');
    } catch (_) {
      if (mounted) setState(() { _error = 'Payout onboarding could not be opened.'; });
    } finally {
      if (mounted) setState(() { _busy = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final isArabic = Localizations.localeOf(context).languageCode == 'ar';
    return Scaffold(
      appBar: AppBar(
        title: Text(isArabic ? 'تسويات ودفعات البائع' : 'Seller settlements and payouts'),
        backgroundColor: SuqnaaBrand.ivory,
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          if (_loading) const Center(child: CircularProgressIndicator()),
          if (!_loading && _status != null) ...[
            Text(
              _status!.onboardingStatus == null
                  ? (isArabic ? 'لم يتم إعداد حساب دفعات بعد.' : 'No payout account is set up yet.')
                  : '${isArabic ? 'الحالة' : 'Status'}: ${_status!.onboardingStatus}',
              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: SuqnaaBrand.blue),
            ),
            const SizedBox(height: 12),
            Text('${isArabic ? 'التحويلات' : 'Transfers'}: ${_status!.transfersEnabled ? 'Ready' : 'Not ready'}'),
            Text('${isArabic ? 'الدفعات' : 'Payouts'}: ${_status!.payoutsEnabled ? 'Ready' : 'Not ready'}'),
            Text('${isArabic ? 'متطلبات معلقة' : 'Outstanding requirements'}: ${_status!.requirementsDue}'),
            if (_status!.disabledReason != null) Text(_status!.disabledReason!, style: const TextStyle(color: Colors.red)),
            const SizedBox(height: 20),
            FilledButton.icon(
              key: const Key('seller-payout-onboarding-button'),
              onPressed: !_status!.enabled || _busy ? null : _onboard,
              icon: const Icon(Icons.open_in_browser),
              label: Text(_busy
                  ? (isArabic ? 'جارٍ الفتح…' : 'Opening…')
                  : (isArabic ? 'إعداد أو متابعة الدفعات' : 'Set up or continue payouts')),
            ),
            const SizedBox(height: 12),
            Text(isArabic
                ? 'تفتح خطوات الهوية والبيانات البنكية في متصفح خارجي لدى مزود الدفع ولا تُخزن في سوقنا.'
                : 'Identity and banking steps open in the payment provider’s external browser flow and are not stored by Suqnaa.'),
          ],
          if (_error != null) Padding(
            padding: const EdgeInsets.only(top: 16),
            child: Text(_error!, style: const TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
  }
}
