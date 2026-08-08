import 'dart:async';
import 'package:flutter/material.dart';
import '../../api/challenge_config_api.dart';
import '../../api/seller_listing_api.dart';
import '../../api/session_authed_api.dart';
import '../../brand/brand.dart';
import '../../config/mobile_environment.dart';
import '../../navigation/secure_web_handoff.dart';
import '../../session/app_session.dart';
import '../../session/session_scope.dart';

class ListingLocationScreen extends StatefulWidget {
  const ListingLocationScreen({
    super.key,
    required this.listingId,
    this.locationGateway,
    this.challengeGateway,
    this.secureWebHandoffGateway,
    this.accessToken,
  });

  final String listingId;
  final SellerListingLocationGateway? locationGateway;
  final ChallengeConfigurationGateway? challengeGateway;
  final SecureListingEditWebHandoffGateway? secureWebHandoffGateway;
  final String? accessToken;

  @override
  State<ListingLocationScreen> createState() => _ListingLocationScreenState();
}

class _ListingLocationScreenState extends State<ListingLocationScreen> {
  final _latitudeController = TextEditingController();
  final _longitudeController = TextEditingController();
  SellerListingLocationGateway? _locationGateway;
  ChallengeConfigurationGateway? _challengeGateway;
  SecureListingEditWebHandoffGateway? _handoff;
  AppSession? _session;
  MobileChallengeConfiguration? _configuration;
  bool _initialized = false;
  bool _loading = false;
  bool _saving = false;
  bool _openingWeb = false;
  bool _editable = false;
  int? _version;
  String? _status;
  String? _error;

