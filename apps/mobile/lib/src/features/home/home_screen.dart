import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:suqnaa/l10n/app_localizations.dart';
import '../../api/catalog_api.dart';
import '../../brand/brand.dart';
import '../../config/mobile_environment.dart';
import '../account/account_screen.dart';
import '../catalog/catalog_filter_sheet.dart';
import '../catalog/catalog_labels.dart';
import '../catalog/listing_detail_screen.dart';
import '../sell/create_listing_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, this.catalogApi});

  final CatalogGateway? catalogApi;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final TextEditingController _searchController = TextEditingController();
  late final CatalogGateway _api;
  CatalogSearchOptions _options = const CatalogSearchOptions(limit: 20);
  List<CatalogCategoryDto> _categories = const [];
  List<CatalogListingDto> _listings = const [];
  String? _nextCursor;
  bool _loading = true;
  bool _loadingMore = false;
  bool _failed = false;
  int _requestRevision = 0;

  @override
  void initState() {
    super.initState();
    _api = widget.catalogApi ??
        CatalogApi(baseUrl: Uri.parse(MobileEnvironment.apiBaseUrl));
    _loadCategories();
    _loadListings(reset: true);
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadCategories() async {
    try {
      final categories = await _api.fetchCategories();
      if (mounted) {
        setState(() => _categories = categories);
      }
    } catch (_) {
      // Listing search remains available when categories are unavailable.
    }
  }

  Future<void> _loadListings({required bool reset}) async {
    if (!reset && (_nextCursor == null || _loadingMore)) {
      return;
    }

    final revision = ++_requestRevision;
    setState(() {
      if (reset) {
        _loading = true;
        _failed = false;
      } else {
        _loadingMore = true;
      }
    });

    try {
      final response = await _api.search(
        _options.withCursor(reset ? null : _nextCursor),
      );
      if (!mounted || revision != _requestRevision) {
        return;
      }

      setState(() {
        _listings = reset
            ? response.listings
            : [..._listings, ...response.listings];
        _nextCursor = response.hasMore ? response.nextCursor : null;
        _failed = false;
      });
    } catch (_) {
      if (mounted && revision == _requestRevision) {
        setState(() => _failed = true);
      }
    } finally {
      if (mounted && revision == _requestRevision) {
        setState(() {
          _loading = false;
          _loadingMore = false;
        });
      }
    }
  }

  CatalogSearchOptions _optionsWith({
    String? query,
    String? categoryId,
    bool clearCategory = false,
  }) {
    return CatalogSearchOptions(
      limit: _options.limit,
      query: query,
      categoryId: clearCategory ? null : categoryId ?? _options.categoryId,
      condition: _options.condition,
      availabilityStatus: _options.availabilityStatus,
      minimumPrice: _options.minimumPrice,
      maximumPrice: _options.maximumPrice,
      currency: _options.currency,
      country: _options.country,
      city: _options.city,
      fulfilment: _options.fulfilment,
    );
  }

  void _submitSearch(String value) {
    final query = value.trim();
    setState(() {
      _options = _optionsWith(query: query.isEmpty ? null : query);
    });
    _loadListings(reset: true);
  }

  void _selectCategory(String? categoryId) {
    setState(() {
      _options = _optionsWith(
        query: _options.query,
        categoryId: categoryId,
        clearCategory: categoryId == null,
      );
    });
    _loadListings(reset: true);
  }

  Future<void> _openFilters() async {
    final result = await showModalBottomSheet<CatalogSearchOptions>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => CatalogFilterSheet(initial: _options),
    );
    if (result == null || !mounted) {
      return;
    }

    setState(() => _options = result);
    await _loadListings(reset: true);
  }

  void _clearAll() {
    _searchController.clear();
    setState(() => _options = const CatalogSearchOptions(limit: 20));
    _loadListings(reset: true);
  }

  int get _activeFilterCount {
    var count = 0;
    if (_options.query?.isNotEmpty == true) count += 1;
    if (_options.categoryId != null) count += 1;
    if (_options.condition != null) count += 1;
    if (_options.availabilityStatus != null) count += 1;
    if (_options.minimumPrice != null || _options.maximumPrice != null) count += 1;
    if (_options.currency != null) count += 1;
    if (_options.country != null || _options.city != null) count += 1;
    if (_options.fulfilment != null) count += 1;
    return count;
  }

  void _openListing(CatalogListingDto listing) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ListingDetailScreen(
          api: _api,
          listingId: listing.id,
          initialListing: listing,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final text = AppLocalizations.of(context);
    final languageCode = Localizations.localeOf(context).languageCode;

    return Scaffold(
      backgroundColor: SuqnaaBrand.ivory,
      appBar: AppBar(
        backgroundColor: SuqnaaBrand.ivory,
        elevation: 0,
        title: Text(text.appName),
        actions: [
          IconButton(
            tooltip: text.account,
            icon: const Icon(Icons.person_outline),
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const AccountScreen()),
            ),
          ),
          const SizedBox(width: 12),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => const CreateListingScreen()),
        ),
        icon: const Icon(Icons.add_business_outlined),
        label: Text(text.sell),
      ),
      body: RefreshIndicator(
        onRefresh: () => _loadListings(reset: true),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 110),
          children: [
            _SearchBox(
              controller: _searchController,
              hint: text.homeSearchHint,
              activeFilterCount: _activeFilterCount,
              onSubmitted: _submitSearch,
              onFilters: _openFilters,
            ),
            const SizedBox(height: 16),
            _CategoryRow(
              categories: _categories,
              languageCode: languageCode,
              selectedId: _options.categoryId,
              allLabel: text.allCategories,
              onSelected: _selectCategory,
            ),
            const SizedBox(height: 18),
            _HeroCard(title: text.heroTitle, action: text.shopNow),
            const SizedBox(height: 24),
            Row(
              children: [
                Expanded(
                  child: Text(
                    text.trendingNearYou,
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                if (!_loading && !_failed)
                  Text(
                    '${_listings.length} ${text.results}',
                    style: const TextStyle(
                      color: SuqnaaBrand.muted,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
              ],
            ),
            if (_options.hasFilters) ...[
              const SizedBox(height: 8),
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: TextButton.icon(
                  onPressed: _clearAll,
                  icon: const Icon(Icons.filter_alt_off_outlined),
                  label: Text(text.clearFilters),
                ),
              ),
            ],
            const SizedBox(height: 12),
            _CatalogBody(
              loading: _loading,
              failed: _failed,
              hasFilters: _options.hasFilters,
              listings: _listings,
              text: text,
              onRetry: () => _loadListings(reset: true),
              onListing: _openListing,
            ),
            if (_nextCursor != null && !_loading && !_failed) ...[
              const SizedBox(height: 18),
              OutlinedButton.icon(
                onPressed: _loadingMore
                    ? null
                    : () => _loadListings(reset: false),
                icon: _loadingMore
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.expand_more),
                label: Text(
                  _loadingMore ? text.loadingMore : text.loadMore,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _SearchBox extends StatelessWidget {
  const _SearchBox({
    required this.controller,
    required this.hint,
    required this.activeFilterCount,
    required this.onSubmitted,
    required this.onFilters,
  });

  final TextEditingController controller;
  final String hint;
  final int activeFilterCount;
  final ValueChanged<String> onSubmitted;
  final VoidCallback onFilters;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      textInputAction: TextInputAction.search,
      onSubmitted: onSubmitted,
      decoration: InputDecoration(
        hintText: hint,
        prefixIcon: const Icon(Icons.search),
        suffixIcon: Stack(
          alignment: Alignment.center,
          children: [
            IconButton(
              onPressed: onFilters,
              icon: const Icon(Icons.tune),
            ),
            if (activeFilterCount > 0)
              PositionedDirectional(
                top: 7,
                end: 7,
                child: Container(
                  constraints: const BoxConstraints(minWidth: 17, minHeight: 17),
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  decoration: const BoxDecoration(
                    color: SuqnaaBrand.blue,
                    shape: BoxShape.circle,
                  ),
                  alignment: Alignment.center,
                  child: Text(
                    '$activeFilterCount',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 10,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
              ),
          ],
        ),
        filled: true,
        fillColor: Colors.white,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(30),
          borderSide: BorderSide.none,
        ),
      ),
    );
  }
}

class _CategoryRow extends StatelessWidget {
  const _CategoryRow({
    required this.categories,
    required this.languageCode,
    required this.selectedId,
    required this.allLabel,
    required this.onSelected,
  });

  final List<CatalogCategoryDto> categories;
  final String languageCode;
  final String? selectedId;
  final String allLabel;
  final ValueChanged<String?> onSelected;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 45,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: categories.length + 1,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          if (index == 0) {
            return ChoiceChip(
              label: Text(allLabel),
              selected: selectedId == null,
              onSelected: (_) => onSelected(null),
            );
          }

          final category = categories[index - 1];
          return ChoiceChip(
            label: Text(category.labelFor(languageCode)),
            selected: selectedId == category.id,
            onSelected: (_) => onSelected(category.id),
          );
        },
      ),
    );
  }
}

class _HeroCard extends StatelessWidget {
  const _HeroCard({required this.title, required this.action});

  final String title;
  final String action;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(24),
        gradient: const LinearGradient(
          colors: [SuqnaaBrand.blue, SuqnaaBrand.teal],
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 26,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 16),
          Text(
            action,
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _CatalogBody extends StatelessWidget {
  const _CatalogBody({
    required this.loading,
    required this.failed,
    required this.hasFilters,
    required this.listings,
    required this.text,
    required this.onRetry,
    required this.onListing,
  });

  final bool loading;
  final bool failed;
  final bool hasFilters;
  final List<CatalogListingDto> listings;
  final AppLocalizations text;
  final VoidCallback onRetry;
  final ValueChanged<CatalogListingDto> onListing;

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return _StatusCard(
        icon: Icons.storefront_outlined,
        message: text.loadingListings,
        loading: true,
      );
    }
    if (failed) {
      return _StatusCard(
        icon: Icons.cloud_off_outlined,
        message: text.unableToLoadListings,
        actionLabel: text.retry,
        onAction: onRetry,
      );
    }
    if (listings.isEmpty) {
      return _StatusCard(
        icon: Icons.search_off_outlined,
        message: hasFilters ? text.noSearchResults : text.noListings,
      );
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = constraints.maxWidth >= 900
            ? 4
            : constraints.maxWidth >= 620
                ? 3
                : 2;
        return GridView.builder(
          itemCount: listings.length,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: columns,
            crossAxisSpacing: 12,
            mainAxisSpacing: 12,
            childAspectRatio: 0.66,
          ),
          itemBuilder: (context, index) => _ListingCard(
            listing: listings[index],
            text: text,
            onTap: () => onListing(listings[index]),
          ),
        );
      },
    );
  }
}

