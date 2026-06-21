import 'dart:convert';

class AccessState {
  const AccessState({required this.value, this.expiresAt});

  final String value;
  final String? expiresAt;

  bool get isPresent => value.isNotEmpty;
  Map<String, String> get headers => {'authorization': 'Bearer $value'};

  DateTime? get expiresAtTime {
    final direct = expiresAt == null ? null : DateTime.tryParse(expiresAt!);
    return direct ?? _expiryFromToken(value);
  }

  bool shouldRefresh({Duration leadTime = const Duration(minutes: 2)}) {
    final expiry = expiresAtTime;
    if (!isPresent || expiry == null) {
      return false;
    }

    return expiry.isBefore(DateTime.now().toUtc().add(leadTime));
  }

  factory AccessState.fromToken(String token) {
    final expiry = _expiryFromToken(token);
    return AccessState(
      value: token,
      expiresAt: expiry?.toIso8601String(),
    );
  }

  static DateTime? _expiryFromToken(String token) {
    try {
      final parts = token.split('.');
      if (parts.length != 3) {
        return null;
      }

      final payload = utf8.decode(base64Url.decode(base64Url.normalize(parts[1])));
      final json = jsonDecode(payload);
      if (json is! Map || json['exp'] is! num) {
        return null;
      }

      return DateTime.fromMillisecondsSinceEpoch(
        (json['exp'] as num).toInt() * 1000,
        isUtc: true,
      );
    } catch (_) {
      return null;
    }
  }
}
