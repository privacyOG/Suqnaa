import 'dart:async';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../../api/dispute_api.dart';
import '../../api/order_activity_api.dart';
import '../../api/session_authed_api.dart';
import '../../brand/brand.dart';
import '../../config/mobile_environment.dart';
import '../../session/app_session.dart';
import '../../session/session_scope.dart';
import '../safety/contextual_safety_guidance.dart';
import 'order_protection_panel.dart';

class DisputeScreen extends StatefulWidget {
  const DisputeScreen({super.key, this.disputeGateway, this.orderGateway, this.accessToken});
  final DisputeGateway? disputeGateway;
  final OrderActivityGateway? orderGateway;
  final String? accessToken;

  @override
  State<DisputeScreen> createState() => _DisputeScreenState();
}

class _DisputeScreenState extends State<DisputeScreen> {
  DisputeGateway? _disputes;
  OrderActivityGateway? _orders;
  AppSession? _session;
  bool _initialized = false;
  bool _loading = false;
  String? _error;
  List<OrderActivity> _eligibleOrders = const [];
  List<MobileDisputeSummary> _cases = const [];

  String get _token => widget.accessToken ?? _session?.access.value ?? '';

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialized) return;
    _initialized = true;
    if (widget.disputeGateway != null && widget.orderGateway != null) {
      _disputes = widget.disputeGateway;
      _orders = widget.orderGateway;
    } else {
      final session = SessionScope.of(context);
      final authed = SessionAuthedApi(baseUrl: Uri.parse(MobileEnvironment.apiBaseUrl), sessionProvider: () => session);
      _session = session;
      _disputes = widget.disputeGateway ?? DisputeApi(authedApi: authed);
      _orders = widget.orderGateway ?? OrderActivityApi(authedApi: authed);
    }
    unawaited(_reload());
  }

  Future<void> _reload() async {
    if (_loading || _token.isEmpty || _disputes == null || _orders == null) return;
    setState(() { _loading = true; _error = null; });
    try {
      final pages = await Future.wait([
        _orders!.fetchPage(_token, status: OrderActivityStatus.paid, limit: 50),
        _orders!.fetchPage(_token, status: OrderActivityStatus.released, limit: 50),
        _orders!.fetchPage(_token, status: OrderActivityStatus.disputed, limit: 50),
      ]);
      final cases = await _disputes!.list(_token);
      if (!mounted) return;
      final byId = <String, OrderActivity>{};
      for (final page in pages) {
        for (final order in page.orders) { byId[order.id] = order; }
      }
      setState(() { _eligibleOrders = byId.values.toList(growable: false); _cases = cases; });
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _openCase(OrderActivity order) async {
    final ar = Localizations.localeOf(context).languageCode == 'ar';
    String category = disputeCategories.first;
    final reason = TextEditingController();
    final accepted = await showDialog<bool>(context: context, builder: (context) => StatefulBuilder(builder: (context, setDialogState) => AlertDialog(
      title: Text(ar ? 'فتح نزاع' : 'Open dispute'),
      content: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const ContextualSafetyGuidance(
            decisionPoint: SafetyDecisionPoint.dispute,
            margin: EdgeInsets.only(bottom: 12),
          ),
          DropdownButtonFormField<String>(value: category, items: disputeCategories.map((value) => DropdownMenuItem(value: value, child: Text(_category(value, ar)))).toList(), onChanged: (value) { if (value != null) setDialogState(() => category = value); }),
          const SizedBox(height: 12),
          TextField(controller: reason, minLines: 3, maxLines: 6, maxLength: 4000, decoration: InputDecoration(labelText: ar ? 'اشرح المشكلة (20 حرفاً على الأقل)' : 'Describe the problem (at least 20 characters)')),
        ]),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: Text(ar ? 'إلغاء' : 'Cancel')),
        FilledButton(onPressed: () => Navigator.pop(context, true), child: Text(ar ? 'فتح' : 'Open')),
      ],
    )));
    if (accepted != true) return;
    try {
      await _disputes!.open(_token, orderId: order.id, category: category, reason: reason.text);
      await _reload();
    } catch (error) { if (mounted) _showError(error); }
  }

  Future<void> _showCase(MobileDisputeSummary summary) async {
    try {
      final detail = await _disputes!.detail(_token, summary.id);
      if (!mounted) return;
      await Navigator.of(context).push(MaterialPageRoute(builder: (_) => _DisputeDetailScreen(gateway: _disputes!, accessToken: _token, detail: detail)));
      await _reload();
    } catch (error) { if (mounted) _showError(error); }
  }

  void _showError(Object error) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.toString())));
  }

  String _category(String value, bool ar) {
    const en = {'non_delivery':'Non-delivery','item_condition':'Item condition','damage':'Damage','pickup_issue':'Pickup issue','payment_issue':'Payment issue','other':'Other'};
    const arMap = {'non_delivery':'عدم التسليم','item_condition':'حالة السلعة','damage':'تلف','pickup_issue':'مشكلة الاستلام','payment_issue':'مشكلة الدفع','other':'أخرى'};
    return (ar ? arMap : en)[value] ?? value;
  }

  @override
  Widget build(BuildContext context) {
    final ar = Localizations.localeOf(context).languageCode == 'ar';
    final activeOrderIds = _cases.where((item) => !['resolved','closed'].contains(item.status)).map((item) => item.orderId).toSet();
    return Scaffold(
      backgroundColor: SuqnaaBrand.ivory,
      appBar: AppBar(title: Text(ar ? 'النزاعات' : 'Disputes'), backgroundColor: SuqnaaBrand.ivory),
      body: RefreshIndicator(onRefresh: _reload, child: ListView(padding: const EdgeInsets.all(16), children: [
        Text(ar ? 'حماية المعاملة' : 'Transaction protection', style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900, color: SuqnaaBrand.blue)),
        const SizedBox(height: 8),
        Text(ar ? 'النزاع النشط يوقف تسوية البائع. الاسترداد أو تحرير الأموال يحتاجان إلى موافقة دفع منفصلة.' : 'An active dispute blocks seller settlement. Refunds or fund release still require separate payment approval.'),
        const ContextualSafetyGuidance(
          decisionPoint: SafetyDecisionPoint.dispute,
          margin: EdgeInsets.only(top: 12, bottom: 4),
        ),
        if (_loading) const Padding(padding: EdgeInsets.all(20), child: Center(child: CircularProgressIndicator())),
        if (_error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(_error!, style: const TextStyle(color: Colors.red))),
        if (_cases.isNotEmpty) ...[
          const SizedBox(height: 20),
          Text(ar ? 'نزاعاتي' : 'My disputes', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          ..._cases.map((item) => Card(child: ListTile(
            key: Key('dispute-${item.id}'),
            title: Text(_category(item.category, ar)),
            subtitle: Text('${item.status.replaceAll('_', ' ')}\n${item.reason}'),
            isThreeLine: true,
            trailing: const Icon(Icons.chevron_right),
            onTap: () => _showCase(item),
          ))),
        ],
        const SizedBox(height: 20),
        Text(ar ? 'الطلبات المؤهلة' : 'Eligible orders', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
        ..._eligibleOrders.where((order) => !activeOrderIds.contains(order.id)).map((order) => Card(child: ListTile(
          title: Text(order.listing?.title ?? (ar ? 'طلب سوقنا' : 'Suqnaa order')),
          subtitle: Text('${order.amount} ${order.currencyCode} · ${order.status.wireValue}'),
          trailing: TextButton(onPressed: () => _openCase(order), child: Text(ar ? 'فتح نزاع' : 'Open dispute')),
        ))),
      ])),
    );
  }
}

