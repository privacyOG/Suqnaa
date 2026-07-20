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
  late final TextEditingController _cityController;
  String? _condition;
  String? _availability;
  String? _fulfilment;
  String? _error;

  @override
  void initState() {
    super.initState();
    _condition = widget.initial.condition;
    _availability = widget.initial.availabilityStatus;
    _fulfilment = widget.initial.fulfilment;
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
    _cityController = TextEditingController(
      text: widget.initial.city ?? '',
    );
  }

  @override
  void dispose() {
    _minimumPriceController.dispose();
    _maximumPriceController.dispose();
    _currencyController.dispose();
    _countryController.dispose();
    _cityController.dispose();
    super.dispose();
  }

  String _priceText(double? value) {
    if (value == null) {
      return '';
    }
    return value == value.roundToDouble()
        ? value.toInt().toString()
        : value.toString();
  }

  double? _priceValue(TextEditingController controller) {
    final value = controller.text.trim();
    return value.isEmpty ? null : double.tryParse(value);
  }

  void _apply() {
    final minimum = _priceValue(_minimumPriceController);
    final maximum = _priceValue(_maximumPriceController);
    if ((_minimumPriceController.text.trim().isNotEmpty && minimum == null) ||
        (_maximumPriceController.text.trim().isNotEmpty && maximum == null) ||
        (minimum != null && minimum < 0) ||
        (maximum != null && maximum < 0) ||
        (minimum != null && maximum != null && minimum > maximum)) {
      setState(() => _error = 'Check the price range.');
      return;
    }

    final currency = _currencyController.text.trim().toUpperCase();
    final country = _countryController.text.trim().toUpperCase();
    if ((currency.isNotEmpty && currency.length != 3) ||
        (country.isNotEmpty && country.length != 2)) {
      setState(() => _error = 'Check the currency and country codes.');
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
        city: _cityController.text.trim().isEmpty
            ? null
            : _cityController.text.trim(),
        fulfilment: _fulfilment,
      ),
    );
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
              label: text.city,
              controller: _cityController,
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
  });

  final String label;
  final String? value;
  final Map<String, String> items;
  final String anyLabel;
  final ValueChanged<String?> onChanged;

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
      decoration: InputDecoration(
        labelText: label,
        filled: true,
        fillColor: Colors.white,
        border: const OutlineInputBorder(),
      ),
    );
  }
}
