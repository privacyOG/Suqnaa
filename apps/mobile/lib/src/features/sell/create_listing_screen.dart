import 'package:flutter/material.dart';
import '../../api/listing_api.dart';
import '../../api/session_authed_api.dart';
import '../../brand/brand.dart';
import '../../config/mobile_environment.dart';
import '../../session/app_session.dart';
import '../../session/session_scope.dart';
import '../account/account_login_screen.dart';
import 'listing_media_manager_screen.dart';

class CreateListingScreen extends StatefulWidget {
  const CreateListingScreen({super.key});

  @override
  State<CreateListingScreen> createState() => _CreateListingScreenState();
}

class _CreateListingScreenState extends State<CreateListingScreen> {
  final _formKey = GlobalKey<FormState>();
  final _titleController = TextEditingController();
  final _descriptionController = TextEditingController();
  final _priceController = TextEditingController();
  final _currencyController = TextEditingController(text: 'AUD');
  final _countryController = TextEditingController(text: 'AU');
  final _regionController = TextEditingController(text: 'NSW');
  final _cityController = TextEditingController(text: 'Sydney');
  final _suburbController = TextEditingController();

  AppSession? _session;
  ListingApi? _api;
  String _condition = 'good';
  bool _allowPickup = true;
  bool _allowDelivery = false;
  bool _submitting = false;
  String? _error;

  bool get _isArabic => Localizations.localeOf(context).languageCode == 'ar';
  String _t(String en, String ar) => _isArabic ? ar : en;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final session = SessionScope.of(context);
    if (identical(session, _session)) return;

