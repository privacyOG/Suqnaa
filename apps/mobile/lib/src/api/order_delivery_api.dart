import 'authed_api.dart';

final _uuidPattern = RegExp(
  r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
);

class MobileShippingOption {
  const MobileShippingOption({
    required this.id,
    required this.label,
    required this.amount,
    required this.currencyCode,
    required this.carrier,
    required this.etaMinDays,
    required this.etaMaxDays,
  });
  final String id;
  final String label;
  final String amount;
  final String currencyCode;
  final String? carrier;
  final int? etaMinDays;
  final int? etaMaxDays;

  factory MobileShippingOption.fromJson(Map<String, dynamic> json) {
    final id = json['id'];
    final label = json['label'];
    final rawAmount = json['amount'];
    final amount = rawAmount is num ? rawAmount.toString() : rawAmount?.toString();
    final currency = json['currencyCode'];
    if (id is! String || !_uuidPattern.hasMatch(id) ||
        label is! String || label.isEmpty || amount == null || num.tryParse(amount) == null ||
        currency is! String || !RegExp(r'^[A-Z]{3}$').hasMatch(currency)) {
      throw const FormatException('Invalid shipping option');
    }
    return MobileShippingOption(
      id: id,
      label: label,
      amount: amount,
      currencyCode: currency,
      carrier: json['carrier'] as String?,
      etaMinDays: json['etaMinDays'] as int?,
      etaMaxDays: json['etaMaxDays'] as int?,
    );
  }
}

class MobileOrderAddress {
  const MobileOrderAddress({
    required this.line1,
    required this.line2,
    required this.locality,
    required this.region,
    required this.postalCode,
    required this.countryCode,
  });
  final String line1;
  final String? line2;
  final String locality;
  final String region;
  final String postalCode;
  final String countryCode;

  factory MobileOrderAddress.fromJson(Map<String, dynamic> json) {
    final line1 = json['line1'];
    final locality = json['locality'];
    final region = json['region'];
    final postal = json['postalCode'];
    final country = json['countryCode'];
    if (line1 is! String || locality is! String || region is! String ||
        postal is! String || country is! String) {
      throw const FormatException('Invalid order address');
    }
    return MobileOrderAddress(
      line1: line1,
      line2: json['line2'] as String?,
      locality: locality,
      region: region,
      postalCode: postal,
      countryCode: country,
    );
  }
}

class MobileOrderDeliveryContext {
  const MobileOrderDeliveryContext({
    required this.orderId,
    required this.role,
    required this.mode,
    required this.itemAmount,
    required this.shippingAmount,
    required this.totalAmount,
    required this.currencyCode,
    required this.shippingAddress,
    required this.pickupAddress,
    required this.pickupInstructions,
    required this.fulfilmentStatus,
    required this.trackingReference,
    required this.trackingUrl,
  });
  final String orderId;
  final String role;
  final String? mode;
  final String itemAmount;
  final String shippingAmount;
  final String totalAmount;
  final String currencyCode;
  final MobileOrderAddress? shippingAddress;
  final MobileOrderAddress? pickupAddress;
  final String? pickupInstructions;
  final String? fulfilmentStatus;
  final String? trackingReference;
  final Uri? trackingUrl;
  bool get configured => mode == 'shipping' || mode == 'pickup';

  factory MobileOrderDeliveryContext.fromJson(Map<String, dynamic> json) {
    String amount(Object? value) {
      final result = value is num ? value.toString() : value?.toString();
      if (result == null || num.tryParse(result) == null) {
        throw const FormatException('Invalid delivery amount');
      }
      return result;
    }
    final orderId = json['orderId'];
    final role = json['role'];
    final pricing = json['pricing'];
    final delivery = json['delivery'];
    final fulfilment = json['fulfilment'];
    if (orderId is! String || !_uuidPattern.hasMatch(orderId) ||
        (role != 'buyer' && role != 'seller') || pricing is! Map) {
      throw const FormatException('Invalid delivery context');
    }
    final pricingMap = Map<String, dynamic>.from(pricing);
    final currency = pricingMap['currencyCode'];
    if (currency is! String || !RegExp(r'^[A-Z]{3}$').hasMatch(currency)) {
      throw const FormatException('Invalid delivery currency');
    }

    String? mode;
    MobileOrderAddress? shippingAddress;
    MobileOrderAddress? pickupAddress;
    String? pickupInstructions;
    if (delivery != null) {
      if (delivery is! Map) throw const FormatException('Invalid delivery details');
      final map = Map<String, dynamic>.from(delivery);
      final rawMode = map['mode'];
      if (rawMode != 'shipping' && rawMode != 'pickup') {
        throw const FormatException('Invalid fulfilment mode');
      }
      mode = rawMode as String;
      if (map['shippingAddress'] is Map) {
        shippingAddress = MobileOrderAddress.fromJson(Map<String, dynamic>.from(map['shippingAddress'] as Map));
      }
      if (map['pickupAddress'] is Map) {
        pickupAddress = MobileOrderAddress.fromJson(Map<String, dynamic>.from(map['pickupAddress'] as Map));
      }
      pickupInstructions = map['pickupInstructions'] as String?;
    }

    String? fulfilmentStatus;
    String? trackingReference;
    Uri? trackingUrl;
    if (fulfilment is Map) {
      final map = Map<String, dynamic>.from(fulfilment);
      fulfilmentStatus = map['status'] as String?;
      trackingReference = map['trackingReference'] as String?;
      final rawUrl = map['trackingUrl'];
      if (rawUrl is String) {
        final parsed = Uri.tryParse(rawUrl);
        if (parsed == null || parsed.scheme != 'https' || parsed.userInfo.isNotEmpty) {
          throw const FormatException('Invalid tracking URL');
        }
        trackingUrl = parsed;
      }
    }

    return MobileOrderDeliveryContext(
      orderId: orderId,
      role: role as String,
      mode: mode,
      itemAmount: amount(pricingMap['itemAmount']),
      shippingAmount: amount(pricingMap['shippingAmount']),
      totalAmount: amount(pricingMap['totalAmount']),
      currencyCode: currency,
      shippingAddress: shippingAddress,
      pickupAddress: pickupAddress,
      pickupInstructions: pickupInstructions,
      fulfilmentStatus: fulfilmentStatus,
      trackingReference: trackingReference,
      trackingUrl: trackingUrl,
    );
  }
}

