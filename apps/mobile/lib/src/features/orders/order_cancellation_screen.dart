import 'dart:async';
import 'package:flutter/material.dart';
import 'package:suqnaa/l10n/app_localizations.dart';
import '../../api/challenge_config_api.dart';
import '../../api/order_activity_api.dart';
import '../../api/order_cancellation_api.dart';
import '../../api/session_authed_api.dart';
import '../../brand/brand.dart';
import '../../config/mobile_environment.dart';
import '../../navigation/secure_web_handoff.dart';
import '../../session/app_session.dart';
import '../../session/session_scope.dart';
import 'order_cancellation_card.dart';

class OrderCancellationScreen extends StatefulWidget {
  const OrderCancellationScreen({
    super.key,
    this.orderGateway,
    this.cancellationGateway,
    this.challengeGateway,
    this.secureWebHandoffGateway,
    this.accessToken,
  });

  final OrderActivityGateway? orderGateway;
  final OrderCancellationGateway? cancellationGateway;
  final ChallengeConfigurationGateway? challengeGateway;
  final SecureWebHandoffGateway? secureWebHandoffGateway;
  final String? accessToken;

  @override
  State<OrderCancellationScreen> createState() =>
      _OrderCancellationScreenState();
}

class _OrderCancellationScreenState extends State<OrderCancellationScreen> {
  final List<OrderActivity> _orders = [];
  OrderActivityGateway? _orderGateway;
  OrderCancellationGateway? _cancellationGateway;
  ChallengeConfigurationGateway? _challengeGateway;
  SecureWebHandoffGateway? _secureWebHandoffGateway;
  AppSession? _session;
  bool _initialized = false;
  bool _loading = false;
  bool _failed = false;

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
        widget.cancellationGateway != null &&
        widget.challengeGateway != null &&
        widget.secureWebHandoffGateway != null) {
      _orderGateway = widget.orderGateway;
      _cancellationGateway = widget.cancellationGateway;
      _challengeGateway = widget.challengeGateway;
      _secureWebHandoffGateway = widget.secureWebHandoffGateway;
    } else {
      final session = SessionScope.of(context);
      final apiBaseUrl = Uri.parse(MobileEnvironment.apiBaseUrl);
      final authedApi = SessionAuthedApi(
        baseUrl: apiBaseUrl,
        sessionProvider: () => session,
      );
      _session = session;
      _orderGateway = widget.orderGateway ?? OrderActivityApi(authedApi: authedApi);
      _cancellationGateway = widget.cancellationGateway ??
          OrderCancellationApi(authedApi: authedApi);
      _challengeGateway = widget.challengeGateway ??
          ChallengeConfigurationApi(baseUrl: apiBaseUrl);
      _secureWebHandoffGateway = widget.secureWebHandoffGateway ??
          BrowserSecureWebHandoff(
            webBaseUrl: Uri.parse(MobileEnvironment.webBaseUrl),
          );
    }

    unawaited(_reload());
  }

  Future<void> _reload() async {
    final gateway = _orderGateway;
    final token = _accessToken;
    if (gateway == null || token.isEmpty || _loading) {
      return;
    }

    setState(() {
      _loading = true;
      _failed = false;
    });

    try {
      final page = await gateway.fetchPage(
        token,
        status: OrderActivityStatus.pending,
        limit: 50,
      );
      if (!mounted) {
        return;
      }
      setState(() {
        _orders
          ..clear()
          ..addAll(
            page.orders.where(
              (order) =>
                  order.role == OrderRole.buyer &&
                  order.status == OrderActivityStatus.pending,
            ),
          );
      });
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

    return Scaffold(
      backgroundColor: SuqnaaBrand.ivory,
      appBar: AppBar(
        title: Text(text.cancelOrder),
        backgroundColor: SuqnaaBrand.ivory,
      ),
      body: _loading && _orders.isEmpty
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _reload,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 36),
                children: [
                  Text(
                    text.cancelOrderTitle,
                    style: const TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.w900,
                      color: SuqnaaBrand.blue,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(text.cancelOrderBody),
                  if (_failed) ...[
                    const SizedBox(height: 16),
                    MaterialBanner(
                      content: Text(text.unableToLoadOrders),
                      actions: [
                        TextButton(
                          onPressed: _reload,
                          child: Text(text.retry),
                        ),
                      ],
                    ),
                  ],
                  const SizedBox(height: 16),
                  if (_orders.isEmpty && !_failed)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 48),
                      child: Column(
                        children: [
                          const Icon(
                            Icons.cancel_outlined,
                            size: 56,
                            color: SuqnaaBrand.muted,
                          ),
                          const SizedBox(height: 12),
                          Text(
                            text.noCancellableBuyerOrders,
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                        ],
                      ),
                    )
                  else
                    ..._orders.map(
                      (order) => Padding(
                        padding: const EdgeInsets.only(bottom: 14),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Padding(
                              padding: const EdgeInsetsDirectional.only(
                                start: 6,
                                bottom: 6,
                              ),
                              child: Text(
                                order.listing?.title ?? text.listingUnavailable,
                                style: const TextStyle(
                                  fontSize: 18,
                                  fontWeight: FontWeight.w900,
                                ),
                              ),
                            ),
                            OrderCancellationCard(
                              order: order,
                              accessToken: _accessToken,
                              cancellationGateway: _cancellationGateway,
                              challengeGateway: _challengeGateway,
                              secureWebHandoffGateway:
                                  _secureWebHandoffGateway,
                              onCancelled: _reload,
                            ),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
            ),
    );
  }
}
