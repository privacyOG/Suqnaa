import 'package:flutter/material.dart';
import '../../api/seller_listing_api.dart';
import '../../api/session_authed_api.dart';
import '../../config/mobile_environment.dart';
import '../../session/app_session.dart';
import '../../session/session_scope.dart';

class ListingLifecycleScreen extends StatefulWidget {
  const ListingLifecycleScreen({
    super.key,
    required this.listingId,
    this.lifecycleGateway,
    this.accessToken,
  });

  final String listingId;
  final SellerListingLifecycleGateway? lifecycleGateway;
  final String? accessToken;

  @override
  State<ListingLifecycleScreen> createState() => _ListingLifecycleScreenState();
}

class _ListingLifecycleScreenState extends State<ListingLifecycleScreen> {
  SellerListingLifecycleGateway? _gateway;
  AppSession? _session;
  Map<String, dynamic>? _snapshot;
  bool _loading = true;
  bool _saving = false;
  String? _error;
  String? _notice;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (widget.lifecycleGateway != null) {
      _gateway ??= widget.lifecycleGateway;
      if (_snapshot == null && _loading) {
        _load();
      }
      return;
    }

    final session = SessionScope.of(context);
    if (identical(session, _session) && _gateway != null) {
      return;
    }
    _session = session;
    _gateway = SellerListingApi(
      authedApi: SessionAuthedApi(
        baseUrl: Uri.parse(MobileEnvironment.apiBaseUrl),
        sessionProvider: () => session,
      ),
    );
    _load();
  }

  String get _token => widget.accessToken ?? _session?.access.value ?? '';
  bool get _isArabic => Localizations.localeOf(context).languageCode == 'ar';

  Future<void> _load() async {
    final gateway = _gateway;
    final token = _token;
    if (gateway == null || token.isEmpty) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = _isArabic ? 'سجّل الدخول لإدارة الإعلان.' : 'Sign in to manage this listing.';
        });
      }
      return;
    }

    if (mounted) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }

    try {
      final response = await gateway.getLifecycle(
        token,
        listingId: widget.listingId,
      );
      if (!mounted) return;
      setState(() => _snapshot = Map<String, dynamic>.from(response));
    } catch (_) {
      if (mounted) {
        setState(() => _error = _isArabic
            ? 'تعذر تحميل دورة حياة الإعلان.'
            : 'Unable to load listing lifecycle.');
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _renew() async {
    final gateway = _gateway;
    final token = _token;
    final listing = _listing;
    if (gateway == null || token.isEmpty || listing == null || _saving) return;
    final version = listing['version'];
    if (version is! int || version <= 0) {
      setState(() => _error = _isArabic ? 'نسخة الإعلان غير صالحة.' : 'Listing version is invalid.');
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
      _notice = null;
    });

    try {
      final response = await gateway.renewLifecycle(
        token,
        listingId: widget.listingId,
        version: version,
      );
      if (!mounted) return;
      final reactivated = response['reactivated'] == true;
      setState(() => _notice = reactivated
          ? (_isArabic ? 'تمت إعادة تنشيط الإعلان.' : 'Listing reactivated.')
          : (_isArabic ? 'تم تجديد الإعلان.' : 'Listing renewed.'));
      await _load();
    } on SessionRequestException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.statusCode == 409
            ? (_isArabic
                ? 'تغيّر الإعلان أو لم يعد مؤهلاً للتجديد. أعد تحميل الحالة.'
                : 'The listing changed or is no longer eligible for renewal. Reload its status.')
            : (_isArabic ? 'تعذر تجديد الإعلان.' : 'Unable to renew the listing.');
      });
    } catch (_) {
      if (mounted) {
        setState(() => _error = _isArabic ? 'تعذر تجديد الإعلان.' : 'Unable to renew the listing.');
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Map<String, dynamic>? get _listing {
    final raw = _snapshot?['listing'];
    return raw is Map ? Map<String, dynamic>.from(raw) : null;
  }

  String _date(dynamic value) {
    if (value == null) return _isArabic ? 'غير محدد' : 'Not scheduled';
    final parsed = DateTime.tryParse(value.toString());
    if (parsed == null) return value.toString();
    return MaterialLocalizations.of(context).formatFullDate(parsed.toLocal());
  }

  @override
  Widget build(BuildContext context) {
    final listing = _listing;
    final renewable = _snapshot?['renewable'] == true;
    final status = listing?['status']?.toString() ?? '';
    final availability = listing?['availabilityStatus']?.toString() ?? '';
    final quantity = listing?['availableQuantity'];

    return Scaffold(
      appBar: AppBar(
        title: Text(_isArabic ? 'الانتهاء والتجديد' : 'Expiry and renewal'),
      ),
      body: _loading && listing == null
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(20),
              children: [
                if (_error != null)
                  MaterialBanner(
                    content: Text(_error!),
                    actions: [
                      TextButton(onPressed: _load, child: Text(_isArabic ? 'إعادة المحاولة' : 'Retry')),
                    ],
                  ),
                if (listing != null) ...[
                  Text(
                    listing['title']?.toString() ?? (_isArabic ? 'الإعلان' : 'Listing'),
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 18),
                  _LifecycleRow(label: _isArabic ? 'الحالة' : 'Status', value: status),
                  _LifecycleRow(
                    label: _isArabic ? 'المخزون' : 'Inventory',
                    value: availability == 'service_available'
                        ? (_isArabic ? 'خدمة غير محدودة بالكمية' : 'Service availability')
                        : '${quantity ?? 0}',
                  ),
                  _LifecycleRow(label: _isArabic ? 'ينتهي في' : 'Expires', value: _date(listing['expiresAt'])),
                  _LifecycleRow(
                    label: _isArabic ? 'التجديد متاح من' : 'Renewal available',
                    value: status == 'expired'
                        ? (_isArabic ? 'الآن' : 'Now')
                        : _date(_snapshot?['renewalAvailableAt']),
                  ),
                  _LifecycleRow(label: _isArabic ? 'نسخة الحالة' : 'State version', value: '${listing['version'] ?? '—'}'),
                  const SizedBox(height: 20),
                  if (_notice != null)
                    Text(_notice!, key: const Key('lifecycle-notice')),
                  if (!renewable)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Text(
                        status == 'expired' && availability == 'out_of_stock'
                            ? (_isArabic
                                ? 'أضف مخزوناً متاحاً قبل إعادة تنشيط الإعلان.'
                                : 'Add available inventory before reactivating this listing.')
                            : (_isArabic
                                ? 'التجديد غير متاح حالياً.'
                                : 'Renewal is not available yet.'),
                      ),
                    ),
                  FilledButton.icon(
                    key: const Key('renew-listing-lifecycle'),
                    onPressed: renewable && !_saving ? _renew : null,
                    icon: const Icon(Icons.refresh_outlined),
                    label: Text(
                      _saving
                          ? (_isArabic ? 'جارٍ الحفظ…' : 'Saving…')
                          : status == 'expired'
                              ? (_isArabic ? 'إعادة تنشيط' : 'Reactivate listing')
                              : (_isArabic ? 'تجديد الإعلان' : 'Renew listing'),
                    ),
                  ),
                  const SizedBox(height: 8),
                  OutlinedButton.icon(
                    onPressed: _saving ? null : _load,
                    icon: const Icon(Icons.sync_outlined),
                    label: Text(_isArabic ? 'إعادة تحميل الحالة' : 'Reload status'),
                  ),
                ],
              ],
            ),
    );
  }
}

class _LifecycleRow extends StatelessWidget {
  const _LifecycleRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 150,
            child: Text(label, style: const TextStyle(fontWeight: FontWeight.w700)),
          ),
          Expanded(child: Text(value)),
        ],
      ),
    );
  }
}