abstract interface class OrderDeliveryGateway {
  Future<MobileOrderDeliveryContext> fetch(String accessToken, {required String orderId});
  Future<List<MobileShippingOption>> shippingOptions(String accessToken, {required String listingId});
  Future<MobileOrderDeliveryContext> configurePickup(String accessToken, {required String orderId});
  Future<MobileOrderDeliveryContext> configureShipping(
    String accessToken, {
    required String orderId,
    required String shippingOptionId,
    required String recipientName,
    required String line1,
    String? line2,
    required String locality,
    required String region,
    required String postalCode,
  });
  Future<void> setPickupDetails(
    String accessToken, {
    required String orderId,
    required String line1,
    String? line2,
    required String locality,
    required String region,
    required String postalCode,
    String? instructions,
  });
  Future<String> issuePickupProof(String accessToken, {required String orderId});
  Future<void> verifyPickupProof(String accessToken, {required String orderId, required String code});
  Future<void> submitDeliveryEvidence(
    String accessToken, {
    required String orderId,
    required String note,
    String? evidenceUrl,
  });
}

class OrderDeliveryApi implements OrderDeliveryGateway {
  const OrderDeliveryApi({required AuthedApi authedApi}) : _api = authedApi;
  final AuthedApi _api;

  String _id(String value) {
    final normalized = value.trim();
    if (!_uuidPattern.hasMatch(normalized)) throw ArgumentError('Identifier must be UUID');
    return normalized;
  }

  @override
  Future<MobileOrderDeliveryContext> fetch(String accessToken, {required String orderId}) async {
    final payload = await _api.get('/v1/market/orders/${_id(orderId)}/delivery', accessToken);
    return MobileOrderDeliveryContext.fromJson(payload);
  }

  @override
  Future<List<MobileShippingOption>> shippingOptions(String accessToken, {required String listingId}) async {
    final payload = await _api.get('/v1/listings/${_id(listingId)}/shipping-options', accessToken);
    final raw = payload['options'];
    if (raw is! List) throw const FormatException('Invalid shipping options');
    return raw.map((value) {
      if (value is! Map) throw const FormatException('Invalid shipping option');
      return MobileShippingOption.fromJson(Map<String, dynamic>.from(value));
    }).toList(growable: false);
  }

  @override
  Future<MobileOrderDeliveryContext> configurePickup(String accessToken, {required String orderId}) async {
    await _api.post('/v1/market/orders/${_id(orderId)}/delivery', accessToken, {'mode': 'pickup'});
    return fetch(accessToken, orderId: orderId);
  }

  @override
  Future<MobileOrderDeliveryContext> configureShipping(
    String accessToken, {
    required String orderId,
    required String shippingOptionId,
    required String recipientName,
    required String line1,
    String? line2,
    required String locality,
    required String region,
    required String postalCode,
  }) async {
    await _api.post('/v1/market/orders/${_id(orderId)}/delivery', accessToken, {
      'mode': 'shipping',
      'shippingOptionId': _id(shippingOptionId),
      'recipientName': recipientName.trim(),
      'address': {
        'line1': line1.trim(),
        if (line2?.trim().isNotEmpty == true) 'line2': line2!.trim(),
        'locality': locality.trim(),
        'region': region.trim(),
        'postalCode': postalCode.trim(),
        'countryCode': 'AU',
      },
    });
    return fetch(accessToken, orderId: orderId);
  }

  @override
  Future<void> setPickupDetails(
    String accessToken, {
    required String orderId,
    required String line1,
    String? line2,
    required String locality,
    required String region,
    required String postalCode,
    String? instructions,
  }) async {
    await _api.post('/v1/market/orders/${_id(orderId)}/pickup-details', accessToken, {
      'address': {
        'line1': line1.trim(),
        if (line2?.trim().isNotEmpty == true) 'line2': line2!.trim(),
        'locality': locality.trim(),
        'region': region.trim(),
        'postalCode': postalCode.trim(),
        'countryCode': 'AU',
      },
      if (instructions?.trim().isNotEmpty == true) 'instructions': instructions!.trim(),
    });
  }

  @override
  Future<String> issuePickupProof(String accessToken, {required String orderId}) async {
    final payload = await _api.post('/v1/market/orders/${_id(orderId)}/pickup-proof', accessToken, const {});
    final proof = payload['pickupProof'];
    if (proof is! Map || proof['code'] is! String) throw const FormatException('Invalid pickup proof');
    return proof['code'] as String;
  }

  @override
  Future<void> verifyPickupProof(String accessToken, {required String orderId, required String code}) async {
    await _api.post('/v1/market/orders/${_id(orderId)}/pickup-proof/verify', accessToken, {'code': code.trim()});
  }

  @override
  Future<void> submitDeliveryEvidence(
    String accessToken, {
    required String orderId,
    required String note,
    String? evidenceUrl,
  }) async {
    await _api.post('/v1/market/orders/${_id(orderId)}/delivery-evidence', accessToken, {
      'note': note.trim(),
      if (evidenceUrl?.trim().isNotEmpty == true) 'evidenceUrl': evidenceUrl!.trim(),
    });
  }
}