class _ListingCard extends StatelessWidget {
  const _ListingCard({
    required this.listing,
    required this.text,
    required this.onTap,
  });

  final CatalogListingDto listing;
  final AppLocalizations text;
  final VoidCallback onTap;

  String _price(BuildContext context) {
    try {
      return NumberFormat.simpleCurrency(
        name: listing.currencyCode,
        locale: Localizations.localeOf(context).toLanguageTag(),
      ).format(listing.priceAmount);
    } catch (_) {
      return '${listing.priceAmount.toStringAsFixed(2)} ${listing.currencyCode}';
    }
  }

  @override
  Widget build(BuildContext context) {
    final cover = listing.coverMedia;

    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(18),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              flex: 6,
              child: SizedBox(
                width: double.infinity,
                child: cover == null
                    ? Container(
                        color: SuqnaaBrand.blue,
                        alignment: Alignment.center,
                        child: Text(
                          listing.title.isEmpty
                              ? 'S'
                              : listing.title.characters.first,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 48,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      )
                    : Image.network(
                        cover.url,
                        fit: BoxFit.cover,
                        semanticLabel: cover.altText ?? listing.title,
                        errorBuilder: (_, __, ___) => Container(
                          color: const Color(0xFFF1F5FF),
                          alignment: Alignment.center,
                          child: const Icon(Icons.broken_image_outlined),
                        ),
                      ),
              ),
            ),
            Expanded(
              flex: 5,
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      catalogConditionLabel(text, listing.condition),
                      style: const TextStyle(
                        color: SuqnaaBrand.teal,
                        fontSize: 11,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 5),
                    Text(
                      listing.title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w900),
                    ),
                    const Spacer(),
                    Text(
                      _price(context),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: SuqnaaBrand.blue,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      listing.location.isEmpty
                          ? text.notSpecified
                          : listing.location,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: SuqnaaBrand.muted,
                        fontSize: 11,
                      ),
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

class _StatusCard extends StatelessWidget {
  const _StatusCard({
    required this.icon,
    required this.message,
    this.loading = false,
    this.actionLabel,
    this.onAction,
  });

  final IconData icon;
  final String message;
  final bool loading;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(28),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
      ),
      child: Column(
        children: [
          Icon(icon, size: 44, color: SuqnaaBrand.blue),
          const SizedBox(height: 12),
          Text(
            message,
            textAlign: TextAlign.center,
            style: const TextStyle(fontWeight: FontWeight.w800),
          ),
          if (loading) ...[
            const SizedBox(height: 16),
            const CircularProgressIndicator(),
          ],
          if (actionLabel != null && onAction != null) ...[
            const SizedBox(height: 12),
            TextButton(onPressed: onAction, child: Text(actionLabel!)),
          ],
        ],
      ),
    );
  }
}
