import 'package:flutter/material.dart';
import '../../api/public_listing_api.dart';
import '../../brand/brand.dart';
import 'listing_detail_screen.dart';

class MarketplaceScreen extends StatefulWidget {
  const MarketplaceScreen({super.key});

  @override
  State<MarketplaceScreen> createState() => _MarketplaceScreenState();
}

class _MarketplaceScreenState extends State<MarketplaceScreen> {
  final _api = PublicListingApi();
  final _searchController = TextEditingController();

  List<Map<String, dynamic>> _listings = [];
  String? _nextCursor;
  bool _loading = true;
  bool _loadingMore = false;
  String? _error;
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _load({bool reset = false}) async {
    if (reset) {
      setState(() {
        _loading = true;
        _error = null;
        _listings = [];
        _nextCursor = null;
      });
    }

    try {
      final data = await _api.getListings(
        limit: 20,
        q: _searchQuery.isEmpty ? null : _searchQuery,
      );
      final items = (data['listings'] as List).cast<Map<String, dynamic>>();
      final pagination = data['pagination'] as Map<String, dynamic>;

      if (mounted) {
        setState(() {
          _listings = reset ? items : [..._listings, ...items];
          _nextCursor = pagination['nextCursor'] as String?;
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = 'Could not load marketplace. Pull down to retry.';
          _loading = false;
        });
      }
    }
  }

  Future<void> _loadMore() async {
    if (_loadingMore || _nextCursor == null) return;
    setState(() => _loadingMore = true);

    try {
      final data = await _api.getListings(
        limit: 20,
        before: _nextCursor,
        q: _searchQuery.isEmpty ? null : _searchQuery,
      );
      final items = (data['listings'] as List).cast<Map<String, dynamic>>();
      final pagination = data['pagination'] as Map<String, dynamic>;

      if (mounted) {
        setState(() {
          _listings = [..._listings, ...items];
          _nextCursor = pagination['nextCursor'] as String?;
          _loadingMore = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() => _loadingMore = false);
      }
    }
  }

  void _search(String query) {
    _searchQuery = query.trim();
    _load(reset: true);
  }

  String _formatPrice(Map<String, dynamic> listing) {
    final amount = double.tryParse(listing['priceAmount'].toString()) ?? 0;
    final currency = listing['currencyCode'] as String? ?? '';
    return '${amount.toStringAsFixed(2)} $currency';
  }

  String _location(Map<String, dynamic> listing) {
    final parts = [
      listing['city'],
      listing['region'],
      listing['countryCode'],
    ].whereType<String>().where((s) => s.isNotEmpty).toList();
    return parts.isEmpty ? 'Location not specified' : parts.join(', ');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: SuqnaaBrand.ivory,
      appBar: AppBar(
        backgroundColor: SuqnaaBrand.ivory,
        elevation: 0,
        title: const Text('Marketplace'),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: 'Search listings…',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _searchController.text.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear),
                        onPressed: () {
                          _searchController.clear();
                          _search('');
                        },
                      )
                    : null,
                filled: true,
                fillColor: Colors.white,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(30),
                  borderSide: BorderSide.none,
                ),
                contentPadding: const EdgeInsets.symmetric(vertical: 0),
              ),
              textInputAction: TextInputAction.search,
              onSubmitted: _search,
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _error != null
                    ? Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(_error!, textAlign: TextAlign.center),
                            const SizedBox(height: 12),
                            ElevatedButton(
                              onPressed: () => _load(reset: true),
                              child: const Text('Retry'),
                            ),
                          ],
                        ),
                      )
                    : _listings.isEmpty
                        ? Center(
                            child: Text(
                              _searchQuery.isNotEmpty
                                  ? 'No listings match your search'
                                  : 'No active listings yet',
                            ),
                          )
                        : RefreshIndicator(
                            onRefresh: () => _load(reset: true),
                            child: GridView.builder(
                              padding: const EdgeInsets.all(12),
                              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                                crossAxisCount: 2,
                                crossAxisSpacing: 10,
                                mainAxisSpacing: 10,
                                childAspectRatio: 0.75,
                              ),
                              itemCount: _listings.length + (_nextCursor != null ? 1 : 0),
                              itemBuilder: (context, index) {
                                if (index == _listings.length) {
                                  _loadMore();
                                  return const Center(
                                    child: Padding(
                                      padding: EdgeInsets.all(16),
                                      child: CircularProgressIndicator(),
                                    ),
                                  );
                                }

                                final listing = _listings[index];
                                final coverUrl = listing['coverImageUrl'] as String?;

                                return GestureDetector(
                                  onTap: () => Navigator.of(context).push(
                                    MaterialPageRoute(
                                      builder: (_) => ListingDetailScreen(
                                        listingId: listing['id'] as String,
                                        title: listing['title'] as String? ?? '',
                                      ),
                                    ),
                                  ),
                                  child: Container(
                                    decoration: BoxDecoration(
                                      color: Colors.white,
                                      borderRadius: BorderRadius.circular(16),
                                    ),
                                    clipBehavior: Clip.antiAlias,
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Expanded(
                                          child: coverUrl != null
                                              ? Image.network(
                                                  coverUrl,
                                                  fit: BoxFit.cover,
                                                  width: double.infinity,
                                                  errorBuilder: (_, __, ___) => _PlaceholderImage(
                                                    letter: (listing['title'] as String? ?? '?')[0],
                                                  ),
                                                )
                                              : _PlaceholderImage(
                                                  letter: (listing['title'] as String? ?? '?')[0],
                                                ),
                                        ),
                                        Padding(
                                          padding: const EdgeInsets.all(10),
                                          child: Column(
                                            crossAxisAlignment: CrossAxisAlignment.start,
                                            children: [
                                              Text(
                                                listing['title'] as String? ?? '',
                                                style: const TextStyle(
                                                  fontWeight: FontWeight.w700,
                                                  fontSize: 13,
                                                ),
                                                maxLines: 2,
                                                overflow: TextOverflow.ellipsis,
                                              ),
                                              const SizedBox(height: 4),
                                              Text(
                                                _formatPrice(listing),
                                                style: TextStyle(
                                                  color: SuqnaaBrand.blue,
                                                  fontWeight: FontWeight.w800,
                                                  fontSize: 13,
                                                ),
                                              ),
                                              const SizedBox(height: 2),
                                              Text(
                                                _location(listing),
                                                style: const TextStyle(
                                                  fontSize: 11,
                                                  color: Colors.grey,
                                                ),
                                                maxLines: 1,
                                                overflow: TextOverflow.ellipsis,
                                              ),
                                            ],
                                          ),
                                        ),
                                      ],
                                    ),
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

class _PlaceholderImage extends StatelessWidget {
  const _PlaceholderImage({required this.letter});

  final String letter;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: const Color(0xFFE8EEF9),
      child: Center(
        child: Text(
          letter.toUpperCase(),
          style: const TextStyle(
            fontSize: 36,
            fontWeight: FontWeight.w800,
            color: SuqnaaBrand.blue,
          ),
        ),
      ),
    );
  }
}
