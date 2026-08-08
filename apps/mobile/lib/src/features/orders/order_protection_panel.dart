import 'dart:async';
import 'package:flutter/material.dart';
import '../../api/order_protection_api.dart';
import '../../api/session_authed_api.dart';
import '../../config/mobile_environment.dart';
import '../../session/app_session.dart';
import '../../session/session_scope.dart';

class OrderProtectionPanel extends StatefulWidget {
  const OrderProtectionPanel({
    super.key,
    required this.orderId,
    this.gateway,
    this.accessToken,
    this.userId,
  });

  final String orderId;
  final OrderProtectionGateway? gateway;
  final String? accessToken;
  final String? userId;

  @override
  State<OrderProtectionPanel> createState() => _OrderProtectionPanelState();
}

class _OrderProtectionPanelState extends State<OrderProtectionPanel> {
  OrderProtectionGateway? _gateway;
  AppSession? _session;
  MobileOrderProtection? _snapshot;
  bool _initialized = false;
  bool _loading = false;
  bool _busy = false;
  String? _error;

  String get _token => widget.accessToken ?? _session?.access.value ?? '';
  String get _userId => widget.userId ?? _session?.userId ?? '';

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialized) return;
    _initialized = true;
    if (widget.gateway != null) {
      _gateway = widget.gateway;
    } else {
      final session = SessionScope.of(context);
      _session = session;
      _gateway = OrderProtectionApi(
        authedApi: SessionAuthedApi(
          baseUrl: Uri.parse(MobileEnvironment.apiBaseUrl),
          sessionProvider: () => session,
        ),
      );
    }
    unawaited(_reload());
  }

  Future<void> _reload() async {
    if (_loading || _gateway == null || _token.isEmpty) return;
    setState(() { _loading = true; _error = null; });
    try {
      final snapshot = await _gateway!.read(_token, widget.orderId);
      if (mounted) setState(() => _snapshot = snapshot);
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  MobileOrderReturn? get _currentReturn {
    final rows = _snapshot?.returns ?? const <MobileOrderReturn>[];
    for (final row in rows) {
      if (!{'resolved', 'expired', 'cancelled'}.contains(row.status)) return row;
    }
    return rows.isEmpty ? null : rows.first;
  }

  Future<void> _run(Future<void> Function() action) async {
    if (_busy) return;
    setState(() { _busy = true; _error = null; });
    try {
      await action();
      await _reload();
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _ship(MobileOrderReturn row, bool ar) async {
    final carrier = TextEditingController();
    final tracking = TextEditingController();
    final url = TextEditingController();
    final accepted = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(ar ? 'تسجيل شحن الإرجاع' : 'Record return shipment'),
        content: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            TextField(controller: carrier, maxLength: 80, decoration: InputDecoration(labelText: ar ? 'شركة الشحن' : 'Carrier')),
            TextField(controller: tracking, maxLength: 200, decoration: InputDecoration(labelText: ar ? 'رقم التتبع' : 'Tracking reference')),
            TextField(controller: url, maxLength: 1000, keyboardType: TextInputType.url, decoration: InputDecoration(labelText: ar ? 'رابط HTTPS اختياري' : 'Optional HTTPS tracking URL')),
          ]),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: Text(ar ? 'إلغاء' : 'Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: Text(ar ? 'حفظ' : 'Save')),
        ],
      ),
    );
    if (accepted != true) return;
    await _run(() => _gateway!.shipReturn(
      _token,
      returnId: row.id,
      carrier: carrier.text,
      trackingReference: tracking.text,
      trackingUrl: url.text,
    ));
  }

  Future<void> _contest(MobileOrderReturn row, bool ar) async {
    final note = TextEditingController();
    final accepted = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(ar ? 'الاعتراض على حالة الإرجاع' : 'Contest return condition'),
        content: TextField(
          controller: note,
          minLines: 3,
          maxLines: 7,
          maxLength: 4000,
          decoration: InputDecoration(labelText: ar ? 'اشرح المشكلة (8 أحرف على الأقل)' : 'Explain the issue (at least 8 characters)'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: Text(ar ? 'إلغاء' : 'Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: Text(ar ? 'إرسال' : 'Submit')),
        ],
      ),
    );
    if (accepted != true) return;
    await _run(() => _gateway!.acknowledgeReturn(_token, returnId: row.id, condition: 'contested', note: note.text));
  }

  String _status(String value, bool ar) {
    const en = {
      'authorized':'Return authorised', 'awaiting_shipment':'Awaiting shipment', 'in_transit':'Return in transit',
      'delivered':'Return delivered', 'received':'Seller accepted return', 'contested':'Return contested',
      'resolved':'Return resolved', 'expired':'Return window expired', 'cancelled':'Return cancelled'
    };
    const arMap = {
      'authorized':'تم السماح بالإرجاع', 'awaiting_shipment':'بانتظار الشحن', 'in_transit':'الإرجاع قيد الشحن',
      'delivered':'تم تسليم الإرجاع', 'received':'قبل البائع الإرجاع', 'contested':'الإرجاع محل اعتراض',
      'resolved':'تم حل الإرجاع', 'expired':'انتهت مهلة الإرجاع', 'cancelled':'تم إلغاء الإرجاع'
    };
    return (ar ? arMap : en)[value] ?? value.replaceAll('_', ' ');
  }

  @override
  Widget build(BuildContext context) {
    final ar = Localizations.localeOf(context).languageCode == 'ar';
    final snapshot = _snapshot;
    final row = _currentReturn;
    if (_loading && snapshot == null) {
      return const Padding(padding: EdgeInsets.symmetric(vertical: 12), child: Center(child: CircularProgressIndicator()));
    }
    if (snapshot == null || (snapshot.cases.isEmpty && snapshot.returns.isEmpty)) {
      return _error == null ? const SizedBox.shrink() : Padding(padding: const EdgeInsets.only(top: 12), child: Text(_error!, style: const TextStyle(color: Colors.red)));
    }

    final isBuyer = row?.buyerId == _userId;
    final isSeller = row?.sellerId == _userId;
    final canShip = row != null && isBuyer && {'authorized', 'awaiting_shipment'}.contains(row.status);
    final canReceive = row != null && isSeller && {'in_transit', 'delivered', 'received', 'contested'}.contains(row.status);

    return Card(
      margin: const EdgeInsets.only(top: 14),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(ar ? 'حماية المشتري والبائع' : 'Buyer & seller protection', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
          const SizedBox(height: 8),
          Text(ar ? 'الإرجاع لا ينقل الأموال تلقائياً. أي استرداد أو تحرير للبائع يحتاج إلى إجراء دفع معتمد بشكل منفصل.' : 'A return does not move money automatically. Any refund or seller release still requires a separately authorised payment operation.'),
          if (_error != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_error!, style: const TextStyle(color: Colors.red))),
          if (row != null) ...[
            const Divider(height: 24),
            Text(_status(row.status, ar), style: const TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 6),
            Text(row.reason),
            const SizedBox(height: 6),
            Text('${ar ? 'مهلة الشحن' : 'Ship by'}: ${row.returnDueAt.toLocal()}'),
            if (row.carrier != null) Text('${ar ? 'شركة الشحن' : 'Carrier'}: ${row.carrier}'),
            if (row.trackingReference != null) Text('${ar ? 'رقم التتبع' : 'Tracking'}: ${row.trackingReference}'),
            if (row.sellerConditionNote != null) Text('${ar ? 'ملاحظة البائع' : 'Seller note'}: ${row.sellerConditionNote}'),
            if (canShip) ...[
              const SizedBox(height: 12),
              FilledButton.icon(onPressed: _busy ? null : () => _ship(row, ar), icon: const Icon(Icons.local_shipping_outlined), label: Text(ar ? 'تسجيل شحن الإرجاع' : 'Record return shipment')),
            ],
            if (canReceive) ...[
              const SizedBox(height: 12),
              FilledButton(onPressed: _busy ? null : () => _run(() => _gateway!.acknowledgeReturn(_token, returnId: row.id, condition: 'accepted')), child: Text(ar ? 'قبول السلعة المعادة' : 'Accept returned item')),
              OutlinedButton(onPressed: _busy ? null : () => _contest(row, ar), child: Text(ar ? 'الاعتراض على حالة الإرجاع' : 'Contest return condition')),
            ],
          ] else
            Padding(padding: const EdgeInsets.only(top: 8), child: Text(ar ? 'تم تسجيل حالة حماية ولا يوجد إرجاع نشط.' : 'A protection case exists with no active return.')),
        ]),
      ),
    );
  }
}
