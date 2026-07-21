import 'dart:async';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:suqnaa/l10n/app_localizations.dart';
import '../../api/order_activity_api.dart';
import '../../api/session_authed_api.dart';
import '../../brand/brand.dart';
import '../../config/mobile_environment.dart';
import '../../session/app_session.dart';
import '../../session/session_scope.dart';
import 'order_labels.dart';

class OrderActivityScreen extends StatefulWidget {
  const OrderActivityScreen({
    super.key,
    this.gateway,
    this.accessToken,
  });

  final OrderActivityGateway? gateway;
  final String? accessToken;

  @override
  State<OrderActivityScreen> createState() => _OrderActivityScreenState();
}

class _OrderActivityScreenState extends State<OrderActivityScreen> {
  final List<OrderActivity> _orders = [];
  OrderActivityGateway? _gateway;
  AppSession? _session;
  OrderActivityStatus? _status;
  String? _nextCursor;
  bool _hasMore = false;
  bool _loading = false;
  bool _loadingMore = false;
  bool _initialized = false;
  String? _error;

  String get _accessToken =>
      widget.accessToken ?? _session?.access.value ?? '';

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialized) {
      return;
    }
    _initialized = true;

    if (widget.gateway != null) {
      _gateway = widget.gateway;
    } else {
      final session = SessionScope.of(context);
      _session = session;
      _gateway = OrderActivityApi(
        authedApi: SessionAuthedApi(
          baseUrl: Uri.parse(MobileEnvironment.apiBaseUrl),
          sessionProvider: () => session,
        ),
      );
    }
    unawaited(_reload());
  }

  Future<void> _reload() async {
    final gateway = _gateway;
    final token = _accessToken;
    if (gateway == null || token.isEmpty || _loading) {
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final page = await gateway.fetchPage(
        token,
        status: _status,
        limit: 20,
      );
      if (!mounted) {
        return;
      }
      setState(() {
        _orders
          ..clear()
          ..addAll(page.orders);
        _hasMore = page.hasMore;
        _nextCursor = page.nextCursor;
      });
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'load');
      }
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _loadMore() async {
    final gateway = _gateway;
    final token = _accessToken;
    final cursor = _nextCursor;
    if (gateway == null ||
        token.isEmpty ||
        !_hasMore ||
        cursor == null ||
        _loadingMore) {
      return;
    }

    setState(() {
      _loadingMore = true;
      _error = null;
    });

    try {
      final page = await gateway.fetchPage(
        token,
        status: _status,
        limit: 20,
        before: cursor,
      );
      if (!mounted) {
        return;
      }
      final existingIds = _orders.map((order) => order.id).toSet();
      setState(() {
        _orders.addAll(
          page.orders.where((order) => !existingIds.contains(order.id)),
        );
        _hasMore = page.hasMore;
        _nextCursor = page.nextCursor;
      });
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'load');
      }
    } finally {
      if (mounted) {
        setState(() => _loadingMore = false);
      }
    }
  }

  void _selectStatus(OrderActivityStatus? status) {
    if (_status == status) {
      return;
    }
    setState(() => _status = status);
    unawaited(_reload());
  }

  Future<void> _openOrder(OrderActivity order) async {
    final gateway = _gateway;
    final token = _accessToken;
    if (gateway == null || token.isEmpty) {
      return;
    }

    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => OrderActivityDetailScreen(
          gateway: gateway,
          accessToken: token,
          orderId: order.id,
          initialOrder: order,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final text = AppLocalizations.of(context);

    return Scaffold(
      backgroundColor: SuqnaaBrand.ivory,
      appBar: AppBar(
        title: Text(text.orderHistory),
        backgroundColor: SuqnaaBrand.ivory,
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
            child: DropdownButtonFormField<OrderActivityStatus?>(
              value: _status,
              decoration: InputDecoration(
                labelText: text.filters,
                border: const OutlineInputBorder(),
              ),
              items: [
                DropdownMenuItem<OrderActivityStatus?>(
                  value: null,
                  child: Text(text.allStatuses),
                ),
                ...OrderActivityStatus.values.map(
                  (status) => DropdownMenuItem<OrderActivityStatus?>(
                    value: status,
                    child: Text(orderStatusLabel(text, status)),
                  ),
                ),
              ],
              onChanged: _loading ? null : _selectStatus,
            ),
          ),
          if (_error != null)
            MaterialBanner(
              content: Text(text.unableToLoadOrders),
              actions: [
                TextButton(
                  onPressed: _reload,
                  child: Text(text.retry),
                ),
              ],
            ),
          Expanded(
            child: _loading && _orders.isEmpty
                ? Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const CircularProgressIndicator(),
                        const SizedBox(height: 12),
                        Text(text.loadingOrders),
                      ],
                    ),
                  )
                : RefreshIndicator(
                    onRefresh: _reload,
                    child: ListView.builder(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
                      itemCount: _orders.length + 1,
                      itemBuilder: (context, index) {
                        if (index == _orders.length) {
                          return _OrderListFooter(
                            empty: _orders.isEmpty,
                            hasMore: _hasMore,
                            loadingMore: _loadingMore,
                            text: text,
                            onLoadMore: _loadMore,
                          );
                        }
                        final order = _orders[index];
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: _OrderCard(
                            order: order,
                            text: text,
                            onOpen: () => _openOrder(order),
                          ),
                        );
                      },
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}

class _OrderListFooter extends StatelessWidget {
  const _OrderListFooter({
    required this.empty,
    required this.hasMore,
    required this.loadingMore,
    required this.text,
    required this.onLoadMore,
  });

  final bool empty;
  final bool hasMore;
  final bool loadingMore;
  final AppLocalizations text;
  final VoidCallback onLoadMore;

  @override
  Widget build(BuildContext context) {
    if (empty) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 64),
        child: Column(
          children: [
            const Icon(
              Icons.receipt_long_outlined,
              size: 58,
              color: SuqnaaBrand.muted,
            ),
            const SizedBox(height: 12),
            Text(
              text.noOrders,
              style: const TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              text.orderHistorySubtitle,
              textAlign: TextAlign.center,
            ),
          ],
        ),
      );
    }

    if (!hasMore) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 20),
        child: Center(child: Text(text.ordersCaughtUp)),
      );
    }

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 16),
      child: OutlinedButton.icon(
        onPressed: loadingMore ? null : onLoadMore,
        icon: loadingMore
            ? const SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : const Icon(Icons.expand_more),
        label: Text(loadingMore ? text.loadingMore : text.loadMore),
      ),
    );
  }
}

