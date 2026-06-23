import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../../api/public_listing_api.dart';
import '../../api/trading_api.dart';
import '../../brand/brand.dart';
import '../../config/mobile_environment.dart';
import '../../session/session_scope.dart';
import '../account/account_login_screen.dart';

class ListingDetailScreen extends StatefulWidget {
  const ListingDetailScreen({
    super.key,
    required this.listingId,
    required this.title,
  });

  final String listingId;
  final String title;

  @override
  State<ListingDetailScreen> createState() => _ListingDetailScreenState();
}

class _ListingDetailScreenState extends State<ListingDetailScreen> {
  final _api = PublicListingApi();
  late final TradingApi _tradingApi = TradingApi(
    baseUrl: Uri.parse(MobileEnvironment.apiBaseUrl),
  );
  Map<String, dynamic>? _listing;
  bool _loading = true;
  String? _error;
  int _imageIndex = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final listing = await _api.getListing(widget.listingId);
      if (mounted) {
        setState(() {
          _listing = listing;
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = 'Could not load listing.';
          _loading = false;
        });
      }
    }
  }

  String _formatPrice(Map<String, dynamic> listing) {
    final amount = double.tryParse(listing['priceAmount'].toString()) ?? 0;
    final currency = listing['currencyCode'] as String? ?? '';
    return '${amount.toStringAsFixed(2)} $currency';
  }

  String _location(Map<String, dynamic> listing) {
    final parts = [
      listing['suburb'],
      listing['city'],
      listing['region'],
      listing['countryCode'],
    ].whereType<String>().where((s) => s.isNotEmpty).toList();
    return parts.isEmpty ? 'Location not specified' : parts.join(', ');
  }

  String _conditionLabel(String condition) {
    const labels = {
      'new': 'New',
      'like_new': 'Like new',
      'good': 'Good',
      'fair': 'Fair',
      'parts_or_repair': 'Parts / repair',
    };
    return labels[condition] ?? condition;
  }

  Future<void> _showMakeOffer(Map<String, dynamic> listing) async {
    final session = SessionScope.of(context);

    if (!session.isSignedIn) {
      await Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => const AccountLoginScreen()),
      );
      if (!mounted) return;
      // Re-read session after potential sign-in
      if (!SessionScope.of(context).isSignedIn) return;
    }

    if (!mounted) return;

    final askingPrice = double.tryParse(listing['priceAmount'].toString()) ?? 0;
    final currency = listing['currencyCode'] as String? ?? 'AUD';
    final controller = TextEditingController(
      text: askingPrice > 0 ? askingPrice.toStringAsFixed(2) : '',
    );

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (sheetContext) => _MakeOfferSheet(
        listing: listing,
        askingPrice: askingPrice,
        currency: currency,
        controller: controller,
        tradingApi: _tradingApi,
        onSuccess: () {
          Navigator.of(sheetContext).pop();
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Offer submitted!')),
          );
        },
      ),
    );
    controller.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    final listing = _listing;
    final isSeller = listing != null &&
        session.userId != null &&
        listing['seller'] is Map &&
        (listing['seller'] as Map)['id'] == session.userId;

    return Scaffold(
      backgroundColor: SuqnaaBrand.ivory,
      appBar: AppBar(
        backgroundColor: SuqnaaBrand.ivory,
        elevation: 0,
        title: Text(
          widget.title,
          overflow: TextOverflow.ellipsis,
        ),
      ),
      bottomNavigationBar: (!_loading && _error == null && listing != null && !isSeller)
          ? SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                child: FilledButton.icon(
                  onPressed: () => _showMakeOffer(listing),
                  icon: const Icon(Icons.handshake_outlined),
                  label: const Text('Make offer'),
                  style: FilledButton.styleFrom(
                    backgroundColor: SuqnaaBrand.blue,
                    minimumSize: const Size.fromHeight(52),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                ),
              ),
            )
          : null,
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(_error!),
                      const SizedBox(height: 12),
                      ElevatedButton(
                        onPressed: _load,
                        child: const Text('Retry'),
                      ),
                    ],
                  ),
                )
              : _buildDetail(),
    );
  }

  Widget _buildDetail() {
    final listing = _listing!;
    final media = (listing['media'] as List?)?.cast<Map<String, dynamic>>() ?? [];
    final seller = listing['seller'] as Map<String, dynamic>? ?? {};
    final sellerName = seller['businessName'] as String? ??
        seller['displayName'] as String? ??
        'Suqnaa seller';

    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Image gallery
          if (media.isNotEmpty)
            Column(
              children: [
                SizedBox(
                  height: 260,
                  child: PageView.builder(
                    itemCount: media.length,
                    onPageChanged: (i) => setState(() => _imageIndex = i),
                    itemBuilder: (context, index) {
                      final url = media[index]['url'] as String?;
                      return url != null
                          ? Image.network(
                              url,
                              fit: BoxFit.cover,
                              errorBuilder: (_, __, ___) => _placeholder(listing['title'] as String? ?? '?'),
                            )
                          : _placeholder(listing['title'] as String? ?? '?');
                    },
                  ),
                ),
                if (media.length > 1)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: List.generate(
                        media.length,
                        (i) => AnimatedContainer(
                          duration: const Duration(milliseconds: 200),
                          margin: const EdgeInsets.symmetric(horizontal: 3),
                          width: i == _imageIndex ? 12 : 6,
                          height: 6,
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(3),
                            color: i == _imageIndex
                                ? SuqnaaBrand.blue
                                : Colors.grey.shade300,
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            )
          else
            SizedBox(
              height: 200,
              child: _placeholder(listing['title'] as String? ?? '?'),
            ),

          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Tags row
                Wrap(
                  spacing: 8,
                  children: [
                    _Tag(_conditionLabel(listing['condition'] as String? ?? '')),
                    if (listing['allowDelivery'] == true) const _Tag('Delivery'),
                    if (listing['allowPickup'] == true) const _Tag('Pickup'),
                  ],
                ),
                const SizedBox(height: 12),

                // Title & price
                Text(
                  listing['title'] as String? ?? '',
                  style: const TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  _formatPrice(listing),
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                    color: SuqnaaBrand.blue,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  _location(listing),
                  style: const TextStyle(color: Colors.grey),
                ),
                const SizedBox(height: 16),

                // Description
                Text(
                  listing['description'] as String? ?? '',
                  style: const TextStyle(fontSize: 15, height: 1.5),
                ),
                const SizedBox(height: 24),

                // Seller card
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Seller',
                        style: TextStyle(
                          color: Colors.grey,
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          CircleAvatar(
                            backgroundColor: SuqnaaBrand.blue,
                            child: Text(
                              sellerName[0].toUpperCase(),
                              style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  sellerName,
                                  style: const TextStyle(fontWeight: FontWeight.w700),
                                ),
                                if (seller['isBusiness'] == true)
                                  const Text(
                                    'Business seller',
                                    style: TextStyle(fontSize: 12, color: Colors.grey),
                                  ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      Text(
                        'Trust score: ${seller['trustScore'] ?? 0}/100',
                        style: const TextStyle(fontSize: 13, color: Colors.grey),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),

                // Safety note
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFFF8E6),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0x59D9A441)),
                  ),
                  child: const Text(
                    'Keep communication and payment inside Suqnaa. Never share verification codes or passwords.',
                    style: TextStyle(fontSize: 13, height: 1.4),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _placeholder(String title) {
    return Container(
      color: const Color(0xFFE8EEF9),
      child: Center(
        child: Text(
          title[0].toUpperCase(),
          style: const TextStyle(
            fontSize: 60,
            fontWeight: FontWeight.w900,
            color: SuqnaaBrand.blue,
          ),
        ),
      ),
    );
  }
}

class _MakeOfferSheet extends StatefulWidget {
  const _MakeOfferSheet({
    required this.listing,
    required this.askingPrice,
    required this.currency,
    required this.controller,
    required this.tradingApi,
    required this.onSuccess,
  });

  final Map<String, dynamic> listing;
  final double askingPrice;
  final String currency;
  final TextEditingController controller;
  final TradingApi tradingApi;
  final VoidCallback onSuccess;

  @override
  State<_MakeOfferSheet> createState() => _MakeOfferSheetState();
}

class _MakeOfferSheetState extends State<_MakeOfferSheet> {
  final _formKey = GlobalKey<FormState>();
  bool _submitting = false;
  String? _error;

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate() || _submitting) return;

    final amount = double.tryParse(widget.controller.text.trim());
    if (amount == null) return;

    final session = SessionScope.of(context);
    if (!session.isSignedIn) return;

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      await widget.tradingApi.submitOffer(
        session.access.value,
        {
          'listingId': widget.listing['id'],
          'amount': amount,
          'currencyCode': widget.currency,
          'clientOfferId': _generateUuid(),
        },
      );
      if (mounted) {
        widget.onSuccess();
      }
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Could not submit offer. Please try again.');
      }
    } finally {
      if (mounted) {
        setState(() => _submitting = false);
      }
    }
  }

  static String _generateUuid() {
    final rand = math.Random.secure();
    final bytes = List<int>.generate(16, (_) => rand.nextInt(256));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    String hex(int b) => b.toRadixString(16).padLeft(2, '0');
    return '${bytes.sublist(0, 4).map(hex).join()}-'
        '${bytes.sublist(4, 6).map(hex).join()}-'
        '${bytes.sublist(6, 8).map(hex).join()}-'
        '${bytes.sublist(8, 10).map(hex).join()}-'
        '${bytes.sublist(10).map(hex).join()}';
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;

    return Padding(
      padding: EdgeInsets.fromLTRB(20, 20, 20, 20 + bottomInset),
      child: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Expanded(
                  child: Text(
                    'Make an offer',
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900),
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ],
            ),
            if (widget.askingPrice > 0)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Text(
                  'Asking price: ${widget.askingPrice.toStringAsFixed(2)} ${widget.currency}',
                  style: const TextStyle(color: Colors.grey, fontSize: 13),
                ),
              ),
            TextFormField(
              controller: widget.controller,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              autofocus: true,
              decoration: InputDecoration(
                labelText: 'Your offer (${widget.currency})',
                hintText: '0.00',
                filled: true,
                fillColor: const Color(0xFFF5F7FD),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: BorderSide.none,
                ),
              ),
              validator: (value) {
                final amount = double.tryParse(value?.trim() ?? '');
                if (amount == null || amount <= 0) {
                  return 'Enter a valid amount greater than 0';
                }
                if (widget.askingPrice > 0 && amount > widget.askingPrice) {
                  return 'Offer cannot exceed the asking price';
                }
                return null;
              },
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                  _error!,
                  style: const TextStyle(color: Colors.red, fontSize: 13),
                ),
              ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: _submitting ? null : _submit,
                style: FilledButton.styleFrom(
                  backgroundColor: SuqnaaBrand.blue,
                  minimumSize: const Size.fromHeight(52),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
                child: _submitting
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Text('Submit offer'),
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Keep all communication and payment inside Suqnaa.',
              style: TextStyle(fontSize: 11, color: Colors.grey),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

class _Tag extends StatelessWidget {
  const _Tag(this.label);

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: const Color(0xFFE8EEF9),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        label,
        style: const TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: SuqnaaBrand.blue,
        ),
      ),
    );
  }
}
