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
import '../safety/contextual_safety_guidance.dart';

class EditListingScreen extends StatefulWidget {
  const EditListingScreen({
    super.key,
    required this.listingId,
    this.listingGateway,
    this.challengeGateway,
    this.secureWebHandoffGateway,
    this.accessToken,
  });

  final String listingId;
  final SellerListingEditGateway? listingGateway;
  final ChallengeConfigurationGateway? challengeGateway;
  final SecureListingEditWebHandoffGateway? secureWebHandoffGateway;
  final String? accessToken;

  @override
  State<EditListingScreen> createState() => _EditListingScreenState();
}

class _EditListingScreenState extends State<EditListingScreen> {
  final _formKey = GlobalKey<FormState>();
  final _titleController = TextEditingController();
  final _descriptionController = TextEditingController();
  final _priceController = TextEditingController();
  final _currencyController = TextEditingController();
  final _quantityController = TextEditingController();
  final _unitController = TextEditingController();
  final _countryController = TextEditingController();
  final _regionController = TextEditingController();
  final _cityController = TextEditingController();
  final _suburbController = TextEditingController();

  SellerListingEditGateway? _listingGateway;
  ChallengeConfigurationGateway? _challengeGateway;
  SecureListingEditWebHandoffGateway? _secureWebHandoffGateway;
  AppSession? _session;
  MobileChallengeConfiguration? _configuration;
  List<_CategoryOption> _categories = const [];
  String? _categoryId;
  String _condition = 'good';
  String _availability = 'in_stock';
  bool _allowPickup = true;
  bool _allowDelivery = false;
  bool _editable = false;
  bool _initialized = false;
  bool _loading = false;
  bool _saving = false;
  bool _openingWeb = false;
  bool _conflict = false;
  int? _version;
  String? _status;
  String? _error;

