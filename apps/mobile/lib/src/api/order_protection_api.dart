import 'authed_api.dart';

final _uuidPattern = RegExp(r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$');
const _returnStatuses = {
  'authorized',
  'awaiting_shipment',
  'in_transit',
  'delivered',
  'received',
  'contested',
  'resolved',
  'expired',
  'cancelled',
};

class MobileProtectionCase {
  const MobileProtectionCase({required this.id, required this.claimType, required this.policyVersion});
  final String id;
  final String claimType;
  final String policyVersion;

  factory MobileProtectionCase.fromJson(Map<String, dynamic> json) {
    final id = json['id'];
    final claimType = json['claim_type'];
    final policyVersion = json['policy_version'];
    if (id is! String || !_uuidPattern.hasMatch(id) || claimType is! String || claimType.isEmpty || policyVersion is! String || policyVersion.isEmpty) {
      throw const FormatException('Invalid protection case');
    }
    return MobileProtectionCase(id: id, claimType: claimType, policyVersion: policyVersion);
  }
}

class MobileOrderReturn {
  const MobileOrderReturn({
    required this.id,
    required this.buyerId,
    required this.sellerId,
    required this.status,
    required this.reason,
    required this.returnDueAt,
    required this.carrier,
    required this.trackingReference,
    required this.trackingUrl,
    required this.sellerCondition,
    required this.sellerConditionNote,
  });

  final String id;
  final String buyerId;
  final String sellerId;
  final String status;
  final String reason;
  final DateTime returnDueAt;
  final String? carrier;
  final String? trackingReference;
  final String? trackingUrl;
  final String? sellerCondition;
  final String? sellerConditionNote;

  factory MobileOrderReturn.fromJson(Map<String, dynamic> json) {
    final id = json['id'];
    final buyerId = json['buyer_id'];
    final sellerId = json['seller_id'];
    final status = json['status'];
    final reason = json['reason'];
    final due = DateTime.tryParse(json['return_due_at']?.toString() ?? '');
    if (id is! String || !_uuidPattern.hasMatch(id) || buyerId is! String || !_uuidPattern.hasMatch(buyerId) || sellerId is! String || !_uuidPattern.hasMatch(sellerId) || status is! String || !_returnStatuses.contains(status) || reason is! String || due == null) {
      throw const FormatException('Invalid order return');
    }
    final trackingUrl = json['tracking_url'];
    if (trackingUrl != null) {
      final parsed = Uri.tryParse(trackingUrl.toString());
      if (parsed == null || parsed.scheme != 'https' || parsed.host.isEmpty) {
        throw const FormatException('Invalid return tracking URL');
      }
    }
    return MobileOrderReturn(
      id: id,
      buyerId: buyerId,
      sellerId: sellerId,
      status: status,
      reason: reason,
      returnDueAt: due,
      carrier: json['carrier']?.toString(),
      trackingReference: json['tracking_reference']?.toString(),
      trackingUrl: trackingUrl?.toString(),
      sellerCondition: json['seller_condition']?.toString(),
      sellerConditionNote: json['seller_condition_note']?.toString(),
    );
  }
}

class MobileOrderProtection {
  const MobileOrderProtection({required this.cases, required this.returns});
  final List<MobileProtectionCase> cases;
  final List<MobileOrderReturn> returns;

  factory MobileOrderProtection.fromJson(Map<String, dynamic> json) {
    final casesRaw = json['cases'];
    final returnsRaw = json['returns'];
    if (casesRaw is! List || returnsRaw is! List) throw const FormatException('Invalid order protection snapshot');
    return MobileOrderProtection(
      cases: casesRaw.map((row) {
        if (row is! Map) throw const FormatException('Invalid protection case row');
        return MobileProtectionCase.fromJson(Map<String, dynamic>.from(row));
      }).toList(growable: false),
      returns: returnsRaw.map((row) {
        if (row is! Map) throw const FormatException('Invalid order return row');
        return MobileOrderReturn.fromJson(Map<String, dynamic>.from(row));
      }).toList(growable: false),
    );
  }
}

abstract interface class OrderProtectionGateway {
  Future<MobileOrderProtection> read(String accessToken, String orderId);
  Future<void> shipReturn(String accessToken, {required String returnId, required String carrier, required String trackingReference, String? trackingUrl});
  Future<void> acknowledgeReturn(String accessToken, {required String returnId, required String condition, String? note});
}

class OrderProtectionApi implements OrderProtectionGateway {
  const OrderProtectionApi({required AuthedApi authedApi}) : _api = authedApi;
  final AuthedApi _api;

  String _id(String value) {
    final result = value.trim();
    if (!_uuidPattern.hasMatch(result)) throw const FormatException('Invalid identifier');
    return result;
  }

  @override
  Future<MobileOrderProtection> read(String accessToken, String orderId) async {
    return MobileOrderProtection.fromJson(await _api.get('/v1/market/orders/${_id(orderId)}/protection', accessToken));
  }

  @override
  Future<void> shipReturn(String accessToken, {required String returnId, required String carrier, required String trackingReference, String? trackingUrl}) async {
    final carrierValue = carrier.trim();
    final trackingValue = trackingReference.trim();
    if (carrierValue.length < 2 || carrierValue.length > 80 || trackingValue.length < 2 || trackingValue.length > 200) {
      throw const FormatException('Invalid return shipment');
    }
    final urlValue = trackingUrl?.trim();
    if (urlValue != null && urlValue.isNotEmpty) {
      final parsed = Uri.tryParse(urlValue);
      if (parsed == null || parsed.scheme != 'https' || parsed.host.isEmpty) throw const FormatException('Tracking URL must use HTTPS');
    }
    await _api.post('/v1/market/returns/${_id(returnId)}/ship', accessToken, {
      'carrier': carrierValue,
      'trackingReference': trackingValue,
      if (urlValue != null && urlValue.isNotEmpty) 'trackingUrl': urlValue,
    });
  }

  @override
  Future<void> acknowledgeReturn(String accessToken, {required String returnId, required String condition, String? note}) async {
    if (condition != 'accepted' && condition != 'contested') throw const FormatException('Invalid return condition');
    final noteValue = note?.trim();
    if (condition == 'contested' && (noteValue == null || noteValue.length < 8 || noteValue.length > 4000)) {
      throw const FormatException('Contest note must be 8-4000 characters');
    }
    await _api.post('/v1/market/returns/${_id(returnId)}/receipt', accessToken, {
      'condition': condition,
      if (noteValue != null && noteValue.isNotEmpty) 'note': noteValue,
    });
  }
}
