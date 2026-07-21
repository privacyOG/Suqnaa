import 'dart:async';
import 'package:flutter/material.dart';
import 'package:suqnaa/l10n/app_localizations.dart';
import '../../api/challenge_config_api.dart';
import '../../api/order_activity_api.dart';
import '../../api/order_fulfilment_api.dart';
import '../../api/session_authed_api.dart';
import '../../brand/brand.dart';
import '../../config/mobile_environment.dart';
import '../../navigation/secure_web_handoff.dart';
import '../../session/app_session.dart';
import '../../session/session_scope.dart';
import 'order_fulfilment_policy.dart';

class OrderFulfilmentScreen extends StatefulWidget {
  const OrderFulfilmentScreen({
    super.key,
    this.orderGateway,
    this.fulfilmentGateway,
    this.challengeGateway,
    this.secureWebHandoffGateway,
    this.accessToken,
  });

  final OrderActivityGateway? orderGateway;
  final OrderFulfilmentGateway? fulfilmentGateway;
  final ChallengeConfigurationGateway? challengeGateway;
  final SecureWebHandoffGateway? secureWebHandoffGateway;
  final String? accessToken;

  @override
  State<OrderFulfilmentScreen> createState() => _OrderFulfilmentScreenState();
}

class _FulfilmentEntry {
  const _FulfilmentEntry({
    required this.order,
    required this.context,
    required this.actions,
  });

  final OrderActivity order;
  final OrderFulfilmentContext context;
  final List<MobileFulfilmentAction> actions;
}

class _OrderFulfilmentScreenState extends State<OrderFulfilmentScreen> {
  final List<_FulfilmentEntry> _entries = [];
  OrderActivityGateway? _orderGateway;
  OrderFulfilmentGateway? _fulfilmentGateway;
  ChallengeConfigurationGateway? _challengeGateway;
  SecureWebHandoffGateway? _secureWebHandoffGateway;
  MobileChallengeConfiguration? _configuration;
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
        widget.fulfilmentGateway != null &&
        widget.challengeGateway != null &&
        widget.secureWebHandoffGateway != null) {
      _orderGateway = widget.orderGateway;
      _fulfilmentGateway = widget.fulfilmentGateway;
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
      _fulfilmentGateway = widget.fulfilmentGateway ??
          OrderFulfilmentApi(authedApi: authedApi);
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
    final orders = _orderGateway;
    final fulfilment = _fulfilmentGateway;
    final challenge = _challengeGateway;
    final token = _accessToken;
    if (orders == null ||
        fulfilment == null ||
        challenge == null ||
        token.isEmpty ||
        _loading) {
      return;
    }

    setState(() {
      _loading = true;
      _failed = false;
    });

    try {
      final results = await Future.wait([
        orders.fetchPage(
          token,
          status: OrderActivityStatus.paid,
          limit: 50,
        ),
        challenge.fetch(),
      ]);
      final page = results[0] as OrderActivityPage;
      final configuration = results[1] as MobileChallengeConfiguration;
      final paidOrders = page.orders
          .where((order) => order.status == OrderActivityStatus.paid)
          .toList(growable: false);
      final contexts = await Future.wait(
        paidOrders.map(
          (order) => fulfilment.fetchContext(token, orderId: order.id),
        ),
      );

      final entries = <_FulfilmentEntry>[];
      for (var index = 0; index < paidOrders.length; index++) {
        final order = paidOrders[index];
        final context = contexts[index];
        final actions = availableMobileFulfilmentActions(order, context);
        if (actions.isNotEmpty) {
          entries.add(
            _FulfilmentEntry(
              order: order,
              context: context,
              actions: actions,
            ),
          );
        }
      }

      if (!mounted) {
        return;
      }
      setState(() {
        _configuration = configuration;
        _entries
          ..clear()
          ..addAll(entries);
      });
    } catch (_) {
      if (mounted) {
        setState(() {
          _configuration = null;
          _failed = true;
        });
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
        title: Text(text.fulfilmentActions),
        backgroundColor: SuqnaaBrand.ivory,
      ),
      body: _loading && _entries.isEmpty
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _reload,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 36),
                children: [
                  Text(
                    text.fulfilmentActionsTitle,
                    style: const TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.w900,
                      color: SuqnaaBrand.blue,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(text.fulfilmentActionsBody),
                  const SizedBox(height: 8),
                  Text(
                    text.fulfilmentNoAutomaticRelease,
                    style: const TextStyle(fontWeight: FontWeight.w800),
                  ),
                  if (_failed) ...[
                    const SizedBox(height: 16),
                    MaterialBanner(
                      content: Text(text.fulfilmentLoadFailed),
                      actions: [
                        TextButton(
                          onPressed: _reload,
                          child: Text(text.retry),
                        ),
                      ],
                    ),
                  ],
                  const SizedBox(height: 16),
                  if (_entries.isEmpty && !_failed)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 48),
                      child: Column(
                        children: [
                          const Icon(
                            Icons.local_shipping_outlined,
                            size: 56,
                            color: SuqnaaBrand.muted,
                          ),
                          const SizedBox(height: 12),
                          Text(
                            text.noFulfilmentActions,
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
                    ..._entries.map(
                      (entry) => Padding(
                        padding: const EdgeInsets.only(bottom: 14),
                        child: _OrderFulfilmentCard(
                          entry: entry,
                          accessToken: _accessToken,
                          configuration: _configuration!,
                          gateway: _fulfilmentGateway!,
                          secureWebHandoffGateway: _secureWebHandoffGateway!,
                          onUpdated: _reload,
                        ),
                      ),
                    ),
                ],
              ),
            ),
    );
  }
}