class _OrderCard extends StatelessWidget {
  const _OrderCard({
    required this.order,
    required this.text,
    required this.onOpen,
  });

  final OrderActivity order;
  final AppLocalizations text;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final locale = Localizations.localeOf(context).languageCode;
    final title = order.listing?.title ?? text.listingUnavailable;
    final counterpart = order.counterpart?.displayName ?? text.notSpecified;

    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onOpen,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _StatusChip(
                          label: orderStatusLabel(text, order.status),
                          status: order.status,
                        ),
                        const SizedBox(height: 10),
                        Text(
                          title,
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 12),
                  Text(
                    _formatAmount(order.amount, order.currencyCode, locale),
                    style: const TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w900,
                      color: SuqnaaBrand.blue,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              Wrap(
                spacing: 18,
                runSpacing: 8,
                children: [
                  _CompactFact(
                    label: text.yourRole,
                    value: orderRoleLabel(text, order.role),
                  ),
                  _CompactFact(
                    label: text.counterpart,
                    value: counterpart,
                  ),
                  _CompactFact(
                    label: text.updated,
                    value: _formatDate(order.updatedAt, locale),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              Text(
                orderStageLabel(text, order.progress.stage),
                style: const TextStyle(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 7),
              ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: LinearProgressIndicator(
                  value: order.progress.percent / 100,
                  minHeight: 8,
                  backgroundColor: const Color(0xFFE4E8EF),
                ),
              ),
              const SizedBox(height: 14),
              Align(
                alignment: AlignmentDirectional.centerEnd,
                child: TextButton.icon(
                  onPressed: onOpen,
                  icon: const Icon(Icons.chevron_right),
                  label: Text(text.viewOrderDetails),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class OrderActivityDetailScreen extends StatefulWidget {
  const OrderActivityDetailScreen({
    super.key,
    required this.gateway,
    required this.accessToken,
    required this.orderId,
    this.initialOrder,
  });

  final OrderActivityGateway gateway;
  final String accessToken;
  final String orderId;
  final OrderActivity? initialOrder;

  @override
  State<OrderActivityDetailScreen> createState() =>
      _OrderActivityDetailScreenState();
}

class _OrderActivityDetailScreenState
    extends State<OrderActivityDetailScreen> {
  OrderActivity? _order;
  bool _loading = false;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    _order = widget.initialOrder;
    unawaited(_load());
  }

  Future<void> _load() async {
    if (_loading) {
      return;
    }
    setState(() {
      _loading = true;
      _failed = false;
    });

    try {
      final order = await widget.gateway.fetchDetail(
        widget.accessToken,
        orderId: widget.orderId,
      );
      if (mounted) {
        setState(() => _order = order);
      }
    } catch (_) {
      if (mounted) {
        setState(() => _failed = true);
      }
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = AppLocalizations.of(context);
    final order = _order;

    return Scaffold(
      backgroundColor: SuqnaaBrand.ivory,
      appBar: AppBar(
        title: Text(text.orderDetails),
        backgroundColor: SuqnaaBrand.ivory,
      ),
      body: order == null
          ? _failed
              ? _UnavailableOrder(text: text, onRetry: _load)
              : Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const CircularProgressIndicator(),
                      const SizedBox(height: 12),
                      Text(text.loadingOrders),
                    ],
                  ),
                )
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 36),
                children: [
                  if (_failed)
                    MaterialBanner(
                      content: Text(text.unableToLoadOrders),
                      actions: [
                        TextButton(
                          onPressed: _load,
                          child: Text(text.retry),
                        ),
                      ],
                    ),
                  _OrderDetailSummary(order: order, text: text),
                  const SizedBox(height: 14),
                  _OrderProgressCard(order: order, text: text),
                  if (order.offer?.message?.trim().isNotEmpty == true) ...[
                    const SizedBox(height: 14),
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              text.offerMessage,
                              style: const TextStyle(
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Text(order.offer!.message!.trim()),
                          ],
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
    );
  }
}

class _UnavailableOrder extends StatelessWidget {
  const _UnavailableOrder({required this.text, required this.onRetry});

  final AppLocalizations text;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.receipt_long_outlined,
              size: 58,
              color: SuqnaaBrand.muted,
            ),
            const SizedBox(height: 14),
            Text(
              text.orderNotAvailable,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: Text(text.retry),
            ),
          ],
        ),
      ),
    );
  }
}

