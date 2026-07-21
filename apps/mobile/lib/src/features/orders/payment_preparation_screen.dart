import 'dart:async';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:suqnaa/l10n/app_localizations.dart';
import '../../api/challenge_config_api.dart';
import '../../api/order_activity_api.dart';
import '../../api/order_checkout_api.dart';
import '../../api/session_authed_api.dart';
import '../../brand/brand.dart';
import '../../config/mobile_environment.dart';
import '../../session/app_session.dart';
import '../../session/session_scope.dart';
import 'order_labels.dart';

class PaymentPreparationScreen extends StatefulWidget {
  const PaymentPreparationScreen({
    super.key,
    this.orderGateway,
    this.checkoutGateway,
    this.challengeGateway,
    this.accessToken,
  });

  final OrderActivityGateway? orderGateway;
  final OrderCheckoutGateway? checkoutGateway;
  final ChallengeConfigurationGateway? challengeGateway;
  final String? accessToken;

  @override
  State<PaymentPreparationScreen> createState() =>
      _PaymentPreparationScreenState();
}

class _PaymentPreparationScreenState extends State<PaymentPreparationScreen> {
  final List<OrderActivity> _orders = [];
  final Map<String, CheckoutPreparation> _preparations = {};
  final Set<String> _preparing = {};
  OrderActivityGateway? _orderGateway;
  OrderCheckoutGateway? _checkoutGateway;
  ChallengeConfigurationGateway? _challengeGateway;
  MobileChallengeConfiguration? _configuration;
  AppSession? _session;
  String? _nextCursor;
  bool _hasMore = false;
  bool _loading = false;
  bool _loadingMore = false;
  bool _initialized = false;
  bool _ordersFailed = false;
  bool _configurationFailed = false;