class _OrderFulfilmentCard extends StatefulWidget {
  const _OrderFulfilmentCard({
    required this.entry,
    required this.accessToken,
    required this.configuration,
    required this.gateway,
    required this.secureWebHandoffGateway,
    required this.onUpdated,
  });

  final _FulfilmentEntry entry;
  final String accessToken;
  final MobileChallengeConfiguration configuration;
  final OrderFulfilmentGateway gateway;
  final SecureWebHandoffGateway secureWebHandoffGateway;
  final Future<void> Function() onUpdated;

  @override
  State<_OrderFulfilmentCard> createState() => _OrderFulfilmentCardState();
}

class _OrderFulfilmentCardState extends State<_OrderFulfilmentCard> {
  bool _submitting = false;
  bool _openingWeb = false;
  String? _error;

  Future<void> _openSecureWebsite() async {
    if (_openingWeb) {
      return;
    }
    setState(() {
      _openingWeb = true;
      _error = null;
    });

    var opened = false;
    try {
      opened = await widget.secureWebHandoffGateway.openOrder(
        locale: Localizations.localeOf(context).languageCode,
        orderId: widget.entry.order.id,
      );
    } catch (_) {
      opened = false;
    } finally {
      if (mounted) {
        setState(() => _openingWeb = false);
      }
    }

    if (!opened && mounted) {
      setState(() =>
          _error = AppLocalizations.of(context).unableToOpenSecureWebsite);
    }
  }

