import 'package:flutter/material.dart';
import '../../api/listing_api.dart';
import '../../api/session_authed_api.dart';
import '../../brand/brand.dart';
import '../../config/mobile_environment.dart';
import '../../session/app_session.dart';
import '../../session/session_scope.dart';
import '../account/account_login_screen.dart';

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

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final session = SessionScope.of(context);
    if (identical(session, _session)) {
      return;
    }

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
    if (api == null || session == null || _submitting) {
      return;
    }

    if (!session.isSignedIn) {
      await Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => const AccountLoginScreen()),
      );
      return;
    }

    if (!_formKey.currentState!.validate()) {
      return;
    }

    final price = double.tryParse(_priceController.text.trim());
    if (price == null) {
      setState(() => _error = 'Enter a valid price.');
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

      if (!mounted) {
        return;
      }

      final listing = response['listing'];
      final listingId = listing is Map ? listing['id']?.toString() : null;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            listingId == null
                ? 'Draft listing saved.'
                : 'Draft listing saved: $listingId',
          ),
        ),
      );
      Navigator.of(context).pop(response);
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = 'Unable to save the listing. Check the details and try again.';
        });
      }
    } finally {
      if (mounted) {
        setState(() => _submitting = false);
      }
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
        title: const Text('Create listing'),
        backgroundColor: SuqnaaBrand.ivory,
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            const Text(
              'Sell on Suqnaa',
              style: TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.w900,
                color: SuqnaaBrand.blue,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              signedIn
                  ? 'Create a private draft. You can review it before publishing.'
                  : 'Sign in before saving your listing draft.',
            ),
            const SizedBox(height: 24),
            _Field(
              label: 'Title',
              controller: _titleController,
              hint: 'Example: Samsung Galaxy phone',
              validator: (value) {
                final text = value?.trim() ?? '';
                if (text.length < 3) {
                  return 'Title must contain at least 3 characters';
                }
                if (text.length > 120) {
                  return 'Title must not exceed 120 characters';
                }
                return null;
              },
            ),
            const SizedBox(height: 14),
            _Field(
              label: 'Description',
              controller: _descriptionController,
              hint: 'Describe the item, condition, and important details',
              maxLines: 6,
              validator: (value) {
                final text = value?.trim() ?? '';
                if (text.length < 10) {
                  return 'Description must contain at least 10 characters';
                }
                if (text.length > 5000) {
                  return 'Description must not exceed 5,000 characters';
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
                    label: 'Price',
                    controller: _priceController,
                    hint: '0.00',
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    validator: (value) {
                      final amount = double.tryParse(value?.trim() ?? '');
                      if (amount == null || amount < 0) {
                        return 'Enter a valid price';
                      }
                      return null;
                    },
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _Field(
                    label: 'Currency',
                    controller: _currencyController,
                    hint: 'AUD',
                    validator: (value) {
                      if ((value?.trim().length ?? 0) != 3) {
                        return 'Use 3 letters';
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
              decoration: const InputDecoration(
                labelText: 'Condition',
                filled: true,
                fillColor: Colors.white,
                border: OutlineInputBorder(),
              ),
              items: const [
                DropdownMenuItem(value: 'new', child: Text('New')),
                DropdownMenuItem(value: 'like_new', child: Text('Like new')),
                DropdownMenuItem(value: 'good', child: Text('Good')),
                DropdownMenuItem(value: 'fair', child: Text('Fair')),
                DropdownMenuItem(
                  value: 'parts_or_repair',
                  child: Text('Parts or repair'),
                ),
              ],
              onChanged: (value) {
                if (value != null) {
                  setState(() => _condition = value);
                }
              },
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: _Field(
                    label: 'Country',
                    controller: _countryController,
                    hint: 'AU',
                    validator: (value) {
                      if ((value?.trim().length ?? 0) != 2) {
                        return 'Use 2 letters';
                      }
                      return null;
                    },
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  flex: 2,
                  child: _Field(
                    label: 'State / region',
                    controller: _regionController,
                    hint: 'NSW',
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            _Field(
              label: 'City',
              controller: _cityController,
              hint: 'Sydney',
            ),
            const SizedBox(height: 14),
            _Field(
              label: 'Suburb',
              controller: _suburbController,
              hint: 'Example: Greenacre',
            ),
            const SizedBox(height: 14),
            SwitchListTile.adaptive(
              contentPadding: EdgeInsets.zero,
              title: const Text('Local pickup'),
              subtitle: const Text('Allow the buyer to collect the item'),
              value: _allowPickup,
              onChanged: (value) => setState(() => _allowPickup = value),
            ),
            SwitchListTile.adaptive(
              contentPadding: EdgeInsets.zero,
              title: const Text('Delivery available'),
              subtitle: const Text('Offer delivery or shipping'),
              value: _allowDelivery,
              onChanged: (value) => setState(() => _allowDelivery = value),
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(
                _error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
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
                    ? 'Saving...'
                    : signedIn
                        ? 'Save draft'
                        : 'Sign in to continue',
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
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
        ),
      ),
    );
  }
}