  String get _accessToken =>
      widget.accessToken ?? _session?.access.value ?? '';

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialized) {
      return;
    }
    _initialized = true;

    if (widget.orderGateway != null &&
        widget.checkoutGateway != null &&
        widget.challengeGateway != null) {
      _orderGateway = widget.orderGateway;
      _checkoutGateway = widget.checkoutGateway;
      _challengeGateway = widget.challengeGateway;
    } else {
      final session = SessionScope.of(context);
      final baseUrl = Uri.parse(MobileEnvironment.apiBaseUrl);
      final authed = SessionAuthedApi(
        baseUrl: baseUrl,
        sessionProvider: () => session,
      );
      _session = session;
      _orderGateway = widget.orderGateway ?? OrderActivityApi(authedApi: authed);
      _checkoutGateway =
          widget.checkoutGateway ?? OrderCheckoutApi(authedApi: authed);
      _challengeGateway = widget.challengeGateway ??
          ChallengeConfigurationApi(baseUrl: baseUrl);
    }

    unawaited(_reload());
  }

  Future<void> _reload() async {
    final orderGateway = _orderGateway;
    final challengeGateway = _challengeGateway;
    final token = _accessToken;
    if (orderGateway == null ||
        challengeGateway == null ||
        token.isEmpty ||
        _loading) {
      return;
    }

    setState(() {
      _loading = true;
      _ordersFailed = false;
      _configurationFailed = false;
    });

    MobileChallengeConfiguration? configuration;
    OrderActivityPage? page;

    try {
      configuration = await challengeGateway.fetch();
    } catch (_) {
      _configurationFailed = true;
    }

    try {
      page = await orderGateway.fetchPage(
        token,
        status: OrderActivityStatus.pending,
        limit: 20,
      );
    } catch (_) {
      _ordersFailed = true;
    }

    if (!mounted) {
      return;
    }

    setState(() {
      _configuration = configuration;
      if (page != null) {
        _orders
          ..clear()
          ..addAll(_buyerPendingOrders(page.orders));
        _hasMore = page.hasMore;
        _nextCursor = page.nextCursor;
      }
      _loading = false;
    });
  }

  Future<void> _loadMore() async {
    final gateway = _orderGateway;
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
      _ordersFailed = false;
    });

    try {
      final page = await gateway.fetchPage(
        token,
        status: OrderActivityStatus.pending,
        limit: 20,
        before: cursor,
      );
      if (!mounted) {
        return;
      }
      final existing = _orders.map((order) => order.id).toSet();
      setState(() {
        _orders.addAll(
          _buyerPendingOrders(page.orders)
              .where((order) => !existing.contains(order.id)),
        );
        _hasMore = page.hasMore;
        _nextCursor = page.nextCursor;
      });
    } catch (_) {
      if (mounted) {
        setState(() => _ordersFailed = true);
      }
    } finally {
      if (mounted) {
        setState(() => _loadingMore = false);
      }
    }
  }

  Iterable<OrderActivity> _buyerPendingOrders(
    Iterable<OrderActivity> orders,
  ) {
    return orders.where(
      (order) =>
          order.role == OrderRole.buyer &&
          order.status == OrderActivityStatus.pending,
    );
  }

  Future<void> _prepare(OrderActivity order) async {
    final text = AppLocalizations.of(context);
    final checkoutGateway = _checkoutGateway;
    final configuration = _configuration;
    final token = _accessToken;
    if (checkoutGateway == null ||
        configuration == null ||
        configuration.enabled ||
        token.isEmpty ||
        _preparing.contains(order.id)) {
      return;
    }

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(text.confirmPaymentPreparation),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              order.listing?.title ?? text.listingUnavailable,
              style: const TextStyle(fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 8),
            Text(_formatAmount(context, order.amount, order.currencyCode)),
            const SizedBox(height: 12),
            Text(text.noPaymentSent),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(text.close),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(text.preparePayment),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) {
      return;
    }

    setState(() => _preparing.add(order.id));
    try {
      final preparation = await checkoutGateway.prepare(
        token,
        orderId: order.id,
      );
      _validatePreparation(order, preparation);
      if (mounted) {
        setState(() => _preparations[order.id] = preparation);
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(text.paymentPreparationFailed)),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _preparing.remove(order.id));
      }
    }
  }

  void _validatePreparation(
    OrderActivity order,
    CheckoutPreparation preparation,
  ) {
    final expectedAmount = num.tryParse(order.amount);
    final actualAmount = num.tryParse(preparation.order.amount);
    if (preparation.order.id != order.id ||
        preparation.order.listingId != order.listingId ||
        preparation.order.currencyCode != order.currencyCode ||
        expectedAmount == null ||
        actualAmount == null ||
        expectedAmount != actualAmount) {
      throw const FormatException('Checkout preparation mismatch');
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = AppLocalizations.of(context);
    final blocked = _configuration?.enabled == true;
    final unavailable = _configurationFailed || _configuration == null;

    return Scaffold(
      backgroundColor: SuqnaaBrand.ivory,
      appBar: AppBar(
        title: Text(text.paymentPreparation),
        backgroundColor: SuqnaaBrand.ivory,
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: Text(
              text.paymentPreparationSubtitle,
              style: const TextStyle(fontSize: 16),
            ),
          ),
          if (blocked)
            _SecurityNotice(
              title: text.securityVerificationRequired,
              body: text.securityVerificationWebOnly,
            ),
          if (_configurationFailed || _ordersFailed)
            MaterialBanner(
              content: Text(
                _configurationFailed
                    ? text.paymentPreparationFailed
                    : text.unableToLoadOrders,
              ),
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
                        Text(text.loadingPaymentPreparation),
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
                          return _PaymentFooter(
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
                          child: _PaymentOrderCard(
                            order: order,
                            preparation: _preparations[order.id],
                            preparing: _preparing.contains(order.id),
                            blocked: blocked || unavailable,
                            text: text,
                            onPrepare: () => _prepare(order),
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

class _SecurityNotice extends StatelessWidget {
  const _SecurityNotice({required this.title, required this.body});

  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.fromLTRB(16, 4, 16, 8),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Icon(Icons.verified_user_outlined, color: SuqnaaBrand.blue),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(fontWeight: FontWeight.w900),
                  ),
                  const SizedBox(height: 6),
                  Text(body),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PaymentOrderCard extends StatelessWidget {
  const _PaymentOrderCard({
    required this.order,
    required this.preparation,
    required this.preparing,
    required this.blocked,
    required this.text,
    required this.onPrepare,
  });

  final OrderActivity order;
  final CheckoutPreparation? preparation;
  final bool preparing;
  final bool blocked;
  final AppLocalizations text;
  final VoidCallback onPrepare;

  @override
  Widget build(BuildContext context) {
    final result = preparation;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              order.listing?.title ?? text.listingUnavailable,
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              _formatAmount(context, order.amount, order.currencyCode),
              style: const TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w900,
                color: SuqnaaBrand.blue,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              '${text.paymentMethod}: ${paymentMethodLabel(text, order.paymentMethod)}',
            ),
            if (result != null) ...[
              const SizedBox(height: 14),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: const Color(0xFFEAF2FF),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      text.paymentProviderSetupRequired,
                      style: const TextStyle(fontWeight: FontWeight.w900),
                    ),
                    const SizedBox(height: 6),
                    Text(_nextActionText(text, result.nextAction)),
                    const SizedBox(height: 6),
                    Text(text.noPaymentSent),
                  ],
                ),
              ),
            ] else ...[
              const SizedBox(height: 14),
              FilledButton.icon(
                onPressed: blocked || preparing ? null : onPrepare,
                icon: preparing
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.payments_outlined),
                label: Text(
                  preparing ? text.preparingPayment : text.preparePayment,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _PaymentFooter extends StatelessWidget {
  const _PaymentFooter({
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
              Icons.payments_outlined,
              size: 58,
              color: SuqnaaBrand.muted,
            ),
            const SizedBox(height: 12),
            Text(
              text.noPendingBuyerOrders,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w900,
              ),
            ),
          ],
        ),
      );
    }

    if (!hasMore) {
      return const SizedBox(height: 16);
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

String _formatAmount(BuildContext context, String amount, String currency) {
  final value = num.tryParse(amount);
  if (value == null) {
    return '$amount $currency';
  }

  try {
    final locale = Localizations.localeOf(context).languageCode == 'ar'
        ? 'ar_AU'
        : 'en_AU';
    return NumberFormat.simpleCurrency(name: currency, locale: locale)
        .format(value);
  } catch (_) {
    return '$amount $currency';
  }
}

String _nextActionText(
  AppLocalizations text,
  CheckoutNextAction action,
) {
  return switch (action) {
    CheckoutNextAction.configureCardProvider => text.configureCardProvider,
    CheckoutNextAction.configureBankTransferInstructions =>
      text.configureBankTransfer,
    CheckoutNextAction.configureWalletProvider => text.configureWalletProvider,
    CheckoutNextAction.configureXmrPaymentAddress => text.configureXmrAddress,
  };
}
