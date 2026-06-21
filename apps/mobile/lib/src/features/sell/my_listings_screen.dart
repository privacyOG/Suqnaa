import 'package:flutter/material.dart';
import '../../api/seller_listing_api.dart';
import '../../api/session_authed_api.dart';
import '../../brand/brand.dart';
import '../../config/mobile_environment.dart';
import '../../session/app_session.dart';
import '../../session/session_scope.dart';
import 'create_listing_screen.dart';

class MyListingsScreen extends StatefulWidget {
  const MyListingsScreen({super.key});

  @override
  State<MyListingsScreen> createState() => _MyListingsScreenState();
}

class _MyListingsScreenState extends State<MyListingsScreen> {
  final _items = <Map<String, dynamic>>[];
  final _updatingIds = <String>{};
  SellerListingApi? _api;
  AppSession? _session;
  String? _status;
  String? _cursor;
  bool _hasMore = false;
  bool _loading = false;
  bool _loadingMore = false;
  String? _error;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final session = SessionScope.of(context);
    if (identical(session, _session)) {
      return;
    }

    _session = session;
    _api = SellerListingApi(
      authedApi: SessionAuthedApi(
        baseUrl: Uri.parse(MobileEnvironment.apiBaseUrl),
        sessionProvider: () => session,
      ),
    );
    _reload();
  }

  Future<void> _reload() async {
    final api = _api;
    final token = _session?.access.value ?? '';
    if (api == null || token.isEmpty || _loading) {
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final response = await api.getMine(
        token,
        status: _status,
        limit: 20,
      );
      if (!mounted) {
        return;
      }

      final page = _parse(response);
      setState(() {
        _items
          ..clear()
          ..addAll(page.items);
        _hasMore = page.hasMore;
        _cursor = page.cursor;
      });
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Unable to load your listings.');
      }
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _loadMore() async {
    final api = _api;
    final token = _session?.access.value ?? '';
    if (api == null || token.isEmpty || !_hasMore || _cursor == null || _loadingMore) {
      return;
    }

    setState(() => _loadingMore = true);

    try {
      final response = await api.getMine(
        token,
        status: _status,
        limit: 20,
        before: _cursor,
      );
      if (!mounted) {
        return;
      }

      final page = _parse(response);
      final ids = _items.map((item) => item['id']?.toString()).toSet();
      setState(() {
        _items.addAll(
          page.items.where((item) => !ids.contains(item['id']?.toString())),
        );
        _hasMore = page.hasMore;
        _cursor = page.cursor;
      });
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Unable to load more listings.');
      }
    } finally {
      if (mounted) {
        setState(() => _loadingMore = false);
      }
    }
  }

  _ListingPage _parse(Map<String, dynamic> response) {
    final rawItems = response['listings'];
    final items = rawItems is List
        ? rawItems
            .whereType<Map>()
            .map((item) => Map<String, dynamic>.from(item))
            .toList()
        : <Map<String, dynamic>>[];
    final rawPagination = response['pagination'];
    final pagination = rawPagination is Map
        ? Map<String, dynamic>.from(rawPagination)
        : const <String, dynamic>{};

    return _ListingPage(
      items: items,
      hasMore: pagination['hasMore'] == true,
      cursor: pagination['nextCursor']?.toString(),
    );
  }

  Future<void> _createListing() async {
    final result = await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const CreateListingScreen()),
    );

    if (mounted && result != null) {
      _reload();
    }
  }

  void _setStatus(String? status) {
    if (_status == status) {
      return;
    }
    setState(() => _status = status);
    _reload();
  }

  Future<void> _changeStatus(
    Map<String, dynamic> listing,
    String nextStatus,
  ) async {
    final api = _api;
    final token = _session?.access.value ?? '';
    final listingId = listing['id']?.toString();
    if (api == null || token.isEmpty || listingId == null || _updatingIds.contains(listingId)) {
      return;
    }

    final destructive = nextStatus == 'sold' || nextStatus == 'removed';
    if (destructive) {
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text(nextStatus == 'sold' ? 'Mark as sold?' : 'Remove listing?'),
          content: Text(
            nextStatus == 'sold'
                ? 'This action is final. The listing cannot be reactivated.'
                : 'Removed listings cannot be restored.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(true),
              child: Text(nextStatus == 'sold' ? 'Mark sold' : 'Remove'),
            ),
          ],
        ),
      );

      if (confirmed != true || !mounted) {
        return;
      }
    }

    setState(() {
      _updatingIds.add(listingId);
      _error = null;
    });

    try {
      await api.updateStatus(
        token,
        listingId: listingId,
        status: nextStatus,
      );
      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_statusSuccessMessage(nextStatus))),
      );
      await _reload();
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Unable to update the listing status.');
      }
    } finally {
      if (mounted) {
        setState(() => _updatingIds.remove(listingId));
      }
    }
  }

  String _statusSuccessMessage(String status) {
    switch (status) {
      case 'active':
        return 'Listing is now active.';
      case 'reserved':
        return 'Listing marked as reserved.';
      case 'sold':
        return 'Listing marked as sold.';
      case 'removed':
        return 'Listing removed.';
      default:
        return 'Listing updated.';
    }
  }

  @override
  Widget build(BuildContext context) {
    final signedIn = _session?.isSignedIn == true;

    return Scaffold(
      appBar: AppBar(
        title: const Text('My listings'),
        backgroundColor: SuqnaaBrand.ivory,
      ),
      floatingActionButton: signedIn
          ? FloatingActionButton.extended(
              onPressed: _createListing,
              icon: const Icon(Icons.add_business_outlined),
              label: const Text('New listing'),
            )
          : null,
      body: !signedIn
          ? const Center(child: Text('Sign in to manage your listings.'))
          : Column(
              children: [
                _StatusFilter(
                  selected: _status,
                  onSelected: _setStatus,
                ),
                if (_error != null)
                  MaterialBanner(
                    content: Text(_error!),
                    actions: [
                      TextButton(onPressed: _reload, child: const Text('Retry')),
                    ],
                  ),
                Expanded(
                  child: _loading && _items.isEmpty
                      ? const Center(child: CircularProgressIndicator())
                      : RefreshIndicator(
                          onRefresh: _reload,
                          child: ListView.builder(
                            padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
                            itemCount: _items.length + 1,
                            itemBuilder: (context, index) {
                              if (index == _items.length) {
                                return Padding(
                                  padding: const EdgeInsets.symmetric(vertical: 18),
                                  child: Center(
                                    child: _hasMore
                                        ? OutlinedButton.icon(
                                            onPressed: _loadingMore ? null : _loadMore,
                                            icon: _loadingMore
                                                ? const SizedBox(
                                                    width: 16,
                                                    height: 16,
                                                    child: CircularProgressIndicator(strokeWidth: 2),
                                                  )
                                                : const Icon(Icons.expand_more),
                                            label: const Text('Load more'),
                                          )
                                        : Text(
                                            _items.isEmpty
                                                ? 'No listings found.'
                                                : 'You are all caught up.',
                                          ),
                                  ),
                                );
                              }

                              final listing = _items[index];
                              final listingId = listing['id']?.toString() ?? '';
                              return _ListingCard(
                                data: listing,
                                busy: _updatingIds.contains(listingId),
                                onStatusSelected: (status) => _changeStatus(listing, status),
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

class _StatusFilter extends StatelessWidget {
  const _StatusFilter({required this.selected, required this.onSelected});

  final String? selected;
  final ValueChanged<String?> onSelected;

  @override
  Widget build(BuildContext context) {
    const values = <String?, String>{
      null: 'All',
      'draft': 'Drafts',
      'active': 'Active',
      'reserved': 'Reserved',
      'sold': 'Sold',
      'expired': 'Expired',
      'removed': 'Removed',
    };

    return SizedBox(
      height: 58,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        children: values.entries.map((entry) {
          return Padding(
            padding: const EdgeInsetsDirectional.only(end: 8),
            child: ChoiceChip(
              label: Text(entry.value),
              selected: selected == entry.key,
              onSelected: (_) => onSelected(entry.key),
            ),
          );
        }).toList(),
      ),
    );
  }
}

class _ListingCard extends StatelessWidget {
  const _ListingCard({
    required this.data,
    required this.busy,
    required this.onStatusSelected,
  });

  final Map<String, dynamic> data;
  final bool busy;
  final ValueChanged<String> onStatusSelected;

  @override
  Widget build(BuildContext context) {
    final title = data['title']?.toString() ?? 'Untitled listing';
    final description = data['description']?.toString() ?? '';
    final amount = data['priceAmount']?.toString() ?? '0.00';
    final currency = data['currencyCode']?.toString() ?? '';
    final status = data['status']?.toString() ?? 'draft';
    final suburb = data['suburb']?.toString();
    final city = data['city']?.toString();
    final location = [suburb, city]
        .where((value) => value != null && value.trim().isNotEmpty)
        .join(', ');
    final actions = _actionsFor(status);

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    title,
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
                  ),
                ),
                _StatusBadge(status: status),
                if (busy)
                  const Padding(
                    padding: EdgeInsetsDirectional.only(start: 8),
                    child: SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                  )
                else if (actions.isNotEmpty)
                  PopupMenuButton<String>(
                    tooltip: 'Listing actions',
                    onSelected: onStatusSelected,
                    itemBuilder: (context) => actions
                        .map(
                          (action) => PopupMenuItem<String>(
                            value: action.status,
                            child: Row(
                              children: [
                                Icon(action.icon, size: 20),
                                const SizedBox(width: 10),
                                Text(action.label),
                              ],
                            ),
                          ),
                        )
                        .toList(),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              description,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                Text(
                  '$currency $amount',
                  style: const TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w900,
                    color: SuqnaaBrand.blue,
                  ),
                ),
                const Spacer(),
                if (location.isNotEmpty) ...[
                  const Icon(Icons.location_on_outlined, size: 16),
                  const SizedBox(width: 4),
                  Flexible(
                    child: Text(
                      location,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }

  List<_ListingAction> _actionsFor(String status) {
    switch (status) {
      case 'draft':
        return const [
          _ListingAction('active', 'Publish', Icons.publish_outlined),
          _ListingAction('removed', 'Remove', Icons.delete_outline),
        ];
      case 'active':
        return const [
          _ListingAction('reserved', 'Mark reserved', Icons.bookmark_outline),
          _ListingAction('sold', 'Mark sold', Icons.sell_outlined),
          _ListingAction('removed', 'Remove', Icons.delete_outline),
        ];
      case 'reserved':
        return const [
          _ListingAction('active', 'Make active', Icons.replay_outlined),
          _ListingAction('sold', 'Mark sold', Icons.sell_outlined),
          _ListingAction('removed', 'Remove', Icons.delete_outline),
        ];
      case 'expired':
        return const [
          _ListingAction('active', 'Republish', Icons.refresh_outlined),
          _ListingAction('removed', 'Remove', Icons.delete_outline),
        ];
      default:
        return const [];
    }
  }
}

class _ListingAction {
  const _ListingAction(this.status, this.label, this.icon);

  final String status;
  final String label;
  final IconData icon;
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: status == 'active'
            ? Colors.green.shade100
            : status == 'sold'
                ? Colors.blueGrey.shade100
                : Colors.amber.shade100,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Text(
        status.replaceAll('_', ' '),
        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800),
      ),
    );
  }
}

class _ListingPage {
  const _ListingPage({required this.items, required this.hasMore, this.cursor});

  final List<Map<String, dynamic>> items;
  final bool hasMore;
  final String? cursor;
}
