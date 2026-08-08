import 'dart:async';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:suqnaa/l10n/app_localizations.dart';
import '../../api/catalog_api.dart';
import '../../api/discovery_api.dart';
import '../../api/session_authed_api.dart';
import '../../brand/brand.dart';
import '../../config/mobile_environment.dart';
import '../../session/app_session.dart';
import '../../session/session_scope.dart';
import 'catalog_labels.dart';

class ListingDetailScreen extends StatefulWidget {
  const ListingDetailScreen({
    super.key,
    required this.api,
    required this.listingId,
    required this.initialListing,
    this.discoveryGateway,
    this.accessToken,
  });

  final CatalogGateway api;
  final String listingId;
  final CatalogListingDto initialListing;
  final DiscoveryGateway? discoveryGateway;
  final String? accessToken;

  @override
  State<ListingDetailScreen> createState() => _ListingDetailScreenState();
}

class _ListingDetailScreenState extends State<ListingDetailScreen> {
  late CatalogListingDto _listing = widget.initialListing;
  DiscoveryGateway? _discovery;
  AppSession? _session;
  DiscoveryListingState? _discoveryState;
  bool _discoveryInitialized = false;
  bool _discoveryBusy = false;
  bool _loading = true;
  bool _failed = false;

  String get _accessToken => widget.accessToken ?? _session?.access.value ?? '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_discoveryInitialized) return;
    _discoveryInitialized = true;
    if (widget.discoveryGateway != null) {
      _discovery = widget.discoveryGateway;
    } else {
      final session = SessionScope.maybeOf(context);
      if (session?.isSignedIn == true) {
        _session = session;
        _discovery = DiscoveryApi(
          authedApi: SessionAuthedApi(
            baseUrl: Uri.parse(MobileEnvironment.apiBaseUrl),
            sessionProvider: () => session!,
          ),
        );
      }
    }
    if (_discovery != null && _accessToken.isNotEmpty) {
      unawaited(_loadDiscovery());
    }
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _failed = false;
    });

    try {
      final listing = await widget.api.fetchListing(widget.listingId);
      if (mounted) setState(() => _listing = listing);
    } catch (_) {
      if (mounted) setState(() => _failed = true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loadDiscovery() async {
    final gateway = _discovery;
    final token = _accessToken;
    if (gateway == null || token.isEmpty) return;
    try {
      final state = await gateway.getListingState(token, widget.listingId);
      await gateway.recordView(token, widget.listingId);
      if (mounted) setState(() => _discoveryState = state);
    } catch (_) {
      // Public listing detail remains usable when protected discovery state fails.
    }
  }

  Future<void> _toggleSaved() async {
    final gateway = _discovery;
    final token = _accessToken;
    final state = _discoveryState;
    if (gateway == null || token.isEmpty || state == null || _discoveryBusy) return;
    setState(() => _discoveryBusy = true);
    try {
      if (state.saved) {
        await gateway.removeSavedListing(token, widget.listingId);
      } else {
        await gateway.saveListing(token, widget.listingId);
      }
      if (mounted) {
        setState(() => _discoveryState = DiscoveryListingState(
          listingId: state.listingId,
          saved: !state.saved,
          watching: state.watching,
        ));
      }
    } finally {
      if (mounted) setState(() => _discoveryBusy = false);
    }
  }

  Future<void> _toggleWatch() async {
    final gateway = _discovery;
    final token = _accessToken;
    final state = _discoveryState;
    if (gateway == null || token.isEmpty || state == null || _discoveryBusy) return;
    setState(() => _discoveryBusy = true);
    try {
      if (state.watching) {
        await gateway.removeWatchedListing(token, widget.listingId);
      } else {
        await gateway.watchListing(token, widget.listingId);
      }
      if (mounted) {
        setState(() => _discoveryState = DiscoveryListingState(
          listingId: state.listingId,
          saved: state.saved,
          watching: !state.watching,
        ));
      }
    } finally {
      if (mounted) setState(() => _discoveryBusy = false);
    }
  }

  String _formatPrice(BuildContext context) {
    try {
      return NumberFormat.simpleCurrency(
        name: _listing.currencyCode,
        locale: Localizations.localeOf(context).toLanguageTag(),
      ).format(_listing.priceAmount);
    } catch (_) {
      return '${_listing.priceAmount.toStringAsFixed(2)} ${_listing.currencyCode}';
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = AppLocalizations.of(context);
    final seller = _listing.seller;
    final ar = Localizations.localeOf(context).languageCode == 'ar';

    return Scaffold(
      backgroundColor: SuqnaaBrand.ivory,
      appBar: AppBar(
        backgroundColor: SuqnaaBrand.ivory,
        title: Text(text.listingDetails),
        actions: [
          if (_discoveryState != null)
            IconButton(
              key: const Key('listing-save-action'),
              tooltip: _discoveryState!.saved
                  ? (ar ? 'إزالة من المحفوظات' : 'Remove saved')
                  : (ar ? 'حفظ الإعلان' : 'Save listing'),
              onPressed: _discoveryBusy ? null : _toggleSaved,
              icon: Icon(_discoveryState!.saved ? Icons.bookmark : Icons.bookmark_border),
            ),
          if (_discoveryState != null)
            IconButton(
              key: const Key('listing-watch-action'),
              tooltip: _discoveryState!.watching
                  ? (ar ? 'إيقاف المراقبة' : 'Stop watching')
                  : (ar ? 'مراقبة الإعلان' : 'Watch listing'),
              onPressed: _discoveryBusy ? null : _toggleWatch,
              icon: Icon(_discoveryState!.watching ? Icons.visibility : Icons.visibility_outlined),
            ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          await _load();
          await _loadDiscovery();
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 10, 20, 32),
          children: [
            if (_loading) const LinearProgressIndicator(),
            if (_failed)
              _MessageCard(
                message: text.unableToLoadListing,
                actionLabel: text.retry,
                onPressed: _load,
              ),
            _MediaGallery(listing: _listing),
            const SizedBox(height: 18),
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(22),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      _Tag(label: catalogConditionLabel(text, _listing.condition)),
                      _Tag(label: catalogAvailabilityLabel(text, _listing.availabilityStatus)),
                      if (_listing.allowPickup) _Tag(label: text.pickup),
                      if (_listing.allowDelivery) _Tag(label: text.delivery),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Text(
                    _listing.title,
                    style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w900),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    _formatPrice(context),
                    style: const TextStyle(
                      color: SuqnaaBrand.blue,
                      fontSize: 26,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 18),
                  Text(text.description, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900)),
                  const SizedBox(height: 8),
                  Text(_listing.description, style: const TextStyle(height: 1.55)),
                ],
              ),
            ),
            const SizedBox(height: 16),
            _FactsCard(listing: _listing, price: _formatPrice(context)),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(22)),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(text.seller, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900)),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      CircleAvatar(
                        radius: 27,
                        backgroundColor: SuqnaaBrand.teal,
                        child: Text(
                          (seller?.displayName.isNotEmpty ?? false)
                              ? seller!.displayName.characters.first.toUpperCase()
                              : 'S',
                          style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w900),
                        ),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              seller?.businessName?.isNotEmpty == true
                                  ? seller!.businessName!
                                  : seller?.displayName ?? text.notSpecified,
                              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
                            ),
                            if (seller?.city != null || seller?.countryCode != null)
                              Text([seller?.city, seller?.countryCode].where((value) => value?.isNotEmpty == true).join(', ')),
                          ],
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MediaGallery extends StatelessWidget {
  const _MediaGallery({required this.listing});
  final CatalogListingDto listing;

  @override
  Widget build(BuildContext context) {
    if (listing.media.isEmpty) {
      return Container(
        height: 320,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(24),
          gradient: const LinearGradient(colors: [SuqnaaBrand.blue, SuqnaaBrand.teal]),
        ),
        child: Center(
          child: Text(
            listing.title.isEmpty ? 'S' : listing.title.characters.first,
            style: const TextStyle(color: Colors.white, fontSize: 92, fontWeight: FontWeight.w900),
          ),
        ),
      );
    }
    return SizedBox(
      height: 340,
      child: PageView.builder(
        itemCount: listing.media.length,
        itemBuilder: (context, index) {
          final media = listing.media[index];
          return ClipRRect(
            borderRadius: BorderRadius.circular(24),
            child: Image.network(
              media.url,
              fit: BoxFit.cover,
              semanticLabel: media.altText ?? listing.title,
              errorBuilder: (_, __, ___) => Container(color: Colors.white, alignment: Alignment.center, child: const Icon(Icons.broken_image_outlined, size: 54)),
            ),
          );
        },
      ),
    );
  }
}

