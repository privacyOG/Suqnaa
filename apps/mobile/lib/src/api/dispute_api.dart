import 'dart:typed_data';
import 'authed_api.dart';

final _uuidPattern = RegExp(r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$');
const disputeCategories = ['non_delivery', 'item_condition', 'damage', 'pickup_issue', 'payment_issue', 'other'];

class MobileDisputeSummary {
  const MobileDisputeSummary({
    required this.id,
    required this.orderId,
    required this.category,
    required this.status,
    required this.outcome,
    required this.reason,
    required this.responseDueAt,
    required this.reviewDueAt,
    required this.appealDeadlineAt,
  });
  final String id;
  final String orderId;
  final String category;
  final String status;
  final String outcome;
  final String reason;
  final DateTime responseDueAt;
  final DateTime reviewDueAt;
  final DateTime? appealDeadlineAt;

  factory MobileDisputeSummary.fromJson(Map<String, dynamic> json) {
    final id = json['id'];
    final orderId = json['orderId'];
    final category = json['category'];
    final status = json['status'];
    final outcome = json['outcome'];
    final reason = json['reason'];
    final responseDue = DateTime.tryParse(json['responseDueAt']?.toString() ?? '');
    final reviewDue = DateTime.tryParse(json['reviewDueAt']?.toString() ?? '');
    if (id is! String || !_uuidPattern.hasMatch(id) || orderId is! String || !_uuidPattern.hasMatch(orderId) ||
        category is! String || !disputeCategories.contains(category) || status is! String || outcome is! String ||
        reason is! String || responseDue == null || reviewDue == null) {
      throw const FormatException('Invalid dispute summary');
    }
    final appealRaw = json['appealDeadlineAt'];
    final appealDeadline = appealRaw == null ? null : DateTime.tryParse(appealRaw.toString());
    if (appealRaw != null && appealDeadline == null) throw const FormatException('Invalid appeal deadline');
    return MobileDisputeSummary(
      id: id,
      orderId: orderId,
      category: category,
      status: status,
      outcome: outcome,
      reason: reason,
      responseDueAt: responseDue,
      reviewDueAt: reviewDue,
      appealDeadlineAt: appealDeadline,
    );
  }
}

class MobileDisputeDetail {
  const MobileDisputeDetail({required this.dispute, required this.responses, required this.evidence, required this.appealStatus, required this.paymentOperationStatus});
  final MobileDisputeSummary dispute;
  final List<String> responses;
  final List<MobileDisputeEvidence> evidence;
  final String? appealStatus;
  final String? paymentOperationStatus;

  factory MobileDisputeDetail.fromJson(Map<String, dynamic> json) {
    if (json['dispute'] is! Map || json['responses'] is! List || json['evidence'] is! List) {
      throw const FormatException('Invalid dispute detail');
    }
    final responses = (json['responses'] as List).map((entry) {
      if (entry is! Map || entry['responseText'] is! String) throw const FormatException('Invalid dispute response');
      return entry['responseText'] as String;
    }).toList(growable: false);
    final evidence = (json['evidence'] as List).map((entry) {
      if (entry is! Map) throw const FormatException('Invalid dispute evidence');
      return MobileDisputeEvidence.fromJson(Map<String, dynamic>.from(entry));
    }).toList(growable: false);
    final appeal = json['appeal'];
    final operation = json['paymentOperation'];
    return MobileDisputeDetail(
      dispute: MobileDisputeSummary.fromJson(Map<String, dynamic>.from(json['dispute'] as Map)),
      responses: responses,
      evidence: evidence,
      appealStatus: appeal is Map ? appeal['status']?.toString() : null,
      paymentOperationStatus: operation is Map ? operation['status']?.toString() : null,
    );
  }
}

class MobileDisputeEvidence {
  const MobileDisputeEvidence({required this.id, required this.type, required this.filename, required this.textValue, required this.downloadPath});
  final String id;
  final String type;
  final String? filename;
  final String? textValue;
  final String? downloadPath;

  factory MobileDisputeEvidence.fromJson(Map<String, dynamic> json) {
    final id = json['id'];
    final type = json['type'];
    if (id is! String || !_uuidPattern.hasMatch(id) || type is! String) throw const FormatException('Invalid dispute evidence');
    final path = json['downloadPath'];
    if (path != null && (path is! String || !path.startsWith('/v1/market/disputes/'))) throw const FormatException('Invalid private evidence path');
    return MobileDisputeEvidence(id: id, type: type, filename: json['filename'] as String?, textValue: json['textValue'] as String?, downloadPath: path as String?);
  }
}

abstract interface class DisputeGateway {
  Future<List<MobileDisputeSummary>> list(String accessToken);
  Future<MobileDisputeDetail> detail(String accessToken, String disputeId);
  Future<MobileDisputeSummary> open(String accessToken, {required String orderId, required String category, required String reason});
  Future<void> respond(String accessToken, {required String disputeId, required String responseText});
  Future<void> addTextEvidence(String accessToken, {required String disputeId, required String text});
  Future<void> uploadImageEvidence(String accessToken, {required String disputeId, required String filename, required String contentType, required Uint8List bytes});
  Future<void> appeal(String accessToken, {required String disputeId, required String reason});
}

class DisputeApi implements DisputeGateway {
  const DisputeApi({required AuthedApi authedApi}) : _api = authedApi;
  final AuthedApi _api;

  String _id(String value) {
    final result = value.trim();
    if (!_uuidPattern.hasMatch(result)) throw const FormatException('Invalid identifier');
    return result;
  }

  @override
  Future<List<MobileDisputeSummary>> list(String accessToken) async {
    final json = await _api.get('/v1/market/disputes?limit=100', accessToken);
    final rows = json['disputes'];
    if (rows is! List) throw const FormatException('Invalid dispute list');
    return rows.map((row) {
      if (row is! Map) throw const FormatException('Invalid dispute list row');
      return MobileDisputeSummary.fromJson(Map<String, dynamic>.from(row));
    }).toList(growable: false);
  }

  @override
  Future<MobileDisputeDetail> detail(String accessToken, String disputeId) async {
    return MobileDisputeDetail.fromJson(await _api.get('/v1/market/disputes/${_id(disputeId)}', accessToken));
  }

  @override
  Future<MobileDisputeSummary> open(String accessToken, {required String orderId, required String category, required String reason}) async {
    if (!disputeCategories.contains(category)) throw const FormatException('Invalid dispute category');
    final trimmed = reason.trim();
    if (trimmed.length < 20 || trimmed.length > 4000) throw const FormatException('Invalid dispute reason');
    final json = await _api.post('/v1/market/disputes', accessToken, {'orderId': _id(orderId), 'category': category, 'reason': trimmed});
    if (json['dispute'] is! Map) throw const FormatException('Invalid opened dispute');
    return MobileDisputeSummary.fromJson(Map<String, dynamic>.from(json['dispute'] as Map));
  }

  @override
  Future<void> respond(String accessToken, {required String disputeId, required String responseText}) async {
    final text = responseText.trim();
    if (text.length < 10 || text.length > 6000) throw const FormatException('Invalid dispute response');
    await _api.post('/v1/market/disputes/${_id(disputeId)}/responses', accessToken, {'responseText': text});
  }

  @override
  Future<void> addTextEvidence(String accessToken, {required String disputeId, required String text}) async {
    final value = text.trim();
    if (value.length < 3 || value.length > 10000) throw const FormatException('Invalid text evidence');
    await _api.post('/v1/market/disputes/${_id(disputeId)}/evidence/text', accessToken, {'evidenceType': 'participant_statement', 'text': value});
  }

  @override
  Future<void> uploadImageEvidence(String accessToken, {required String disputeId, required String filename, required String contentType, required Uint8List bytes}) async {
    if (!['image/jpeg', 'image/png', 'image/webp'].contains(contentType) || bytes.isEmpty || bytes.length > 10 * 1024 * 1024) {
      throw const FormatException('Invalid image evidence');
    }
    final query = Uri(queryParameters: {'evidenceType': 'participant_image', 'filename': filename.trim()}).query;
    await _api.postBinaryWithHeaders('/v1/market/disputes/${_id(disputeId)}/evidence/upload?$query', accessToken, bytes, contentType: contentType);
  }

  @override
  Future<void> appeal(String accessToken, {required String disputeId, required String reason}) async {
    final value = reason.trim();
    if (value.length < 20 || value.length > 4000) throw const FormatException('Invalid appeal reason');
    await _api.post('/v1/market/disputes/${_id(disputeId)}/appeal', accessToken, {'reason': value});
  }
}
