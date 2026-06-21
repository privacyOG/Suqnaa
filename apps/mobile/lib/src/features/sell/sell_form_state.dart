class SellFormState {
  const SellFormState({
    required this.title,
    required this.description,
    required this.price,
    required this.currency,
  });

  final String title;
  final String description;
  final String price;
  final String currency;

  double? get parsedPrice => double.tryParse(price.trim());

  bool get isValid {
    return title.trim().isNotEmpty && description.trim().isNotEmpty && parsedPrice != null && currency.trim().length == 3;
  }
}
