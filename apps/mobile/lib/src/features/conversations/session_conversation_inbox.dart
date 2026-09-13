import 'package:flutter/material.dart';
import '../../api/conversation_api.dart';
import '../../api/session_authed_api.dart';
import '../../brand/brand.dart';
import '../../config/mobile_environment.dart';
import '../../session/app_session.dart';
import '../../session/session_scope.dart';
import 'session_conversation_screen.dart';

typedef ConversationPageLoader = Future<Map<String, dynamic>> Function(
  String accessToken, {
  int limit,
  String? before,
});

class SessionConversationInbox extends StatefulWidget {
  const SessionConversationInbox({
    super.key,
    this.pageLoader,
  });

  final ConversationPageLoader? pageLoader;

  @override
  State<SessionConversationInbox> createState() => _SessionConversationInboxState();
}

class _SessionConversationInboxState extends State<SessionConversationInbox> {
  final _items = <Map<String, dynamic>>[];
  ConversationApi? _api;
  AppSession? _session;
  String? _cursor;
  bool _hasMore = false;
  bool _loading = false;
  bool _loadingMore = false;
  String? _error;

  bool get _isArabic => Localizations.localeOf(context).languageCode == 'ar';

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final session = SessionScope.of(context);
    if (identical(session, _session)) return;

    _session = session;
    if (widget.pageLoader == null) {
      _api = ConversationApi(
        authedApi: SessionAuthedApi(
          baseUrl: Uri.parse(MobileEnvironment.apiBaseUrl),
          sessionProvider: () => session,
        ),
      );
    }
    _reload();
  }

  Future<Map<String, dynamic>> _loadPage(
    String token, {
    required int limit,
    String? before,
  }) async {
    final loader = widget.pageLoader;
    if (loader != null) {
      return loader(token, limit: limit, before: before);
    }
    final api = _api;
    if (api == null) {
      throw StateError('Conversation API is unavailable');
    }
    return api.getConversationPage(token, limit: limit, before: before);
  }

  Future<void> _reload() async {
    final token = _session?.access.value ?? '';
    if (token.isEmpty || _loading) return;

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final response = await _loadPage(token, limit: 20);
      if (!mounted) return;
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
        setState(() => _error = _isArabic
            ? 'تعذر تحميل المحادثات.'
            : 'Unable to load conversations.');
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loadMore() async {
    final token = _session?.access.value ?? '';
    if (token.isEmpty || !_hasMore || _cursor == null || _loadingMore) return;

    setState(() => _loadingMore = true);

    try {
      final response = await _loadPage(
        token,
        limit: 20,
        before: _cursor,
      );
      if (!mounted) return;

      final page = _parse(response);
      final ids = _items.map((item) => item['id']?.toString()).toSet();
      setState(() {
        _items.addAll(page.items.where((item) => !ids.contains(item['id']?.toString())));
        _hasMore = page.hasMore;
        _cursor = page.cursor;
      });
    } catch (_) {
      if (mounted) {
        setState(() => _error = _isArabic
            ? 'تعذر تحميل المزيد من المحادثات.'
            : 'Unable to load more conversations.');
      }
    } finally {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  _ConversationPage _parse(Map<String, dynamic> response) {
    final rawItems = response['conversations'];
    final items = rawItems is List
        ? rawItems.whereType<Map>().map((item) => Map<String, dynamic>.from(item)).toList()
        : <Map<String, dynamic>>[];
    final rawPagination = response['pagination'];
    final pagination = rawPagination is Map
        ? Map<String, dynamic>.from(rawPagination)
        : const <String, dynamic>{};

    return _ConversationPage(
      items: items,
      hasMore: pagination['hasMore'] == true,
      cursor: pagination['nextCursor']?.toString(),
    );
  }

  Future<void> _open(Map<String, dynamic> item) async {
    final conversationId = item['id']?.toString();
    final listingId = item['listingId']?.toString();
    final counterpart = item['counterpart'] is Map
        ? Map<String, dynamic>.from(item['counterpart'] as Map)
        : const <String, dynamic>{};
    final recipientId = counterpart['id']?.toString();
    final name = counterpart['displayName']?.toString().trim();

    if (conversationId == null || recipientId == null) return;

    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => SessionConversationScreen(
          conversationId: conversationId,
          recipientId: recipientId,
          counterpartName: name?.isNotEmpty == true
              ? name!
              : (_isArabic ? 'مستخدم سوقنا' : 'Suqnaa user'),
          listingId: listingId,
        ),
      ),
    );

    if (mounted) _reload();
  }

  @override
  Widget build(BuildContext context) {
    final signedIn = _session?.isSignedIn == true;
    final ar = _isArabic;

    return Scaffold(
      appBar: AppBar(
        title: Text(ar ? 'الرسائل' : 'Messages'),
        backgroundColor: SuqnaaBrand.ivory,
      ),
      body: !signedIn
          ? Center(child: Text(ar ? 'سجّل الدخول لعرض الرسائل.' : 'Sign in to view messages.'))
          : _loading && _items.isEmpty
              ? const Center(child: CircularProgressIndicator())
              : _error != null && _items.isEmpty
                  ? _ErrorView(message: _error!, onRetry: _reload, isArabic: ar)
                  : RefreshIndicator(
                      onRefresh: _reload,
                      child: ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _items.length + 1,
                        itemBuilder: (context, index) {
                          if (index == _items.length) {
                            return Padding(
                              padding: const EdgeInsets.symmetric(vertical: 16),
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
                                        label: Text(ar ? 'تحميل المزيد' : 'Load more'),
                                      )
                                    : Text(
                                        _items.isEmpty
                                            ? (ar ? 'لا توجد محادثات بعد.' : 'No conversations yet.')
                                            : (ar ? 'تم عرض جميع المحادثات.' : 'You are all caught up.'),
                                      ),
                              ),
                            );
                          }

                          return _ConversationRow(
                            data: _items[index],
                            isArabic: ar,
                            onTap: () => _open(_items[index]),
                          );
                        },
                      ),
                    ),
    );
  }
}