  bool get _isArabic => Localizations.localeOf(context).languageCode == 'ar';
  String get _accessToken => widget.accessToken ?? _session?.access.value ?? '';
  bool get _webVerificationRequired => _configuration?.enabled == true;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialized) return;
    _initialized = true;

    if (widget.locationGateway != null &&
        widget.challengeGateway != null &&
        widget.secureWebHandoffGateway != null) {
      _locationGateway = widget.locationGateway;
      _challengeGateway = widget.challengeGateway;
      _handoff = widget.secureWebHandoffGateway;
    } else {
      final session = SessionScope.of(context);
      final apiBaseUrl = Uri.parse(MobileEnvironment.apiBaseUrl);
      final authed = SessionAuthedApi(
        baseUrl: apiBaseUrl,
        sessionProvider: () => session,
      );
      _session = session;
      _locationGateway = widget.locationGateway ?? SellerListingApi(authedApi: authed);
      _challengeGateway = widget.challengeGateway ?? ChallengeConfigurationApi(baseUrl: apiBaseUrl);
      _handoff = widget.secureWebHandoffGateway ??
          BrowserSecureWebHandoff(webBaseUrl: Uri.parse(MobileEnvironment.webBaseUrl));
    }
    unawaited(_reload());
  }

  @override
  void dispose() {
    _latitudeController.dispose();
    _longitudeController.dispose();
    super.dispose();
  }

  Future<void> _reload() async {
    final gateway = _locationGateway;
    final challenge = _challengeGateway;
    final token = _accessToken;
    if (gateway == null || challenge == null || token.isEmpty || _loading) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait<Object>([
        gateway.getLocation(token, listingId: widget.listingId),
        challenge.fetch(),
      ]);
      final payload = Map<String, dynamic>.from(results[0] as Map);
      final raw = payload['listing'];
      if (raw is! Map) throw const FormatException('Invalid location response');
      final listing = Map<String, dynamic>.from(raw);
      final version = listing['version'];
      final status = listing['status'];
      final editable = listing['editable'];
      final rawLocation = listing['approximateLocation'];
      double? latitude;
      double? longitude;
      if (rawLocation != null) {
        if (rawLocation is! Map) throw const FormatException('Invalid approximate location');
        latitude = _coordinate(rawLocation['latitude'], -90, 90);
        longitude = _coordinate(rawLocation['longitude'], -180, 180);
      }
      if (version is! int || version < 1 || status is! String || editable is! bool) {
        throw const FormatException('Invalid listing location metadata');
      }
      if (!mounted) return;
      _latitudeController.text = latitude?.toStringAsFixed(2) ?? '';
      _longitudeController.text = longitude?.toStringAsFixed(2) ?? '';
      setState(() {
        _version = version;
        _status = status;
        _editable = editable;
        _configuration = results[1] as MobileChallengeConfiguration;
      });
    } catch (_) {
      if (mounted) {
        setState(() => _error = _isArabic
            ? 'تعذر تحميل الموقع التقريبي.'
            : 'Unable to load the approximate location.');
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  double _coordinate(Object? value, double minimum, double maximum) {
    final parsed = value is num ? value.toDouble() : double.tryParse('$value');
    if (parsed == null || !parsed.isFinite || parsed < minimum || parsed > maximum) {
      throw const FormatException('Invalid coordinate');
    }
    final scaled = parsed * 100;
    if ((scaled - scaled.round()).abs() > 0.000001) {
      throw const FormatException('Coordinate is outside the privacy grid');
    }
    return parsed;
  }

  Future<void> _openSecureWebsite() async {
    final handoff = _handoff;
    if (handoff == null || _openingWeb) return;
    setState(() {
      _openingWeb = true;
      _error = null;
    });
    try {
      final opened = await handoff.openListingEdit(
        locale: Localizations.localeOf(context).languageCode,
        listingId: widget.listingId,
      );
      if (!opened && mounted) {
        setState(() => _error = _isArabic
            ? 'تعذر فتح صفحة التعديل الآمنة.'
            : 'The secure edit page could not be opened.');
      }
    } catch (_) {
      if (mounted) {
        setState(() => _error = _isArabic
            ? 'تعذر فتح صفحة التعديل الآمنة.'
            : 'The secure edit page could not be opened.');
      }
    } finally {
      if (mounted) setState(() => _openingWeb = false);
    }
  }

  Future<void> _save() async {
    if (_webVerificationRequired) {
      await _openSecureWebsite();
      return;
    }
    final gateway = _locationGateway;
    final token = _accessToken;
    final version = _version;
    if (gateway == null || token.isEmpty || version == null || !_editable || _saving) return;

    final latitudeText = _latitudeController.text.trim();
    final longitudeText = _longitudeController.text.trim();
    if ((latitudeText.isEmpty) != (longitudeText.isEmpty)) {
      setState(() => _error = _isArabic
          ? 'أدخل خط العرض وخط الطول معاً.'
          : 'Enter both latitude and longitude.');
      return;
    }
    Map<String, double>? location;
    if (latitudeText.isNotEmpty) {
      final latitude = double.tryParse(latitudeText);
      final longitude = double.tryParse(longitudeText);
      if (latitude == null || longitude == null ||
          !latitude.isFinite || !longitude.isFinite ||
          latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        setState(() => _error = _isArabic
            ? 'تحقق من الإحداثيات التقريبية.'
            : 'Check the approximate coordinates.');
        return;
      }
      location = {'latitude': latitude, 'longitude': longitude};
    }

    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final response = await gateway.updateLocation(
        token,
        listingId: widget.listingId,
        version: version,
        approximateLocation: location,
      );
      final raw = response['listing'];
      if (raw is! Map) throw const FormatException('Invalid location response');
      if (!mounted) return;
      await _reload();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(response['unchanged'] == true
              ? (_isArabic ? 'لا يوجد تغيير جديد.' : 'No location change to save.')
              : (_isArabic ? 'تم حفظ الموقع التقريبي.' : 'Approximate location saved.')),
        ));
      }
    } on SessionRequestException catch (error) {
      if (mounted) {
        setState(() => _error = error.statusCode == 409
            ? (_isArabic
                ? 'تغيّر الإعلان. حمّل أحدث نسخة قبل الحفظ.'
                : 'The listing changed. Reload the latest version before saving.')
            : (_isArabic ? 'تعذر حفظ الموقع.' : 'Unable to save the location.'));
      }
    } catch (_) {
      if (mounted) {
        setState(() => _error = _isArabic ? 'تعذر حفظ الموقع.' : 'Unable to save the location.');
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final readOnly = !_editable || _webVerificationRequired;
    return Scaffold(
      appBar: AppBar(
        title: Text(_isArabic ? 'الموقع التقريبي' : 'Approximate location'),
        backgroundColor: SuqnaaBrand.ivory,
      ),
      body: _loading && _version == null
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(20),
              children: [
                Text(
                  _isArabic
                      ? 'البحث القريب بدون كشف الإحداثيات'
                      : 'Nearby search without publishing coordinates',
                  style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900, color: SuqnaaBrand.blue),
                ),
                const SizedBox(height: 8),
                Text(_isArabic
                    ? 'يتم تقريب النقطة إلى شبكة 0.01 درجة قبل الحفظ. يرى المشترون مسافة تقريبية بالكيلومترات فقط.'
                    : 'The point is rounded to a 0.01° grid before storage. Buyers see only coarse whole-kilometre distance.'),
                const SizedBox(height: 8),
                Text(_isArabic
                    ? 'الحالة: ${_status ?? '—'} · النسخة: ${_version ?? '—'}'
                    : 'Status: ${_status ?? '—'} · Version: ${_version ?? '—'}'),
                if (_webVerificationRequired) ...[
                  const SizedBox(height: 12),
                  Text(_isArabic
                      ? 'الفحص الأمني مفعّل. التعديل يتم فقط في صفحة الويب الآمنة.'
                      : 'Security verification is enabled. Location changes continue only on the secure web editor.'),
                ],
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                ],
                const SizedBox(height: 18),
                TextField(
                  key: const Key('listing-location-latitude'),
                  controller: _latitudeController,
                  readOnly: readOnly,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true),
                  decoration: InputDecoration(
                    labelText: _isArabic ? 'خط العرض التقريبي' : 'Approximate latitude',
                    border: const OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 14),
                TextField(
                  key: const Key('listing-location-longitude'),
                  controller: _longitudeController,
                  readOnly: readOnly,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true),
                  decoration: InputDecoration(
                    labelText: _isArabic ? 'خط الطول التقريبي' : 'Approximate longitude',
                    border: const OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 8),
                Text(_isArabic
                    ? 'اترك الحقلين فارغين لإزالة الإعلان من البحث القريب.'
                    : 'Leave both fields blank to remove this listing from nearby search.'),
                const SizedBox(height: 20),
                FilledButton.icon(
                  key: const Key('save-listing-location'),
                  onPressed: !_editable || _saving || _openingWeb ? null : _save,
                  icon: _saving || _openingWeb
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : Icon(_webVerificationRequired ? Icons.open_in_browser : Icons.location_on_outlined),
                  label: Text(_webVerificationRequired
                      ? (_isArabic ? 'المتابعة في الصفحة الآمنة' : 'Continue on secure web page')
                      : (_saving ? (_isArabic ? 'جارٍ الحفظ…' : 'Saving…') : (_isArabic ? 'حفظ الموقع التقريبي' : 'Save approximate location'))),
                ),
                const SizedBox(height: 10),
                OutlinedButton(
                  onPressed: _loading || _saving ? null : _reload,
                  child: Text(_isArabic ? 'تحميل أحدث نسخة' : 'Reload latest'),
                ),
              ],
            ),
    );
  }
}
