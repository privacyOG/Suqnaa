import 'dart:async';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../api/order_activity_api.dart';
import '../../api/order_delivery_api.dart';
import '../../api/session_authed_api.dart';
import '../../brand/brand.dart';
import '../../config/mobile_environment.dart';
import '../../session/app_session.dart';
import '../../session/session_scope.dart';

class DeliveryPickupScreen extends StatefulWidget {
  const DeliveryPickupScreen({
    super.key,
    this.orderGateway,
    this.deliveryGateway,
    this.accessToken,
  });

  final OrderActivityGateway? orderGateway;
  final OrderDeliveryGateway? deliveryGateway;
  final String? accessToken;

  @override
  State<DeliveryPickupScreen> createState() => _DeliveryPickupScreenState();
}

class _DeliveryEntry {
  const _DeliveryEntry(this.order, this.delivery);
  final OrderActivity order;
  final MobileOrderDeliveryContext delivery;
}

class _DeliveryPickupScreenState extends State<DeliveryPickupScreen> {
  final List<_DeliveryEntry> _entries = [];
  OrderActivityGateway? _orders;
  OrderDeliveryGateway? _delivery;
  AppSession? _session;
  bool _initialized = false;
  bool _loading = false;
  bool _failed = false;

  String get _token => widget.accessToken ?? _session?.access.value ?? '';

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialized) return;
    _initialized = true;
    if (widget.orderGateway != null && widget.deliveryGateway != null) {
      _orders = widget.orderGateway;
      _delivery = widget.deliveryGateway;
    } else {
      final session = SessionScope.of(context);
      final authed = SessionAuthedApi(
        baseUrl: Uri.parse(MobileEnvironment.apiBaseUrl),
        sessionProvider: () => session,
      );
      _session = session;
      _orders = widget.orderGateway ?? OrderActivityApi(authedApi: authed);
      _delivery = widget.deliveryGateway ?? OrderDeliveryApi(authedApi: authed);
    }
    unawaited(_reload());
  }

  Future<void> _reload() async {
    final orders = _orders;
    final delivery = _delivery;
    if (orders == null || delivery == null || _token.isEmpty || _loading) return;
    setState(() { _loading = true; _failed = false; });
    try {
      final pages = await Future.wait([
        orders.fetchPage(_token, status: OrderActivityStatus.pending, limit: 50),
        orders.fetchPage(_token, status: OrderActivityStatus.paid, limit: 50),
      ]);
      final all = <OrderActivity>[
        ...pages[0].orders,
        ...pages[1].orders,
      ];
      final contexts = await Future.wait(all.map((order) => delivery.fetch(_token, orderId: order.id)));
      if (!mounted) return;
      setState(() {
        _entries
          ..clear()
          ..addAll(List.generate(all.length, (index) => _DeliveryEntry(all[index], contexts[index])));
      });
    } catch (_) {
      if (mounted) setState(() => _failed = true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isArabic = Localizations.localeOf(context).languageCode == 'ar';
    return Scaffold(
      backgroundColor: SuqnaaBrand.ivory,
      appBar: AppBar(
        title: Text(isArabic ? 'التسليم والاستلام' : 'Delivery and pickup'),
        backgroundColor: SuqnaaBrand.ivory,
      ),
      body: RefreshIndicator(
        onRefresh: _reload,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              isArabic ? 'تفاصيل الإيفاء المحمية' : 'Protected fulfilment details',
              style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900, color: SuqnaaBrand.blue),
            ),
            const SizedBox(height: 8),
            Text(isArabic
                ? 'اختر الشحن أو الاستلام قبل الدفع. العنوان الكامل يبقى داخل الطلب المحمي فقط.'
                : 'Choose shipping or pickup before payment. Full addresses remain inside the protected order only.'),
            if (_loading) const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator())),
            if (_failed) Padding(
              padding: const EdgeInsets.only(top: 16),
              child: Text(isArabic ? 'تعذر تحميل تفاصيل التسليم.' : 'Delivery details could not be loaded.'),
            ),
            const SizedBox(height: 16),
            ..._entries.map((entry) => Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: _DeliveryCard(
                entry: entry,
                gateway: _delivery!,
                token: _token,
                onUpdated: _reload,
              ),
            )),
            if (!_loading && !_failed && _entries.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 48),
                child: Text(isArabic ? 'لا توجد طلبات تحتاج إجراءات تسليم.' : 'No orders currently need delivery actions.', textAlign: TextAlign.center),
              ),
          ],
        ),
      ),
    );
  }
}