    _session = session;
    _api = ListingApi(
      authedApi: SessionAuthedApi(
        baseUrl: Uri.parse(MobileEnvironment.apiBaseUrl),
        sessionProvider: () => session,
      ),
    );
  }

  @override
  void dispose() {
    _titleController.dispose();
    _descriptionController.dispose();
    _priceController.dispose();
    _currencyController.dispose();
    _countryController.dispose();
    _regionController.dispose();
    _cityController.dispose();
    _suburbController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final api = _api;
    final session = _session;
    if (api == null || session == null || _submitting) return;

    if (!session.isSignedIn) {
      await Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => const AccountLoginScreen()),
      );
      return;
    }

    if (!_formKey.currentState!.validate()) return;

    final price = double.tryParse(_priceController.text.trim());
    if (price == null) {
      setState(() => _error = _t('Enter a valid price.', 'أدخل سعراً صالحاً.'));
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      final response = await api.createDraft(
        session.access.value,
        {
          'title': _titleController.text.trim(),
          'description': _descriptionController.text.trim(),
          'priceAmount': price,
          'currencyCode': _currencyController.text.trim().toUpperCase(),
          'condition': _condition,
          'countryCode': _countryController.text.trim().toUpperCase(),
          'region': _emptyToNull(_regionController.text),
          'city': _emptyToNull(_cityController.text),
          'suburb': _emptyToNull(_suburbController.text),
          'allowPickup': _allowPickup,
          'allowDelivery': _allowDelivery,
        },
      );

      if (!mounted) return;
      final listing = response['listing'];
      final listingId = listing is Map ? listing['id']?.toString() : null;
      final saved = _t('Draft listing saved.', 'تم حفظ مسودة الإعلان.');
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(listingId == null ? saved : '$saved $listingId')),
      );
      Navigator.of(context).pop(response);
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = _t(
            'Unable to save the listing. Check the details and try again.',
            'تعذر حفظ الإعلان. تحقق من التفاصيل وحاول مرة أخرى.',
          );
        });
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  String? _emptyToNull(String value) {
    final trimmed = value.trim();
    return trimmed.isEmpty ? null : trimmed;
  }

  @override
  Widget build(BuildContext context) {
    final signedIn = _session?.isSignedIn == true;

    return Scaffold(
      appBar: AppBar(
        title: Text(_t('Create listing', 'إنشاء إعلان')),
        backgroundColor: SuqnaaBrand.ivory,
        actions: [
          IconButton(
            key: const Key('open-listing-photo-manager-from-create'),
            tooltip: _t('Manage listing photos', 'إدارة صور الإعلان'),
            icon: const Icon(Icons.photo_library_outlined),
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => signedIn
                    ? const ListingMediaManagerScreen()
                    : const AccountLoginScreen(),
              ),
            ),
          ),
        ],
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Text(
              _t('Sell on Suqnaa', 'بِع على سوقنا'),
              style: const TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.w900,
                color: SuqnaaBrand.blue,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              signedIn
                  ? _t(
                      'Create a private draft. You can review it before publishing.',
                      'أنشئ مسودة خاصة ويمكنك مراجعتها قبل النشر.',
                    )
                  : _t(
                      'Sign in before saving your listing draft.',
                      'سجّل الدخول قبل حفظ مسودة إعلانك.',
                    ),
            ),
            const SizedBox(height: 24),
            _Field(
              label: _t('Title', 'العنوان'),
              controller: _titleController,
              hint: _t('Example: Samsung Galaxy phone', 'مثال: هاتف سامسونج جالاكسي'),
              validator: (value) {
                final text = value?.trim() ?? '';
                if (text.length < 3) {
                  return _t('Title must contain at least 3 characters', 'يجب ألا يقل العنوان عن 3 أحرف');
                }
                if (text.length > 120) {
                  return _t('Title must not exceed 120 characters', 'يجب ألا يتجاوز العنوان 120 حرفاً');
                }
                return null;
              },
            ),
            const SizedBox(height: 14),
            _Field(
              label: _t('Description', 'الوصف'),
              controller: _descriptionController,
              hint: _t(
                'Describe the item, condition, and important details',
                'صِف السلعة وحالتها وأهم التفاصيل',
              ),
              maxLines: 6,
              validator: (value) {
                final text = value?.trim() ?? '';
                if (text.length < 10) {
                  return _t('Description must contain at least 10 characters', 'يجب ألا يقل الوصف عن 10 أحرف');
                }
                if (text.length > 5000) {
                  return _t('Description must not exceed 5,000 characters', 'يجب ألا يتجاوز الوصف 5000 حرف');
                }
                return null;
              },
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  flex: 2,
                  child: _Field(
                    label: _t('Price', 'السعر'),
                    controller: _priceController,
                    hint: '0.00',
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    validator: (value) {
                      final amount = double.tryParse(value?.trim() ?? '');
                      if (amount == null || amount < 0) {
                        return _t('Enter a valid price', 'أدخل سعراً صالحاً');
                      }
                      return null;
                    },
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _Field(
                    label: _t('Currency', 'العملة'),
                    controller: _currencyController,
                    hint: 'AUD',
                    validator: (value) {
                      if ((value?.trim().length ?? 0) != 3) {
                        return _t('Use 3 letters', 'استخدم 3 أحرف');
                      }
                      return null;
                    },
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            DropdownButtonFormField<String>(
              value: _condition,
              decoration: InputDecoration(
                labelText: _t('Condition', 'الحالة'),
                filled: true,
                fillColor: Colors.white,
                border: const OutlineInputBorder(),
              ),
              items: [
                DropdownMenuItem(value: 'new', child: Text(_t('New', 'جديد'))),
                DropdownMenuItem(value: 'like_new', child: Text(_t('Like new', 'كالجديد'))),
                DropdownMenuItem(value: 'good', child: Text(_t('Good', 'جيد'))),
                DropdownMenuItem(value: 'fair', child: Text(_t('Fair', 'مقبول'))),
                DropdownMenuItem(value: 'parts_or_repair', child: Text(_t('Parts or repair', 'للقطع أو الإصلاح'))),
              ],
              onChanged: (value) {
                if (value != null) setState(() => _condition = value);
              },
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: _Field(
                    label: _t('Country', 'الدولة'),
                    controller: _countryController,
                    hint: 'AU',
                    validator: (value) {
                      if ((value?.trim().length ?? 0) != 2) {
                        return _t('Use 2 letters', 'استخدم حرفين');
                      }
                      return null;
                    },
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  flex: 2,
                  child: _Field(
                    label: _t('State / region', 'الولاية / المنطقة'),
                    controller: _regionController,
                    hint: 'NSW',
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            _Field(
              label: _t('City', 'المدينة'),
              controller: _cityController,
              hint: _t('Sydney', 'سيدني'),
            ),
            const SizedBox(height: 14),
            _Field(
              label: _t('Suburb', 'الضاحية'),
              controller: _suburbController,
              hint: _t('Example: Greenacre', 'مثال: جريناكر'),
            ),
            const SizedBox(height: 14),
            SwitchListTile.adaptive(
              contentPadding: EdgeInsets.zero,
              title: Text(_t('Local pickup', 'استلام محلي')),
              subtitle: Text(_t('Allow the buyer to collect the item', 'اسمح للمشتري باستلام السلعة')),
              value: _allowPickup,
              onChanged: (value) => setState(() => _allowPickup = value),
            ),
            SwitchListTile.adaptive(
              contentPadding: EdgeInsets.zero,
              title: Text(_t('Delivery available', 'التوصيل متاح')),
              subtitle: Text(_t('Offer delivery or shipping', 'وفّر التوصيل أو الشحن')),
              value: _allowDelivery,
              onChanged: (value) => setState(() => _allowDelivery = value),
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ],
            const SizedBox(height: 22),
            FilledButton.icon(
              onPressed: _submitting ? null : _submit,
              icon: _submitting
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Icon(signedIn ? Icons.save_outlined : Icons.login),
              label: Text(
                _submitting
                    ? _t('Saving...', 'جارٍ الحفظ...')
                    : signedIn
                        ? _t('Save draft', 'حفظ المسودة')
                        : _t('Sign in to continue', 'سجّل الدخول للمتابعة'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Field extends StatelessWidget {
  const _Field({
    required this.label,
    required this.controller,
    required this.hint,
    this.maxLines = 1,
    this.keyboardType,
    this.validator,
  });

  final String label;
  final TextEditingController controller;
  final String hint;
  final int maxLines;
  final TextInputType? keyboardType;
  final String? Function(String?)? validator;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      maxLines: maxLines,
      keyboardType: keyboardType,
      validator: validator,
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        filled: true,
        fillColor: Colors.white,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(18)),
      ),
    );
  }
}
