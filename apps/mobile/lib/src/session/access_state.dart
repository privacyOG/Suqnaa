class AccessState {
  const AccessState({required this.value, this.expiresAt});

  final String value;
  final String? expiresAt;

  bool get isPresent => value.isNotEmpty;

  Map<String, String> get headers => {'authorization': 'Bearer $value'};
}
