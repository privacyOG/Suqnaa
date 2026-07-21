import 'package:flutter/material.dart';
import 'package:suqnaa/l10n/app_localizations.dart';
import '../../brand/brand.dart';
import '../../config/mobile_environment.dart';
import '../../navigation/secure_web_handoff.dart';

class SecureWebHandoffTile extends StatefulWidget {
  const SecureWebHandoffTile({
    super.key,
    this.gateway,
  });

  final SecureWebHandoffGateway? gateway;

  @override
  State<SecureWebHandoffTile> createState() => _SecureWebHandoffTileState();
}

class _SecureWebHandoffTileState extends State<SecureWebHandoffTile> {
  SecureWebHandoffGateway? _gateway;
  bool _opening = false;

  @override
  void initState() {
    super.initState();
    if (widget.gateway != null) {
      _gateway = widget.gateway;
      return;
    }

    try {
      _gateway = BrowserSecureWebHandoff(
        webBaseUrl: Uri.parse(MobileEnvironment.webBaseUrl),
      );
    } catch (_) {
      _gateway = null;
    }
  }

  Future<void> _open() async {
    if (_opening) {
      return;
    }

    final text = AppLocalizations.of(context);
    final gateway = _gateway;
    if (gateway == null) {
      _showFailure(text);
      return;
    }

    setState(() => _opening = true);
    var opened = false;
    try {
      opened = await gateway.openOrders(
        locale: Localizations.localeOf(context).languageCode,
      );
    } catch (_) {
      opened = false;
    } finally {
      if (mounted) {
        setState(() => _opening = false);
      }
    }

    if (!opened && mounted) {
      _showFailure(text);
    }
  }

  void _showFailure(AppLocalizations text) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(text.unableToOpenSecureWebsite)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final text = AppLocalizations.of(context);

    return Card(
      child: ListTile(
        leading: const Icon(Icons.open_in_browser, color: SuqnaaBrand.blue),
        title: Text(
          text.securePaymentWebsite,
          style: const TextStyle(fontWeight: FontWeight.w800),
        ),
        subtitle: Text(
          _opening
              ? text.openingSecureWebsite
              : text.securePaymentWebsiteSubtitle,
        ),
        trailing: _opening
            ? const SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : const Icon(Icons.launch),
        onTap: _opening ? null : _open,
      ),
    );
  }
}