class _FactsCard extends StatelessWidget {
  const _FactsCard({required this.listing, required this.price});
  final CatalogListingDto listing;
  final String price;

  @override
  Widget build(BuildContext context) {
    final text = AppLocalizations.of(context);
    final location = listing.location.isEmpty ? text.notSpecified : listing.location;
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(22)),
      child: Column(
        children: [
          _Fact(label: text.price, value: price),
          const Divider(height: 24),
          _Fact(label: text.location, value: location),
          const Divider(height: 24),
          _Fact(label: text.photos, value: listing.mediaCount.toString()),
          const Divider(height: 24),
          _Fact(label: text.availability, value: catalogAvailabilityLabel(text, listing.availabilityStatus)),
        ],
      ),
    );
  }
}

class _Fact extends StatelessWidget {
  const _Fact({required this.label, required this.value});
  final String label;
  final String value;
  @override
  Widget build(BuildContext context) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      SizedBox(width: 110, child: Text(label, style: const TextStyle(fontWeight: FontWeight.w800))),
      Expanded(child: Text(value)),
    ],
  );
}

class _Tag extends StatelessWidget {
  const _Tag({required this.label});
  final String label;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
    decoration: BoxDecoration(color: const Color(0xFFF1F5FF), borderRadius: BorderRadius.circular(999)),
    child: Text(label, style: const TextStyle(color: SuqnaaBrand.blue, fontSize: 12, fontWeight: FontWeight.w800)),
  );
}

class _MessageCard extends StatelessWidget {
  const _MessageCard({required this.message, required this.actionLabel, required this.onPressed});
  final String message;
  final String actionLabel;
  final VoidCallback onPressed;
  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.only(bottom: 16),
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(18)),
    child: Row(children: [Expanded(child: Text(message)), TextButton(onPressed: onPressed, child: Text(actionLabel))]),
  );
}