class _DisputeDetailScreen extends StatefulWidget {
  const _DisputeDetailScreen({required this.gateway, required this.accessToken, required this.detail});
  final DisputeGateway gateway;
  final String accessToken;
  final MobileDisputeDetail detail;
  @override State<_DisputeDetailScreen> createState() => _DisputeDetailScreenState();
}

class _DisputeDetailScreenState extends State<_DisputeDetailScreen> {
  late MobileDisputeDetail _detail = widget.detail;
  bool _busy = false;

  Future<void> _refresh() async { final next = await widget.gateway.detail(widget.accessToken, _detail.dispute.id); if (mounted) setState(() => _detail = next); }

  Future<String?> _textDialog(String title, {required int minLength, required int maxLength}) async {
    final controller = TextEditingController();
    return showDialog<String>(context: context, builder: (context) => AlertDialog(title: Text(title), content: TextField(controller: controller, minLines: 3, maxLines: 7, maxLength: maxLength), actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')), FilledButton(onPressed: () { final value = controller.text.trim(); Navigator.pop(context, value.length >= minLength ? value : null); }, child: const Text('Submit'))]));
  }

  Future<void> _run(Future<void> Function() action) async { setState(() => _busy = true); try { await action(); await _refresh(); } catch (error) { if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.toString()))); } finally { if (mounted) setState(() => _busy = false); } }

  Future<void> _pickImage() async {
    final image = await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 90, maxWidth: 4096, maxHeight: 4096);
    if (image == null) return;
    final bytes = await image.readAsBytes();
    final lower = image.name.toLowerCase();
    final mime = lower.endsWith('.png') ? 'image/png' : lower.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    await _run(() => widget.gateway.uploadImageEvidence(widget.accessToken, disputeId: _detail.dispute.id, filename: image.name, contentType: mime, bytes: bytes));
  }

  @override
  Widget build(BuildContext context) {
    final ar = Localizations.localeOf(context).languageCode == 'ar';
    final dispute = _detail.dispute;
    final canAppeal = dispute.status == 'resolved' && _detail.appealStatus == null && dispute.appealDeadlineAt != null && dispute.appealDeadlineAt!.isAfter(DateTime.now());
    return Scaffold(appBar: AppBar(title: Text(ar ? 'تفاصيل النزاع' : 'Dispute detail')), body: ListView(padding: const EdgeInsets.all(16), children: [
      Text(dispute.category.replaceAll('_', ' '), style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
      Text('${dispute.status.replaceAll('_', ' ')} · ${dispute.outcome.replaceAll('_', ' ')}'),
      const SizedBox(height: 12), Text(dispute.reason),
      const ContextualSafetyGuidance(
        decisionPoint: SafetyDecisionPoint.dispute,
        margin: EdgeInsets.only(top: 12, bottom: 4),
      ),
      const SizedBox(height: 12), Text('${ar ? 'مهلة الرد' : 'Response due'}: ${dispute.responseDueAt.toLocal()}'),
      if (_detail.paymentOperationStatus != null) Text('${ar ? 'إجراء الدفع' : 'Payment operation'}: ${_detail.paymentOperationStatus}'),
      OrderProtectionPanel(orderId: dispute.orderId),
      if (_detail.responses.isNotEmpty) ...[const Divider(), Text(ar ? 'الردود' : 'Responses', style: const TextStyle(fontWeight: FontWeight.bold)), ..._detail.responses.map((text) => Padding(padding: const EdgeInsets.symmetric(vertical: 4), child: Text(text)))],
      if (_detail.evidence.isNotEmpty) ...[const Divider(), Text(ar ? 'الأدلة' : 'Evidence', style: const TextStyle(fontWeight: FontWeight.bold)), ..._detail.evidence.map((item) => ListTile(contentPadding: EdgeInsets.zero, leading: Icon(item.downloadPath == null ? Icons.notes : Icons.lock_outline), title: Text(item.textValue ?? item.filename ?? item.type), subtitle: item.downloadPath == null ? null : Text(ar ? 'ملف خاص - التنزيل متاح عبر الويب المحمي' : 'Private file - download available through protected web')))],
      if (!['resolved','closed'].contains(dispute.status)) ...[
        const SizedBox(height: 12),
        FilledButton(onPressed: _busy ? null : () async { final value = await _textDialog(ar ? 'إضافة رد' : 'Add response', minLength: 10, maxLength: 6000); if (value != null) await _run(() => widget.gateway.respond(widget.accessToken, disputeId: dispute.id, responseText: value)); }, child: Text(ar ? 'إضافة رد' : 'Add response')),
        OutlinedButton(onPressed: _busy ? null : () async { final value = await _textDialog(ar ? 'دليل نصي' : 'Text evidence', minLength: 3, maxLength: 10000); if (value != null) await _run(() => widget.gateway.addTextEvidence(widget.accessToken, disputeId: dispute.id, text: value)); }, child: Text(ar ? 'إضافة دليل نصي' : 'Add text evidence')),
        OutlinedButton(onPressed: _busy ? null : _pickImage, child: Text(ar ? 'رفع صورة دليل خاصة' : 'Upload private evidence image')),
      ],
      if (canAppeal) OutlinedButton(onPressed: _busy ? null : () async { final value = await _textDialog(ar ? 'سبب الاستئناف' : 'Appeal reason', minLength: 20, maxLength: 4000); if (value != null) await _run(() => widget.gateway.appeal(widget.accessToken, disputeId: dispute.id, reason: value)); }, child: Text(ar ? 'تقديم استئناف' : 'Submit appeal')),
      if (_detail.appealStatus != null) Text('${ar ? 'الاستئناف' : 'Appeal'}: ${_detail.appealStatus}'),
    ]));
  }
}