class _OrderDetailSummary extends StatelessWidget {
  const _OrderDetailSummary({required this.order, required this.text});

  final OrderActivity order;
  final AppLocalizations text;

  @override
  Widget build(BuildContext context) {
    final locale = Localizations.localeOf(context).languageCode;
    final isArabic = locale == 'ar';

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _StatusChip(
              label: orderStatusLabel(text, order.status),
              status: order.status,
            ),
            const SizedBox(height: 12),
            Text(
              order.listing?.title ?? text.listingUnavailable,
              style: const TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              _formatAmount(order.amount, order.currencyCode, locale),
              style: const TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w900,
                color: SuqnaaBrand.blue,
              ),
            ),
            const SizedBox(height: 18),
            _DetailFact(label: text.orderIdentifier, value: order.id),
            _DetailFact(
              label: text.yourRole,
              value: orderRoleLabel(text, order.role),
            ),
            _DetailFact(
              label: text.counterpart,
              value: order.counterpart?.displayName ?? text.notSpecified,
            ),
            _DetailFact(
              label: text.paymentMethod,
              value: paymentMethodLabel(
                text,
                order.paymentMethod,
                isArabic: isArabic,
              ),
            ),
            _DetailFact(
              label: text.created,
              value: _formatDate(order.createdAt, locale),
            ),
            _DetailFact(
              label: text.updated,
              value: _formatDate(order.updatedAt, locale),
              showDivider: false,
            ),
          ],
        ),
      ),
    );
  }
}