class _ConversationRow extends StatelessWidget {
  const _ConversationRow({
    required this.data,
    required this.isArabic,
    required this.onTap,
  });

  final Map<String, dynamic> data;
  final bool isArabic;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final counterpart = data['counterpart'] is Map
        ? Map<String, dynamic>.from(data['counterpart'] as Map)
        : const <String, dynamic>{};
    final latest = data['latestMessage'] is Map
        ? Map<String, dynamic>.from(data['latestMessage'] as Map)
        : const <String, dynamic>{};
    final safety = data['safety'] is Map
        ? Map<String, dynamic>.from(data['safety'] as Map)
        : const <String, dynamic>{};
    final name = counterpart['displayName']?.toString().trim();
    final safeName = name?.isNotEmpty == true
        ? name!
        : (isArabic ? 'مستخدم سوقنا' : 'Suqnaa user');
    final unread = data['unreadCount'] is num
        ? (data['unreadCount'] as num).toInt()
        : 0;
    final muted = safety['muted'] == true;
    final messagingAvailable = safety['messagingAvailable'] != false;
    final preview = latest['body']?.toString() ??
        (isArabic ? 'لا توجد رسائل بعد' : 'No messages yet');
    final status = !messagingAvailable
        ? (isArabic ? 'المراسلة غير متاحة' : 'Messaging unavailable')
        : muted
            ? (isArabic ? 'مكتوم' : 'Muted')
            : null;

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: ListTile(
        onTap: onTap,
        leading: CircleAvatar(
          backgroundColor: SuqnaaBrand.blue,
          child: Text(
            safeName.substring(0, 1).toUpperCase(),
            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900),
          ),
        ),
        title: Text(
          safeName,
          style: TextStyle(fontWeight: unread > 0 ? FontWeight.w900 : FontWeight.w700),
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(preview, maxLines: 2, overflow: TextOverflow.ellipsis),
            if (status != null)
              Text(status, style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
        trailing: unread > 0
            ? CircleAvatar(
                radius: 13,
                backgroundColor: SuqnaaBrand.blue,
                child: Text(
                  unread > 99 ? '99+' : unread.toString(),
                  style: const TextStyle(color: Colors.white, fontSize: 10),
                ),
              )
            : Icon(isArabic ? Icons.chevron_left : Icons.chevron_right),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({
    required this.message,
    required this.onRetry,
    required this.isArabic,
  });

  final String message;
  final VoidCallback onRetry;
  final bool isArabic;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(message),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: onRetry,
            icon: const Icon(Icons.refresh),
            label: Text(isArabic ? 'إعادة المحاولة' : 'Try again'),
          ),
        ],
      ),
    );
  }
}

class _ConversationPage {
  const _ConversationPage({required this.items, required this.hasMore, this.cursor});

  final List<Map<String, dynamic>> items;
  final bool hasMore;
  final String? cursor;
}