  String get _accessToken => widget.accessToken ?? _session?.access.value ?? '';
  bool get _isArabic => Localizations.localeOf(context).languageCode == 'ar';
  bool get _webVerificationRequired => _configuration?.enabled == true;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialized) {
      return;
    }
    _initialized = true;

    if (widget.listingGateway != null &&
        widget.challengeGateway != null &&
        widget.secureWebHandoffGateway != null) {
      _listingGateway = widget.listingGateway;
      _challengeGateway = widget.challengeGateway;
      _secureWebHandoffGateway = widget.secureWebHandoffGateway;
    } else {
      final session = SessionScope.of(context);
      final apiBaseUrl = Uri.parse(MobileEnvironment.apiBaseUrl);
      final authed = SessionAuthedApi(
        baseUrl: apiBaseUrl,
        sessionProvider: () => session,
      );
      _session = session;
      _listingGateway = widget.listingGateway ?? SellerListingApi(authedApi: authed);
      _challengeGateway = widget.challengeGateway ?? ChallengeConfigurationApi(baseUrl: apiBaseUrl);
      _secureWebHandoffGateway = widget.secureWebHandoffGateway ??
          BrowserSecureWebHandoff(webBaseUrl: Uri.parse(MobileEnvironment.webBaseUrl));
    }

    unawaited(_reload());
  }

  @override
  void dispose() {
    _titleController.dispose();
    _descriptionController.dispose();
    _priceController.dispose();
    _currencyController.dispose();
    _quantityController.dispose();
    _unitController.dispose();
    _countryController.dispose();
    _regionController.dispose();
    _cityController.dispose();
    _suburbController.dispose();
    super.dispose();
  }

  Future<void> _reload() async {
    final listingGateway = _listingGateway;
    final challengeGateway = _challengeGateway;
    final token = _accessToken;
    if (listingGateway == null || challengeGateway == null || token.isEmpty || _loading) {
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
      _conflict = false;
    });

    try {
      final results = await Future.wait<Object>([
        listingGateway.getForEdit(token, listingId: widget.listingId),
        listingGateway.getCategories(token),
        challengeGateway.fetch(),
      ]);
      if (!mounted) {
        return;
      }

      final snapshot = Map<String, dynamic>.from(results[0] as Map);
      final categoryPayload = Map<String, dynamic>.from(results[1] as Map);
      final configuration = results[2] as MobileChallengeConfiguration;
      final rawListing = snapshot['listing'];
      if (rawListing is! Map) {
        throw const FormatException('Invalid listing edit response');
      }
      final listing = Map<String, dynamic>.from(rawListing);
      final categories = _parseCategories(categoryPayload);
      _applyListing(listing, categories);
      setState(() {
        _configuration = configuration;
        _categories = categories;
        _editable = snapshot['editable'] == true;
      });
    } catch (error) {
      if (mounted) {
        setState(() => _error = _loadError(error));
      }
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  List<_CategoryOption> _parseCategories(Map<String, dynamic> payload) {
    final raw = payload['categories'];
    if (raw is! List) {
      return const [];
    }
    final output = <_CategoryOption>[];
    for (final item in raw.whereType<Map>()) {
      final value = Map<String, dynamic>.from(item);
      final id = value['id']?.toString();
      final nameEn = value['name_en']?.toString();
      if (id == null || nameEn == null) {
        continue;
      }
      output.add(_CategoryOption(
        id: id,
        nameEn: nameEn,
        nameAr: value['name_ar']?.toString(),
        sortOrder: int.tryParse(value['sort_order']?.toString() ?? '') ?? 0,
      ));
    }
    output.sort((a, b) {
      final byOrder = a.sortOrder.compareTo(b.sortOrder);
      return byOrder != 0 ? byOrder : a.nameEn.compareTo(b.nameEn);
    });
    return output;
  }

  void _applyListing(Map<String, dynamic> listing, List<_CategoryOption> categories) {
    final categoryId = listing['categoryId']?.toString();
    _titleController.text = listing['title']?.toString() ?? '';
    _descriptionController.text = listing['description']?.toString() ?? '';
    _priceController.text = listing['priceAmount']?.toString() ?? '';
    _currencyController.text = listing['currencyCode']?.toString() ?? '';
    _quantityController.text = listing['availableQuantity']?.toString() ?? '';
    _unitController.text = listing['unitLabel']?.toString() ?? '';
    _countryController.text = listing['countryCode']?.toString() ?? '';
    _regionController.text = listing['region']?.toString() ?? '';
    _cityController.text = listing['city']?.toString() ?? '';
    _suburbController.text = listing['suburb']?.toString() ?? '';
    _categoryId = categories.any((item) => item.id == categoryId) ? categoryId : null;
    _condition = listing['condition']?.toString() ?? 'good';
    _availability = listing['availabilityStatus']?.toString() ?? 'in_stock';
    _allowPickup = listing['allowPickup'] == true;
    _allowDelivery = listing['allowDelivery'] == true;
    _version = int.tryParse(listing['version']?.toString() ?? '');
    _status = listing['status']?.toString();
  }

  String _loadError(Object error) {
    if (error is SessionRequestException && error.statusCode == 404) {
      return _isArabic ? 'لم يتم العثور على الإعلان في حسابك.' : 'The listing was not found in your account.';
    }
    return _isArabic ? 'تعذر تحميل تفاصيل الإعلان.' : 'Unable to load listing details.';
  }

  Future<void> _openSecureWebsite() async {
    final gateway = _secureWebHandoffGateway;
    if (gateway == null || _openingWeb) {
      return;
    }
    setState(() {
      _openingWeb = true;
      _error = null;
    });
    try {
      final opened = await gateway.openListingEdit(
        locale: Localizations.localeOf(context).languageCode,
        listingId: widget.listingId,
      );
      if (!opened && mounted) {
        setState(() => _error = _isArabic ? 'تعذر فتح صفحة التعديل الآمنة.' : 'The secure edit page could not be opened.');
      }
    } catch (_) {
      if (mounted) {
        setState(() => _error = _isArabic ? 'تعذر فتح صفحة التعديل الآمنة.' : 'The secure edit page could not be opened.');
      }
    } finally {
      if (mounted) {
        setState(() => _openingWeb = false);
      }
    }
  }

  Future<void> _submit() async {
    if (_webVerificationRequired) {
      await _openSecureWebsite();
      return;
    }

    final gateway = _listingGateway;
    final token = _accessToken;
    final version = _version;
    if (gateway == null || token.isEmpty || version == null || !_editable || _saving) {
      return;
    }
    if (!_formKey.currentState!.validate()) {
      return;
    }

    final price = double.tryParse(_priceController.text.trim());
    final quantityText = _quantityController.text.trim();
    final quantity = quantityText.isEmpty ? null : int.tryParse(quantityText);
    if (price == null || price < 0) {
      setState(() => _error = _isArabic ? 'أدخل سعراً صحيحاً.' : 'Enter a valid price.');
      return;
    }
    if (quantityText.isNotEmpty && (quantity == null || quantity < 0 || quantity > 1000000)) {
      setState(() => _error = _isArabic ? 'أدخل كمية صحيحة.' : 'Enter a valid available quantity.');
      return;
    }
    if (!_allowPickup && !_allowDelivery) {
      setState(() => _error = _isArabic ? 'اختر الاستلام أو التوصيل على الأقل.' : 'Select pickup or delivery.');
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
      _conflict = false;
    });

    try {
      final response = await gateway.updateDetails(
        token,
        listingId: widget.listingId,
        input: {
          'version': version,
          'categoryId': _categoryId,
          'title': _titleController.text.trim(),
          'description': _descriptionController.text.trim(),
          'priceAmount': price,
          'currencyCode': _currencyController.text.trim().toUpperCase(),
          'condition': _condition,
          'availabilityStatus': _availability,
          'availableQuantity': quantity,
          'unitLabel': _emptyToNull(_unitController.text),
          'countryCode': _countryController.text.trim().toUpperCase(),
          'region': _emptyToNull(_regionController.text),
          'city': _emptyToNull(_cityController.text),
          'suburb': _emptyToNull(_suburbController.text),
          'allowPickup': _allowPickup,
          'allowDelivery': _allowDelivery,
        },
      );
      final rawListing = response['listing'];
      if (rawListing is! Map) {
        throw const FormatException('Invalid listing edit response');
      }
      if (!mounted) {
        return;
      }
      final listing = Map<String, dynamic>.from(rawListing);
      _applyListing(listing, _categories);
      setState(() {
        _editable = const {'draft', 'active', 'expired'}.contains(_status);
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(response['unchanged'] == true
              ? (_isArabic ? 'لا توجد تغييرات جديدة للحفظ.' : 'No new changes to save.')
              : (_isArabic ? 'تم حفظ التغييرات.' : 'Listing changes saved.')),
        ),
      );
    } on SessionRequestException catch (error) {
      if (!mounted) {
        return;
      }
      if (error.statusCode == 409) {
        setState(() {
          _conflict = true;
          _error = _isArabic
              ? 'تغيّر الإعلان منذ فتح النموذج. حمّل أحدث نسخة قبل الحفظ.'
              : 'This listing changed after the form was opened. Reload the latest version before saving.';
        });
      } else {
        setState(() => _error = _isArabic ? 'تعذر حفظ التغييرات.' : 'Unable to save listing changes.');
      }
    } catch (_) {
      if (mounted) {
        setState(() => _error = _isArabic ? 'تعذر حفظ التغييرات.' : 'Unable to save listing changes.');
      }
    } finally {
      if (mounted) {
        setState(() => _saving = false);
      }
    }
  }

  String? _emptyToNull(String value) {
    final text = value.trim();
    return text.isEmpty ? null : text;
  }

  @override
  Widget build(BuildContext context) {
    final readOnly = !_editable || _webVerificationRequired;

    return Scaffold(
      appBar: AppBar(
        title: Text(_isArabic ? 'تعديل الإعلان' : 'Edit listing'),
        backgroundColor: SuqnaaBrand.ivory,
      ),
      body: _loading && _version == null
          ? const Center(child: CircularProgressIndicator())
          : Form(
              key: _formKey,
              child: ListView(
                padding: const EdgeInsets.all(20),
                children: [
                  Text(
                    _titleController.text.isEmpty
                        ? (_isArabic ? 'تفاصيل الإعلان' : 'Listing details')
                        : _titleController.text,
                    style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w900, color: SuqnaaBrand.blue),
                  ),
                  const SizedBox(height: 6),
                  Text(_isArabic
                      ? 'الحالة: ${_status ?? '—'} · النسخة: ${_version ?? '—'}'
                      : 'Status: ${_status ?? '—'} · Version: ${_version ?? '—'}'),
                  const ContextualSafetyGuidance(
                    decisionPoint: SafetyDecisionPoint.listing,
                    margin: EdgeInsets.only(top: 12, bottom: 4),
                  ),
                  if (!_editable) ...[
                    const SizedBox(height: 14),
                    Text(
                      _isArabic
                          ? 'لا يمكن تعديل إعلان محجوز أو مباع أو محذوف.'
                          : 'Reserved, sold, and removed listings cannot be edited.',
                      style: TextStyle(color: Theme.of(context).colorScheme.error),
                    ),
                  ],
                  if (_webVerificationRequired) ...[
                    const SizedBox(height: 14),
                    Text(
                      _isArabic
                          ? 'الفحص الأمني مفعّل. تعرض الحقول أدناه أحدث البيانات، ويستمر التعديل في صفحة الويب الآمنة.'
                          : 'Security verification is enabled. The fields below show the latest data; editing continues on the secure web page.',
                    ),
                  ],
                  if (_error != null) ...[
                    const SizedBox(height: 14),
                    MaterialBanner(
                      content: Text(_error!),
                      actions: [
                        if (_conflict)
                          TextButton(onPressed: _loading ? null : _reload, child: Text(_isArabic ? 'تحميل الأحدث' : 'Reload latest')),
                        TextButton(onPressed: () => setState(() => _error = null), child: Text(_isArabic ? 'إغلاق' : 'Dismiss')),
                      ],
                    ),
                  ],
                  const SizedBox(height: 18),
                  DropdownButtonFormField<String?>(
                    value: _categoryId,
                    decoration: InputDecoration(labelText: _isArabic ? 'الفئة' : 'Category', border: const OutlineInputBorder()),
                    items: [
                      DropdownMenuItem<String?>(value: null, child: Text(_isArabic ? 'أخرى / غير محدد' : 'Other / not specified')),
                      ..._categories.map((item) => DropdownMenuItem<String?>(value: item.id, child: Text(_isArabic ? item.nameAr ?? item.nameEn : item.nameEn))),
                    ],
                    onChanged: readOnly ? null : (value) => setState(() => _categoryId = value),
                  ),
                  const SizedBox(height: 14),
                  _EditField(label: _isArabic ? 'العنوان' : 'Title', controller: _titleController, enabled: !readOnly, maxLength: 120, validator: (value) => (value?.trim().length ?? 0) < 3 ? (_isArabic ? 'العنوان قصير جداً' : 'Title is too short') : null),
                  const SizedBox(height: 14),
                  _EditField(label: _isArabic ? 'الوصف' : 'Description', controller: _descriptionController, enabled: !readOnly, maxLines: 6, maxLength: 5000, validator: (value) => (value?.trim().length ?? 0) < 10 ? (_isArabic ? 'الوصف قصير جداً' : 'Description is too short') : null),
                  const SizedBox(height: 14),
                  Row(children: [
                    Expanded(child: _EditField(label: _isArabic ? 'السعر' : 'Price', controller: _priceController, enabled: !readOnly, keyboardType: const TextInputType.numberWithOptions(decimal: true), validator: (value) { final amount = double.tryParse(value?.trim() ?? ''); return amount == null || amount < 0 ? (_isArabic ? 'سعر غير صالح' : 'Invalid price') : null; })),
                    const SizedBox(width: 12),
                    Expanded(child: _EditField(label: _isArabic ? 'العملة' : 'Currency', controller: _currencyController, enabled: !readOnly, maxLength: 3, validator: (value) => (value?.trim().length ?? 0) != 3 ? (_isArabic ? '3 أحرف' : 'Use 3 letters') : null)),
                  ]),
                  const SizedBox(height: 14),
                  DropdownButtonFormField<String>(
                    value: _condition,
                    decoration: InputDecoration(labelText: _isArabic ? 'الحالة' : 'Condition', border: const OutlineInputBorder()),
                    items: const [
                      DropdownMenuItem(value: 'new', child: Text('New')),
                      DropdownMenuItem(value: 'like_new', child: Text('Like new')),
                      DropdownMenuItem(value: 'good', child: Text('Good')),
                      DropdownMenuItem(value: 'fair', child: Text('Fair')),
                      DropdownMenuItem(value: 'parts_or_repair', child: Text('Parts or repair')),
                    ],
                    onChanged: readOnly ? null : (value) { if (value != null) setState(() => _condition = value); },
                  ),
                  const SizedBox(height: 14),
                  DropdownButtonFormField<String>(
                    value: _availability,
                    decoration: InputDecoration(labelText: _isArabic ? 'التوفر' : 'Availability', border: const OutlineInputBorder()),
                    items: const [
                      DropdownMenuItem(value: 'in_stock', child: Text('In stock')),
                      DropdownMenuItem(value: 'limited', child: Text('Limited')),
                      DropdownMenuItem(value: 'out_of_stock', child: Text('Out of stock')),
                      DropdownMenuItem(value: 'service_available', child: Text('Service available')),
                    ],
                    onChanged: readOnly ? null : (value) { if (value != null) setState(() => _availability = value); },
                  ),
                  const SizedBox(height: 14),
                  Row(children: [
                    Expanded(child: _EditField(label: _isArabic ? 'الكمية' : 'Available quantity', controller: _quantityController, enabled: !readOnly, keyboardType: TextInputType.number)),
                    const SizedBox(width: 12),
                    Expanded(child: _EditField(label: _isArabic ? 'الوحدة' : 'Unit label', controller: _unitController, enabled: !readOnly, maxLength: 40)),
                  ]),
                  const SizedBox(height: 14),
                  Row(children: [
                    Expanded(child: _EditField(label: _isArabic ? 'الدولة' : 'Country', controller: _countryController, enabled: !readOnly, maxLength: 2, validator: (value) => (value?.trim().length ?? 0) != 2 ? (_isArabic ? 'حرفان' : 'Use 2 letters') : null)),
                    const SizedBox(width: 12),
                    Expanded(child: _EditField(label: _isArabic ? 'الولاية / المنطقة' : 'State / region', controller: _regionController, enabled: !readOnly, maxLength: 120)),
                  ]),
                  const SizedBox(height: 14),
                  _EditField(label: _isArabic ? 'المدينة' : 'City', controller: _cityController, enabled: !readOnly, maxLength: 120),
                  const SizedBox(height: 14),
                  _EditField(label: _isArabic ? 'الضاحية' : 'Suburb', controller: _suburbController, enabled: !readOnly, maxLength: 120),
                  const SizedBox(height: 8),
                  SwitchListTile.adaptive(contentPadding: EdgeInsets.zero, title: Text(_isArabic ? 'استلام محلي' : 'Local pickup'), value: _allowPickup, onChanged: readOnly ? null : (value) => setState(() => _allowPickup = value)),
                  SwitchListTile.adaptive(contentPadding: EdgeInsets.zero, title: Text(_isArabic ? 'توصيل / شحن' : 'Delivery / shipping'), value: _allowDelivery, onChanged: readOnly ? null : (value) => setState(() => _allowDelivery = value)),
                  const SizedBox(height: 20),
                  FilledButton.icon(
                    key: const Key('save-listing-edit'),
                    onPressed: !_editable || _saving || _openingWeb ? null : _submit,
                    icon: _saving || _openingWeb
                        ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                        : Icon(_webVerificationRequired ? Icons.open_in_browser : Icons.save_outlined),
                    label: Text(_webVerificationRequired
                        ? (_isArabic ? 'المتابعة في الصفحة الآمنة' : 'Continue on secure web page')
                        : (_saving ? (_isArabic ? 'جارٍ الحفظ…' : 'Saving…') : (_isArabic ? 'حفظ التغييرات' : 'Save changes'))),
                  ),
                ],
              ),
            ),
    );
  }
}

class _EditField extends StatelessWidget {
  const _EditField({
    required this.label,
    required this.controller,
    required this.enabled,
    this.maxLines = 1,
    this.maxLength,
    this.keyboardType,
    this.validator,
  });

  final String label;
  final TextEditingController controller;
  final bool enabled;
  final int maxLines;
  final int? maxLength;
  final TextInputType? keyboardType;
  final String? Function(String?)? validator;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      enabled: enabled,
      maxLines: maxLines,
      maxLength: maxLength,
      keyboardType: keyboardType,
      validator: validator,
      decoration: InputDecoration(
        labelText: label,
        filled: true,
        fillColor: Colors.white,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(18)),
      ),
    );
  }
}

class _CategoryOption {
  const _CategoryOption({
    required this.id,
    required this.nameEn,
    required this.sortOrder,
    this.nameAr,
  });

  final String id;
  final String nameEn;
  final String? nameAr;
  final int sortOrder;
}