class _OrderProgressCard extends StatelessWidget {
  const _OrderProgressCard({required this.order, required this.text});

  final OrderActivity order;
  final AppLocalizations text;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        text.orderProgress,
                        style: const TextStyle(fontWeight: FontWeight.w900),
                      ),
                      const SizedBox(height: 4),
                      Text(orderStageLabel(text, order.progress.stage)),
                    ],
                  ),
                ),
                Text(
                  '${order.progress.percent}%',
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w900,
                    color: SuqnaaBrand.blue,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: LinearProgressIndicator(
                value: order.progress.percent / 100,
                minHeight: 10,
                backgroundColor: const Color(0xFFE4E8EF),
              ),
            ),
            const SizedBox(height: 18),
            ...order.progress.steps.map(
              (step) => _ProgressStepRow(
                label: orderStepLabel(text, step.key),
                state: step.state,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ProgressStepRow extends StatelessWidget {
  const _ProgressStepRow({required this.label, required this.state});

  final String label;
  final OrderProgressStepState state;

  @override
  Widget build(BuildContext context) {
    final icon = switch (state) {
      OrderProgressStepState.complete => Icons.check_circle,
      OrderProgressStepState.current => Icons.radio_button_checked,
      OrderProgressStepState.upcoming => Icons.radio_button_unchecked,
      OrderProgressStepState.exception => Icons.error_outline,
    };
    final color = switch (state) {
      OrderProgressStepState.complete => const Color(0xFF16845B),
      OrderProgressStepState.current => SuqnaaBrand.blue,
      OrderProgressStepState.upcoming => SuqnaaBrand.muted,
      OrderProgressStepState.exception => const Color(0xFFB42318),
    };

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(
        children: [
          Icon(icon, color: color),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                fontWeight: state == OrderProgressStepState.current
                    ? FontWeight.w900
                    : FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.label, required this.status});

  final String label;
  final OrderActivityStatus status;

  @override
  Widget build(BuildContext context) {
    final color = switch (status) {
      OrderActivityStatus.pending => const Color(0xFF8A5A00),
      OrderActivityStatus.paid => SuqnaaBrand.blue,
      OrderActivityStatus.released => const Color(0xFF16845B),
      OrderActivityStatus.disputed => const Color(0xFFB42318),
      OrderActivityStatus.refunded => const Color(0xFF65558F),
      OrderActivityStatus.cancelled => SuqnaaBrand.muted,
    };

    return DecoratedBox(
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        child: Text(
          label,
          style: TextStyle(color: color, fontWeight: FontWeight.w900),
        ),
      ),
    );
  }
}

class _CompactFact extends StatelessWidget {
  const _CompactFact({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return ConstrainedBox(
      constraints: const BoxConstraints(minWidth: 110),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(
              color: SuqnaaBrand.muted,
              fontSize: 12,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 2),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }
}

class _DetailFact extends StatelessWidget {
  const _DetailFact({
    required this.label,
    required this.value,
    this.showDivider = true,
  });

  final String label;
  final String value;
  final bool showDivider;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  label,
                  style: const TextStyle(
                    color: SuqnaaBrand.muted,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const SizedBox(width: 16),
              Flexible(
                child: SelectableText(
                  value,
                  textAlign: TextAlign.end,
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
              ),
            ],
          ),
        ),
        if (showDivider) const Divider(height: 1),
      ],
    );
  }
}

String _formatAmount(String amount, String currency, String locale) {
  final numeric = num.tryParse(amount);
  if (numeric == null) {
    return '$amount $currency';
  }
  try {
    return NumberFormat.simpleCurrency(
      locale: locale == 'ar' ? 'ar_AU' : 'en_AU',
      name: currency,
      decimalDigits: 2,
    ).format(numeric);
  } catch (_) {
    return '$amount $currency';
  }
}

String _formatDate(String value, String locale) {
  final date = DateTime.tryParse(value)?.toLocal();
  if (date == null) {
    return value;
  }
  return DateFormat.yMMMd(locale == 'ar' ? 'ar' : 'en')
      .add_jm()
      .format(date);
}
