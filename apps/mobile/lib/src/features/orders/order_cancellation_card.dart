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
import '../../session/session_scope.dart';

class OrderCancellationCard extends StatefulWidget {
  const OrderCancellationCard({
    super.key,
    required this.order,
    required this.accessToken,
    required this.onCancelled,
    this.cancellationGateway,
    this.challengeGateway,
    this.secureWebHandoffGateway,
  });

  final OrderActivity order;
  final String accessToken;
  final Future<void> Function() onCancelled;
  final OrderCancellationGateway? cancellationGateway;
  final ChallengeConfigurationGateway? challengeGateway;
  final SecureWebHandoffGateway? secureWebHandoffGateway;

  @override
  State<OrderCancellationCard> createState() => _OrderCancellationCardState();
}

class _OrderCancellationCardState extends State<OrderCancellationCard> {
  OrderCancellationGateway? _cancellationGateway;
  ChallengeConfigurationGateway? _challengeGateway;
  SecureWebHandoffGateway? _secureWebHandoffGateway;
  MobileChallengeConfiguration? _configuration;
  bool _initialized = false;
  bool _loadingConfiguration = false;
  bool _configurationFailed = false;
  bool _submitting = false;
  bool _openingWeb = false;
  String? _error;

  bool get _eligible =>
      widget.order.role == OrderRole.buyer &&
      widget.order.status == OrderActivityStatus.pending;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialized) {
      return;
    }
    _initialized = true;

    if (!_eligible) {
      return;
    }

    if (widget.cancellationGateway != null &&
        widget.challengeGateway != null &&
        widget.secureWebHandoffGateway != null) {
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
      _cancellationGateway = widget.cancellationGateway ??
          OrderCancellationApi(authedApi: authedApi);
      _challengeGateway = widget.challengeGateway ??
          ChallengeConfigurationApi(baseUrl: apiBaseUrl);
      _secureWebHandoffGateway = widget.secureWebHandoffGateway ??
          BrowserSecureWebHandoff(
            webBaseUrl: Uri.parse(MobileEnvironment.webBaseUrl),
          );
    }

    unawaited(_loadConfiguration());
  }

  Future<void> _loadConfiguration() async {
    final gateway = _challengeGateway;
    if (gateway == null || _loadingConfiguration) {
      return;
    }

    setState(() {
      _loadingConfiguration = true;
      _configurationFailed = false;
      _error = null;
    });

    try {
      final configuration = await gateway.fetch();
      if (mounted) {
        setState(() => _configuration = configuration);
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _configuration = null;
          _configurationFailed = true;
        });
      }
    } finally {
      if (mounted) {
        setState(() => _loadingConfiguration = false);
      }
    }
  }

  Future<void> _openSecureWebsite() async {
    if (_openingWeb) {
      return;
    }
    final gateway = _secureWebHandoffGateway;
    if (gateway == null) {
      _showError(AppLocalizations.of(context).unableToOpenSecureWebsite);
      return;
    }

    setState(() {
      _openingWeb = true;
      _error = null;
    });

    var opened = false;
    try {
      opened = await gateway.openOrder(
        locale: Localizations.localeOf(context).languageCode,
        orderId: widget.order.id,
      );
    } catch (_) {
      opened = false;
    } finally {
      if (mounted) {
        setState(() => _openingWeb = false);
      }
    }

    if (!opened && mounted) {
      _showError(AppLocalizations.of(context).unableToOpenSecureWebsite);
    }
  }

  Future<void> _confirmCancellation() async {
    final text = AppLocalizations.of(context);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(text.confirmOrderCancellation),
        content: Text(text.confirmOrderCancellationBody),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(text.keepOrder),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(text.confirmOrderCancellation),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) {
      return;
    }
    await _cancel();
  }

  Future<void> _cancel() async {
    final gateway = _cancellationGateway;
    final configuration = _configuration;
    if (gateway == null ||
        configuration == null ||
        configuration.enabled ||
        _submitting) {
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      final result = await gateway.cancel(
        widget.accessToken,
        orderId: widget.order.id,
      );
      if (!mounted) {
        return;
      }
      final text = AppLocalizations.of(context);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            result.unchanged
                ? text.orderAlreadyCancelled
                : text.orderCancellationComplete,
          ),
        ),
      );
      await widget.onCancelled();
    } on SessionRequestException catch (error) {
      if (mounted) {
        final text = AppLocalizations.of(context);
        _showError(
          error.statusCode == 409
              ? text.orderCancellationConflict
              : text.orderCancellationFailed,
        );
      }
    } catch (_) {
      if (mounted) {
        _showError(AppLocalizations.of(context).orderCancellationFailed);
      }
    } finally {
      if (mounted) {
        setState(() => _submitting = false);
      }
    }
  }

  void _showError(String message) {
    setState(() => _error = message);
  }

  @override
  Widget build(BuildContext context) {
    if (!_eligible) {
      return const SizedBox.shrink();
    }

    final text = AppLocalizations.of(context);
    final configuration = _configuration;
    final challengeEnabled = configuration?.enabled == true;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.cancel_outlined, color: SuqnaaBrand.blue),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    text.cancelOrder,
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Text(
              text.cancelOrderTitle,
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 6),
            Text(text.cancelOrderBody),
            if (_configurationFailed) ...[
              const SizedBox(height: 12),
              Text(
                text.orderCancellationUnavailable,
                style: const TextStyle(color: Colors.red),
              ),
            ],
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(
                _error!,
                style: const TextStyle(color: Colors.red),
              ),
            ],
            if (challengeEnabled) ...[
              const SizedBox(height: 12),
              Text(
                text.orderCancellationWebOnly,
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
            ],
            const SizedBox(height: 16),
            if (_loadingConfiguration)
              const Center(child: CircularProgressIndicator())
            else if (challengeEnabled)
              OutlinedButton.icon(
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
              OutlinedButton.icon(
                onPressed: configuration == null ||
                        _configurationFailed ||
                        _submitting
                    ? null
                    : _confirmCancellation,
                icon: _submitting
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.cancel_outlined),
                label: Text(
                  _submitting ? text.cancellingOrder : text.cancelOrder,
                ),
              ),
          ],
        ),
      ),
    );
  }
}
