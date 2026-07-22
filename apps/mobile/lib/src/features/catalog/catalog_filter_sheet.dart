import 'package:flutter/material.dart';
import 'package:suqnaa/l10n/app_localizations.dart';
import '../../api/catalog_api.dart';

class CatalogFilterSheet extends StatefulWidget {
  const CatalogFilterSheet({
    super.key,
    required this.initial,
  });

  final CatalogSearchOptions initial;

  @override
  State<CatalogFilterSheet> createState() => _CatalogFilterSheetState();
}

class _CatalogFilterSheetState extends State<CatalogFilterSheet> {
  late final TextEditingController _minimumPriceController;
  late final TextEditingController _maximumPriceController;
  late final TextEditingController _currencyController;
  late final TextEditingController _countryController;
  late final TextEditingController _regionController;
  late final TextEditingController _cityController;
  late final TextEditingController _suburbController;
  String? _condition;
  String? _availability;
  String? _fulfilment;
  late String _sort;
  String? _error;

  bool get _isArabic => Localizations.localeOf(context).languageCode == 'ar';

  String _label(String english, String arabic) => _isArabic ? arabic : english;

  @override
  void initState() {
    super.initState();
    _condition = widget.initial.condition;
    _availability = widget.initial.availabilityStatus;
    _fulfilment = widget.initial.fulfilment;
    _sort = widget.initial.sort;
    _minimumPriceController = TextEditingController(
      text: _priceText(widget.initial.minimumPrice),
    );
    _maximumPriceController = TextEditingController(
      text: _priceText(widget.initial.maximumPrice),
    );
    _currencyController = TextEditingController(
      text: widget.initial.currency ?? '',
    );
    _countryController = TextEditingController(
      text: widget.initial.country ?? '',
    );
    _regionController = TextEditingController(
      text: widget.initial.region ?? '',
    );
    _cityController = TextEditingController(
      text: widget.initial.city ?? '',
    );
    _suburbController = TextEditingController(
      text: widget.initial.suburb ?? '',
    );
  }

  @override
  void dispose() {
    _minimumPriceController.dispose();
    _maximumPriceController.dispose();
    _currencyController.dispose();
    _countryController.dispose();
    _regionController.dispose();
    _cityController.dispose();
    _suburbController.dispose();
    super.dispose();
  }

  String _priceText(double? value) {
    if (value == null) return '';
    return value == value.roundToDouble()
        ? value.toInt().toString()
        : value.toString();
  }

  double? _priceValue(TextEditingController controller) {
    final value = controller.text.trim();
    return value.isEmpty ? null : double.tryParse(value);
  }

  void _apply() {
    final text = AppLocalizations.of(context);
    final minimum = _priceValue(_minimumPriceController);
    final maximum = _priceValue(_maximumPriceController);
    if ((_minimumPriceController.text.trim().isNotEmpty && minimum == null) ||
        (_maximumPriceController.text.trim().isNotEmpty && maximum == null) ||
        (minimum != null && minimum < 0) ||
        (maximum != null && maximum < 0) ||
        (minimum != null && maximum != null && minimum > maximum)) {
      setState(() => _error = text.checkPriceRange);
      return;
    }

    final currency = _currencyController.text.trim().toUpperCase();
    final country = _countryController.text.trim().toUpperCase();
    final usesPrice = minimum != null ||
        maximum != null ||
        _sort == 'price_asc' ||
        _sort == 'price_desc';
    if (usesPrice && currency.length != 3) {
      setState(() => _error = _label(
        'Enter a 3-letter currency for price filters or sorting.',
        'أدخل رمز عملة من 3 أحرف لتصفية السعر أو ترتيبه.',
      ));
      return;
    }
    if ((currency.isNotEmpty && currency.length != 3) ||
        (country.isNotEmpty && country.length != 2)) {
      setState(() => _error = text.checkLocationCodes);
      return;
    }

    Navigator.of(context).pop(
      CatalogSearchOptions(
        limit: widget.initial.limit,
        query: widget.initial.query,
        categoryId: widget.initial.categoryId,
        condition: _condition,
        availabilityStatus: _availability,
        minimumPrice: minimum,
        maximumPrice: maximum,
        currency: currency.isEmpty ? null : currency,
        country: country.isEmpty ? null : country,
        region: _emptyToNull(_regionController.text),
        city: _emptyToNull(_cityController.text),
        suburb: _emptyToNull(_suburbController.text),
        fulfilment: _fulfilment,
        sort: _sort,
      ),
    );
  }

  String? _emptyToNull(String value) {
    final normalized = value.trim();
    return normalized.isEmpty ? null : normalized;
  }