class _DeliveryCard extends StatefulWidget {
  const _DeliveryCard({required this.entry, required this.gateway, required this.token, required this.onUpdated});
  final _DeliveryEntry entry;
  final OrderDeliveryGateway gateway;
  final String token;
  final Future<void> Function() onUpdated;

  @override
  State<_DeliveryCard> createState() => _DeliveryCardState();
}

class _DeliveryCardState extends State<_DeliveryCard> {
  bool _busy = false;
  String? _pickupCode;
  String? _error;

  String _amount(String value, String currency) {
    final parsed = num.tryParse(value);
    return parsed == null ? '$value $currency' : '${parsed.toStringAsFixed(2)} $currency';
  }

  String _address(MobileOrderAddress? address) {
    if (address == null) return '—';
    return [address.line1, address.line2, address.locality, address.region, address.postalCode, address.countryCode]
        .whereType<String>().where((value) => value.isNotEmpty).join(', ');
  }

  Future<void> _run(Future<void> Function() action) async {
    if (_busy) return;
    setState(() { _busy = true; _error = null; });
    try {
      await action();
      await widget.onUpdated();
    } catch (_) {
      if (mounted) setState(() => _error = 'Delivery action could not be completed.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _configure() async {
    final options = await widget.gateway.shippingOptions(widget.token, listingId: widget.entry.order.listingId).catchError((_) => <MobileShippingOption>[]);
    if (!mounted) return;
    var mode = options.isEmpty ? 'pickup' : 'shipping';
    var optionId = options.isEmpty ? '' : options.first.id;
    final recipient = TextEditingController();
    final line1 = TextEditingController();
    final line2 = TextEditingController();
    final locality = TextEditingController();
    final region = TextEditingController(text: 'NSW');
    final postcode = TextEditingController();
    final form = GlobalKey<FormState>();

    final accepted = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Delivery or pickup'),
          content: Form(
            key: form,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  DropdownButtonFormField<String>(
                    initialValue: mode,
                    items: [
                      if (options.isNotEmpty) const DropdownMenuItem(value: 'shipping', child: Text('Shipping')),
                      const DropdownMenuItem(value: 'pickup', child: Text('Pickup')),
                    ],
                    onChanged: (value) => setDialogState(() => mode = value ?? mode),
                    decoration: const InputDecoration(labelText: 'Fulfilment method'),
                  ),
                  if (mode == 'shipping') ...[
                    DropdownButtonFormField<String>(
                      initialValue: optionId,
                      items: options.map((option) => DropdownMenuItem(
                        value: option.id,
                        child: Text('${option.label} · ${_amount(option.amount, option.currencyCode)}'),
                      )).toList(),
                      onChanged: (value) => setDialogState(() => optionId = value ?? optionId),
                      decoration: const InputDecoration(labelText: 'Shipping method'),
                    ),
                    TextFormField(controller: recipient, decoration: const InputDecoration(labelText: 'Recipient name'), validator: (v) => (v?.trim().length ?? 0) < 2 ? 'Required' : null),
                    TextFormField(controller: line1, decoration: const InputDecoration(labelText: 'Address line 1'), validator: (v) => (v?.trim().length ?? 0) < 3 ? 'Required' : null),
                    TextFormField(controller: line2, decoration: const InputDecoration(labelText: 'Address line 2')),
                    TextFormField(controller: locality, decoration: const InputDecoration(labelText: 'Suburb / locality'), validator: (v) => (v?.trim().length ?? 0) < 2 ? 'Required' : null),
                    TextFormField(controller: region, decoration: const InputDecoration(labelText: 'State'), validator: (v) => (v?.trim().length ?? 0) < 2 ? 'Required' : null),
                    TextFormField(controller: postcode, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Postcode'), validator: (v) => RegExp(r'^\d{4}$').hasMatch(v?.trim() ?? '') ? null : 'Use four digits'),
                  ] else
                    const Padding(
                      padding: EdgeInsets.only(top: 12),
                      child: Text('The seller will disclose the exact pickup location after payment.'),
                    ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(dialogContext).pop(false), child: const Text('Cancel')),
            FilledButton(
              onPressed: () {
                if (mode == 'pickup' || form.currentState?.validate() == true) Navigator.of(dialogContext).pop(true);
              },
              child: const Text('Save'),
            ),
          ],
        ),
      ),
    );
    if (accepted != true || !mounted) return;
    await _run(() async {
      if (mode == 'pickup') {
        await widget.gateway.configurePickup(widget.token, orderId: widget.entry.order.id);
      } else {
        await widget.gateway.configureShipping(
          widget.token,
          orderId: widget.entry.order.id,
          shippingOptionId: optionId,
          recipientName: recipient.text,
          line1: line1.text,
          line2: line2.text,
          locality: locality.text,
          region: region.text,
          postalCode: postcode.text,
        );
      }
    });
  }