  Future<void> _requestAction(MobileFulfilmentAction action) async {
    if (action == MobileFulfilmentAction.shipped) {
      await _requestShipment();
      return;
    }

    final text = AppLocalizations.of(context);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(_actionLabel(text, action)),
        content: Text(
          action == MobileFulfilmentAction.confirmReceived
              ? text.confirmReceiptBody
              : text.readyForPickupBody,
        ),
        actions: [
          TextButton(
            key: const Key('fulfilment-go-back-button'),
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(text.goBack),
          ),
          FilledButton(
            key: Key('confirm-fulfilment-${action.wireValue}'),
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(_actionLabel(text, action)),
          ),
        ],
      ),
    );
    if (confirmed == true && mounted) {
      await _submit(action);
    }
  }

  Future<void> _requestShipment() async {
    final text = AppLocalizations.of(context);
    final carrier = TextEditingController();
    final tracking = TextEditingController();
    final formKey = GlobalKey<FormState>();

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(text.markAsShipped),
        content: Form(
          key: formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(text.shipmentEvidenceBody),
              const SizedBox(height: 12),
              TextFormField(
                key: const Key('fulfilment-carrier-field'),
                controller: carrier,
                maxLength: 80,
                decoration: InputDecoration(labelText: text.carrier),
                validator: (value) {
                  final length = value?.trim().length ?? 0;
                  return length < 2 ? text.carrierValidation : null;
                },
              ),
              TextFormField(
                key: const Key('fulfilment-tracking-field'),
                controller: tracking,
                maxLength: 160,
                decoration: InputDecoration(labelText: text.trackingReference),
                validator: (value) {
                  final length = value?.trim().length ?? 0;
                  return length < 3 ? text.trackingValidation : null;
                },
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(text.goBack),
          ),
          FilledButton(
            key: const Key('confirm-fulfilment-shipped'),
            onPressed: () {
              if (formKey.currentState?.validate() == true) {
                Navigator.of(dialogContext).pop(true);
              }
            },
            child: Text(text.markAsShipped),
          ),
        ],
      ),
    );

    if (confirmed == true && mounted) {
      await _submit(
        MobileFulfilmentAction.shipped,
        carrier: carrier.text,
        trackingReference: tracking.text,
      );
    }
    carrier.dispose();
    tracking.dispose();
  }

  Future<void> _submit(
    MobileFulfilmentAction action, {
    String? carrier,
    String? trackingReference,
  }) async {
    if (widget.configuration.enabled || _submitting) {
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      final result = await widget.gateway.update(
        widget.accessToken,
        orderId: widget.entry.order.id,
        action: action,
        carrier: carrier,
        trackingReference: trackingReference,
      );
      if (!mounted) {
        return;
      }
      final text = AppLocalizations.of(context);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            result.unchanged
                ? text.fulfilmentAlreadyRecorded
                : _successLabel(text, action),
          ),
        ),
      );
      await widget.onUpdated();
    } on SessionRequestException catch (error) {
      if (mounted) {
        final text = AppLocalizations.of(context);
        setState(() {
          _error = error.statusCode == 409
              ? text.fulfilmentConflict
              : text.fulfilmentUpdateFailed;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() =>
            _error = AppLocalizations.of(context).fulfilmentUpdateFailed);
      }
    } finally {
      if (mounted) {
        setState(() => _submitting = false);
      }
    }
  }

  String _actionLabel(
    AppLocalizations text,
    MobileFulfilmentAction action,
  ) {
    return switch (action) {
      MobileFulfilmentAction.readyForPickup => text.readyForPickup,
      MobileFulfilmentAction.shipped => text.markAsShipped,
      MobileFulfilmentAction.confirmReceived => text.confirmReceipt,
    };
  }

  String _successLabel(
    AppLocalizations text,
    MobileFulfilmentAction action,
  ) {
    return switch (action) {
      MobileFulfilmentAction.readyForPickup => text.readyForPickupComplete,
      MobileFulfilmentAction.shipped => text.shipmentRecorded,
      MobileFulfilmentAction.confirmReceived => text.receiptConfirmedNoRelease,
    };
  }

  String _statusLabel(AppLocalizations text) {
    return switch (widget.entry.context.fulfilmentStatus) {
      MobileFulfilmentStatus.notStarted => text.fulfilmentNotStarted,
      MobileFulfilmentStatus.readyForPickup => text.readyForPickup,
      MobileFulfilmentStatus.shipped => text.shippedStatus,
      MobileFulfilmentStatus.delivered => text.deliveredStatus,
      MobileFulfilmentStatus.receivedConfirmed => text.receiptConfirmedStatus,
      MobileFulfilmentStatus.failed => text.fulfilmentFailedStatus,
    };
  }

  @override
  Widget build(BuildContext context) {
    final text = AppLocalizations.of(context);
    final order = widget.entry.order;
    final challengeEnabled = widget.configuration.enabled;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
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
            Text('${text.fulfilmentStatus}: ${_statusLabel(text)}'),
            Text('${text.yourRole}: ${order.role == OrderRole.buyer ? text.buyer : text.seller}'),
            const SizedBox(height: 8),
            Text(
              text.fulfilmentNoAutomaticRelease,
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
            if (_error != null) ...[
              const SizedBox(height: 10),
              Text(_error!, style: const TextStyle(color: Colors.red)),
            ],
            if (challengeEnabled) ...[
              const SizedBox(height: 10),
              Text(text.fulfilmentWebOnly),
            ],
            const SizedBox(height: 14),
            if (challengeEnabled)
              OutlinedButton.icon(
                key: Key('open-secure-fulfilment-${order.id}'),
                onPressed: _openingWeb ? null : _openSecureWebsite,
                icon: _openingWeb
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.open_in_browser),
                label: Text(
                  _openingWeb
                      ? text.openingSecureWebsite
                      : text.openSecureOrderWebsite,
                ),
              )
            else
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: widget.entry.actions
                    .map(
                      (action) => OutlinedButton.icon(
                        key: Key('fulfilment-${action.wireValue}-${order.id}'),
                        onPressed: _submitting
                            ? null
                            : () => _requestAction(action),
                        icon: _submitting
                            ? const SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              )
                            : Icon(
                                action == MobileFulfilmentAction.shipped
                                    ? Icons.local_shipping_outlined
                                    : action ==
                                            MobileFulfilmentAction.confirmReceived
                                        ? Icons.inventory_2_outlined
                                        : Icons.store_mall_directory_outlined,
                              ),
                        label: Text(_actionLabel(text, action)),
                      ),
                    )
                    .toList(growable: false),
              ),
          ],
        ),
      ),
    );
  }
}
