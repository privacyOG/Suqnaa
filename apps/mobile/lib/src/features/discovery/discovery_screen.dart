import 'dart:async';
import 'package:flutter/material.dart';
import '../../api/discovery_api.dart';
import '../../api/session_authed_api.dart';
import '../../brand/brand.dart';
import '../../config/mobile_environment.dart';
import '../../session/app_session.dart';
import '../../session/session_scope.dart';

class DiscoveryScreen extends StatefulWidget {
  const DiscoveryScreen({super.key, this.gateway, this.accessToken});
  final DiscoveryGateway? gateway;
  final String? accessToken;

  @override
  State<DiscoveryScreen> createState() => _DiscoveryScreenState();
}

class _DiscoveryScreenState extends State<DiscoveryScreen> {
  DiscoveryGateway? _gateway;
  AppSession? _session;
  List<DiscoveryRelationshipItem> _saved = const [];
  List<DiscoveryRelationshipItem> _watchlist = const [];
  List<DiscoveryRelationshipItem> _recent = const [];
  List<DiscoverySavedSearch> _searches = const [];
  List<DiscoveryNotification> _notifications = const [];
  bool _initialized = false;
  bool _loading = false;
  String? _error;

  String get _token => widget.accessToken ?? _session?.access.value ?? '';
  bool get _isArabic => Localizations.localeOf(context).languageCode == 'ar';

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialized) return;
    _initialized = true;
    if (widget.gateway != null) {
      _gateway = widget.gateway;
    } else {
      final session = SessionScope.of(context);
      _session = session;
      _gateway = DiscoveryApi(
        authedApi: SessionAuthedApi(
          baseUrl: Uri.parse(MobileEnvironment.apiBaseUrl),
          sessionProvider: () => session,
        ),
      );
    }
    unawaited(_reload());
  }

  Future<void> _reload() async {
    final gateway = _gateway;
    final token = _token;
    if (gateway == null || token.isEmpty || _loading) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait<dynamic>([
        gateway.getSavedListings(token),
        gateway.getWatchlist(token),
        gateway.getRecentlyViewed(token),
        gateway.getSavedSearches(token),
        gateway.getNotifications(token),
      ]);
      if (!mounted) return;
      setState(() {
        _saved = results[0] as List<DiscoveryRelationshipItem>;
        _watchlist = results[1] as List<DiscoveryRelationshipItem>;
        _recent = results[2] as List<DiscoveryRelationshipItem>;
        _searches = results[3] as List<DiscoverySavedSearch>;
        _notifications = results[4] as List<DiscoveryNotification>;
      });
    } catch (_) {
      if (mounted) setState(() => _error = 'load');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _removeSaved(String id) async {
    await _gateway!.removeSavedListing(_token, id);
    await _reload();
  }

  Future<void> _removeWatched(String id) async {
    await _gateway!.removeWatchedListing(_token, id);
    await _reload();
  }

  Future<void> _toggleSearch(DiscoverySavedSearch search) async {
    await _gateway!.setSavedSearchActive(_token, searchId: search.id, active: !search.active);
    await _reload();
  }

  Future<void> _deleteSearch(DiscoverySavedSearch search) async {
    await _gateway!.deleteSavedSearch(_token, search.id);
    await _reload();
  }

  @override
  Widget build(BuildContext context) {
    final ar = _isArabic;
    final unread = _notifications.where((item) => !item.read).length;
    return Scaffold(
      backgroundColor: SuqnaaBrand.ivory,
      appBar: AppBar(
        backgroundColor: SuqnaaBrand.ivory,
        title: Text(ar ? 'المتابعة' : 'Discovery'),
        actions: [
          IconButton(
            key: const Key('discovery-refresh'),
            tooltip: ar ? 'تحديث' : 'Refresh',
            onPressed: _loading ? null : _reload,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _reload,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(18, 8, 18, 32),
          children: [
            if (_loading) const LinearProgressIndicator(),
            if (_error != null)
              _Notice(text: ar ? 'تعذر تحميل مركز المتابعة.' : 'Unable to load discovery centre.'),
            _Section(
              title: ar ? 'الإشعارات ($unread غير مقروء)' : 'Notifications ($unread unread)',
              action: unread == 0
                  ? null
                  : TextButton(
                      key: const Key('discovery-read-all'),
                      onPressed: () async {
                        await _gateway!.markAllNotificationsRead(_token);
                        await _reload();
                      },
                      child: Text(ar ? 'قراءة الكل' : 'Mark all read'),
                    ),
              children: _notifications.isEmpty
                  ? [_Empty(text: ar ? 'لا توجد تنبيهات بعد.' : 'No saved-search alerts yet.')]
                  : _notifications.map((notification) => ListTile(
                      key: Key('notification-${notification.id}'),
                      leading: Icon(notification.read ? Icons.notifications_none : Icons.notifications_active),
                      title: Text(notification.searchName),
                      subtitle: Text(notification.listing?.title ?? (ar ? 'الإعلان لم يعد متاحاً' : 'Listing no longer available')),
                      trailing: notification.read
                          ? null
                          : TextButton(
                              onPressed: () async {
                                await _gateway!.markNotificationRead(_token, notification.id);
                                await _reload();
                              },
                              child: Text(ar ? 'قراءة' : 'Read'),
                            ),
                    )).toList(),
            ),
            _Section(
              title: ar ? 'الإعلانات المحفوظة' : 'Saved listings',
              children: _relationshipTiles(
                _saved,
                ar ? 'لا توجد إعلانات محفوظة.' : 'No saved listings.',
                ar ? 'إزالة' : 'Remove',
                _removeSaved,
              ),
            ),
            _Section(
              title: ar ? 'قائمة المراقبة' : 'Watchlist',
              children: _relationshipTiles(
                _watchlist,
                ar ? 'قائمة المراقبة فارغة.' : 'Your watchlist is empty.',
                ar ? 'إزالة' : 'Remove',
                _removeWatched,
              ),
            ),
            _Section(
              title: ar ? 'شوهد مؤخراً' : 'Recently viewed',
              children: _recent.isEmpty
                  ? [_Empty(text: ar ? 'لا توجد مشاهدات حديثة.' : 'No recent views.')]
                  : _recent.map((item) => _relationshipTile(item)).toList(),
            ),
            _Section(
              title: ar ? 'عمليات البحث المحفوظة' : 'Saved searches',
              children: _searches.isEmpty
                  ? [_Empty(text: ar ? 'احفظ بحثاً من شاشة السوق.' : 'Save a search from the marketplace screen.')]
                  : _searches.map((search) => ListTile(
                      key: Key('saved-search-${search.id}'),
                      leading: Icon(search.active ? Icons.notifications_active_outlined : Icons.notifications_off_outlined),
                      title: Text(search.name),
                      subtitle: Text(search.filters.entries.map((entry) => '${entry.key}: ${entry.value}').join(' · '), maxLines: 3, overflow: TextOverflow.ellipsis),
                      trailing: PopupMenuButton<String>(
                        onSelected: (value) async {
                          if (value == 'toggle') await _toggleSearch(search);
                          if (value == 'delete') await _deleteSearch(search);
                        },
                        itemBuilder: (_) => [
                          PopupMenuItem(value: 'toggle', child: Text(search.active ? (ar ? 'إيقاف' : 'Pause') : (ar ? 'تشغيل' : 'Resume'))),
                          PopupMenuItem(value: 'delete', child: Text(ar ? 'حذف' : 'Delete')),
                        ],
                      ),
                    )).toList(),
            ),
          ],
        ),
      ),
    );
  }

  List<Widget> _relationshipTiles(
    List<DiscoveryRelationshipItem> items,
    String empty,
    String action,
    Future<void> Function(String) remove,
  ) {
    if (items.isEmpty) return [_Empty(text: empty)];
    return items.map((item) => ListTile(
      key: Key('discovery-listing-${item.listingId}'),
      title: Text(item.listing?.title ?? (_isArabic ? 'الإعلان لم يعد متاحاً' : 'Listing no longer available')),
      subtitle: item.listing == null ? null : Text('${item.listing!.priceAmount.toStringAsFixed(2)} ${item.listing!.currencyCode}'),
      trailing: TextButton(onPressed: () => remove(item.listingId), child: Text(action)),
    )).toList();
  }

  Widget _relationshipTile(DiscoveryRelationshipItem item) => ListTile(
    key: Key('recent-${item.listingId}'),
    leading: const Icon(Icons.history),
    title: Text(item.listing?.title ?? (_isArabic ? 'الإعلان لم يعد متاحاً' : 'Listing no longer available')),
    subtitle: item.viewCount == null ? null : Text(_isArabic ? '${item.viewCount} مشاهدة' : '${item.viewCount} views'),
  );
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.children, this.action});
  final String title;
  final List<Widget> children;
  final Widget? action;

  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.only(bottom: 16),
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(18)),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(children: [Expanded(child: Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900))), if (action != null) action!]),
        const SizedBox(height: 8),
        ...children,
      ],
    ),
  );
}

class _Empty extends StatelessWidget {
  const _Empty({required this.text});
  final String text;
  @override
  Widget build(BuildContext context) => Padding(padding: const EdgeInsets.all(8), child: Text(text));
}

class _Notice extends StatelessWidget {
  const _Notice({required this.text});
  final String text;
  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.only(bottom: 14),
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16)),
    child: Text(text),
  );
}