  void _clear() {
    Navigator.of(context).pop(
      CatalogSearchOptions(
        limit: widget.initial.limit,
        query: widget.initial.query,
        categoryId: widget.initial.categoryId,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final text = AppLocalizations.of(context);

    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(
          20,
          18,
          20,
          20 + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    text.filters,
                    style: const TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
                IconButton(
                  tooltip: text.close,
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
            const SizedBox(height: 18),
            _Dropdown(
              label: _label('Sort', 'الترتيب'),
              value: _sort,
              items: {
                'newest': _label('Newest first', 'الأحدث أولاً'),
                'price_asc': _label(
                  'Price: low to high',
                  'السعر: من الأقل إلى الأعلى',
                ),
                'price_desc': _label(
                  'Price: high to low',
                  'السعر: من الأعلى إلى الأقل',
                ),
              },
              anyLabel: _label('Newest first', 'الأحدث أولاً'),
              includeAny: false,
              onChanged: (value) => setState(() => _sort = value ?? 'newest'),
            ),
            const SizedBox(height: 14),
            _Dropdown(
              label: text.condition,
              value: _condition,
              items: {
                'new': text.conditionNew,
                'like_new': text.conditionLikeNew,
                'good': text.conditionGood,
                'fair': text.conditionFair,
                'parts_or_repair': text.conditionPartsRepair,
              },
              anyLabel: text.anyOption,
              onChanged: (value) => setState(() => _condition = value),
            ),
            const SizedBox(height: 14),
            _Dropdown(
              label: text.availability,
              value: _availability,
              items: {
                'in_stock': text.availabilityInStock,
                'limited': text.availabilityLimited,
                'out_of_stock': text.availabilityOutOfStock,
                'service_available': text.availabilityService,
              },
              anyLabel: text.anyOption,
              onChanged: (value) => setState(() => _availability = value),
            ),
            const SizedBox(height: 14),
            _Dropdown(
              label: text.fulfilment,
              value: _fulfilment,
              items: {
                'pickup': text.pickup,
                'delivery': text.delivery,
                'both': _label('Pickup and delivery', 'الاستلام والتوصيل معاً'),
              },
              anyLabel: text.anyOption,
              onChanged: (value) => setState(() => _fulfilment = value),
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: _TextField(
                    label: text.minimumPrice,
                    controller: _minimumPriceController,
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _TextField(
                    label: text.maximumPrice,
                    controller: _maximumPriceController,
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: _TextField(
                    label: text.currency,
                    controller: _currencyController,
                    textCapitalization: TextCapitalization.characters,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _TextField(
                    label: text.country,
                    controller: _countryController,
                    textCapitalization: TextCapitalization.characters,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            _TextField(
              label: _label('State or region', 'الولاية أو المنطقة'),
              controller: _regionController,
              textCapitalization: TextCapitalization.words,
            ),
            const SizedBox(height: 14),
            _TextField(
              label: text.city,
              controller: _cityController,
              textCapitalization: TextCapitalization.words,
            ),
            const SizedBox(height: 14),
            _TextField(
              label: _label('Suburb', 'الحي'),
              controller: _suburbController,
              textCapitalization: TextCapitalization.words,
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(
                _error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ],
            const SizedBox(height: 22),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: _clear,
                    child: Text(text.clearFilters),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton(
                    onPressed: _apply,
                    child: Text(text.applyFilters),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _Dropdown extends StatelessWidget {
  const _Dropdown({
    required this.label,
    required this.value,
    required this.items,
    required this.anyLabel,
    required this.onChanged,
    this.includeAny = true,
  });

  final String label;
  final String? value;
  final Map<String, String> items;
  final String anyLabel;
  final ValueChanged<String?> onChanged;
  final bool includeAny;

  @override
  Widget build(BuildContext context) {
    return DropdownButtonFormField<String?>(
      value: value,
      decoration: InputDecoration(
        labelText: label,
        filled: true,
        fillColor: Colors.white,
        border: const OutlineInputBorder(),
      ),
      items: [
        if (includeAny)
          DropdownMenuItem<String?>(value: null, child: Text(anyLabel)),
        ...items.entries.map(
          (entry) => DropdownMenuItem<String?>(
            value: entry.key,
            child: Text(entry.value),
          ),
        ),
      ],
      onChanged: onChanged,
    );
  }
}

class _TextField extends StatelessWidget {
  const _TextField({
    required this.label,
    required this.controller,
    this.keyboardType,
    this.textCapitalization = TextCapitalization.none,
  });

  final String label;
  final TextEditingController controller;
  final TextInputType? keyboardType;
  final TextCapitalization textCapitalization;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      keyboardType: keyboardType,
      textCapitalization: textCapitalization,
      maxLength: 120,
      decoration: InputDecoration(
        labelText: label,
        filled: true,
        fillColor: Colors.white,
        border: const OutlineInputBorder(),
      ),
    );
  }
}