  Future<void> _pickupDetails() async {
    final line1 = TextEditingController();
    final line2 = TextEditingController();
    final locality = TextEditingController();
    final region = TextEditingController(text: 'NSW');
    final postcode = TextEditingController();
    final instructions = TextEditingController();
    final form = GlobalKey<FormState>();
    final accepted = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Exact pickup location'),
        content: Form(
          key: form,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextFormField(controller: line1, decoration: const InputDecoration(labelText: 'Address line 1'), validator: (v) => (v?.trim().length ?? 0) < 3 ? 'Required' : null),
                TextFormField(controller: line2, decoration: const InputDecoration(labelText: 'Address line 2')),
                TextFormField(controller: locality, decoration: const InputDecoration(labelText: 'Suburb'), validator: (v) => (v?.trim().length ?? 0) < 2 ? 'Required' : null),
                TextFormField(controller: region, decoration: const InputDecoration(labelText: 'State'), validator: (v) => (v?.trim().length ?? 0) < 2 ? 'Required' : null),
                TextFormField(controller: postcode, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Postcode'), validator: (v) => RegExp(r'^\d{4}$').hasMatch(v?.trim() ?? '') ? null : 'Use four digits'),
                TextFormField(controller: instructions, maxLength: 1000, decoration: const InputDecoration(labelText: 'Pickup instructions')),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(dialogContext).pop(false), child: const Text('Cancel')),
          FilledButton(onPressed: () { if (form.currentState?.validate() == true) Navigator.of(dialogContext).pop(true); }, child: const Text('Save')),
        ],
      ),
    );
    if (accepted == true && mounted) {
      await _run(() => widget.gateway.setPickupDetails(
        widget.token,
        orderId: widget.entry.order.id,
        line1: line1.text,
        line2: line2.text,
        locality: locality.text,
        region: region.text,
        postalCode: postcode.text,
        instructions: instructions.text,
      ));
    }
  }

  Future<void> _issueProof() async {
    if (_busy) return;
    setState(() { _busy = true; _error = null; });
    try {
      final code = await widget.gateway.issuePickupProof(widget.token, orderId: widget.entry.order.id);
      if (mounted) setState(() => _pickupCode = code);
      await widget.onUpdated();
    } catch (_) {
      if (mounted) setState(() => _error = 'Pickup proof could not be issued.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _verifyProof() async {
    final controller = TextEditingController();
    final accepted = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Verify pickup code'),
        content: TextField(controller: controller, maxLength: 32, decoration: const InputDecoration(labelText: 'Buyer code')),
        actions: [
          TextButton(onPressed: () => Navigator.of(dialogContext).pop(false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.of(dialogContext).pop(true), child: const Text('Verify')),
        ],
      ),
    );
    if (accepted == true && mounted) {
      await _run(() => widget.gateway.verifyPickupProof(widget.token, orderId: widget.entry.order.id, code: controller.text));
    }
  }

  Future<void> _deliveryEvidence() async {
    final note = TextEditingController();
    final url = TextEditingController();
    final accepted = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Delivery evidence'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Seller-submitted evidence is not independent carrier verification.'),
            TextField(controller: note, maxLength: 2000, decoration: const InputDecoration(labelText: 'Delivery note')),
            TextField(controller: url, keyboardType: TextInputType.url, maxLength: 1000, decoration: const InputDecoration(labelText: 'Optional HTTPS evidence link')),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(dialogContext).pop(false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.of(dialogContext).pop(true), child: const Text('Record delivery')),
        ],
      ),
    );
    if (accepted == true && note.text.trim().length >= 3 && mounted) {
      await _run(() => widget.gateway.submitDeliveryEvidence(widget.token, orderId: widget.entry.order.id, note: note.text, evidenceUrl: url.text));
    }
  }

  @override
  Widget build(BuildContext context) {
    final entry = widget.entry;
    final delivery = entry.delivery;
    final pending = entry.order.status == OrderActivityStatus.pending;
    final seller = delivery.role == 'seller';
    final buyer = delivery.role == 'buyer';
    final pickup = delivery.mode == 'pickup';
    final shipping = delivery.mode == 'shipping';
    final status = delivery.fulfilmentStatus;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(entry.order.listing?.title ?? 'Order', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
            const SizedBox(height: 6),
            Text('Total: ${_amount(delivery.totalAmount, delivery.currencyCode)}'),
            Text('Mode: ${delivery.mode ?? 'Not selected'}'),
            if (shipping) Text('Shipping address: ${_address(delivery.shippingAddress)}'),
            if (pickup) Text('Pickup location: ${_address(delivery.pickupAddress)}'),
            if (delivery.trackingReference != null) Text('Tracking: ${delivery.trackingReference}'),
            if (delivery.trackingUrl != null)
              TextButton.icon(
                onPressed: () => launchUrl(delivery.trackingUrl!, mode: LaunchMode.externalApplication),
                icon: const Icon(Icons.open_in_new),
                label: const Text('Open tracking link'),
              ),
            const SizedBox(height: 10),
            if (pending && buyer)
              FilledButton.icon(
                key: Key('delivery-configure-${entry.order.id}'),
                onPressed: _busy ? null : _configure,
                icon: const Icon(Icons.local_shipping_outlined),
                label: Text(delivery.configured ? 'Update delivery choice' : 'Choose delivery or pickup'),
              ),
            if (!pending && seller && pickup && status == 'not_started' && delivery.pickupAddress == null)
              FilledButton(onPressed: _busy ? null : _pickupDetails, child: const Text('Set pickup location')),
            if (!pending && buyer && pickup && status == 'ready_for_pickup')
              FilledButton(onPressed: _busy ? null : _issueProof, child: const Text('Generate pickup code')),
            if (_pickupCode != null)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: SelectableText(_pickupCode!, key: const Key('mobile-pickup-proof-code'), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
              ),
            if (!pending && seller && pickup && status == 'ready_for_pickup')
              FilledButton(onPressed: _busy ? null : _verifyProof, child: const Text('Verify pickup code')),
            if (!pending && seller && shipping && status == 'shipped')
              FilledButton(onPressed: _busy ? null : _deliveryEvidence, child: const Text('Record delivery evidence')),
            if (_error != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_error!, style: const TextStyle(color: Colors.red))),
          ],
        ),
      ),
    );
  }
}
