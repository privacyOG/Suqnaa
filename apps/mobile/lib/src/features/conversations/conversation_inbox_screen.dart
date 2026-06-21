import 'package:flutter/material.dart';
import '../../api/conversation_api.dart';
import '../../api/session_authed_api.dart';
import '../../brand/brand.dart';
import '../../config/mobile_environment.dart';
import '../../session/session_scope.dart';
import 'conversation_detail_screen.dart';

class ConversationInboxScreen extends StatefulWidget {
  const ConversationInboxScreen({super.key});

  @override
  State<ConversationInboxScreen> createState() => _ConversationInboxScreenState();
}

class _ConversationInboxScreenState extends State<ConversationInboxScreen> {
  late final ConversationApi _api;
  final List<Map<String, dynamic>> _items = [];

  String _token = '';
  String? _cursor;
  bool _hasMore = false;
  bool _loading = false;
  bool _loadingMore = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _api = ConversationApi(
      authedApi: SessionAuthedApi(
        baseUrl: Uri.parse(MobileEnvironment.apiBaseUrl),
        sessionProvider: () => SessionScope.of(context),
      ),
    );
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final next = SessionScope.of(context).access.value;
    if (next == _token) {
      return;
    }

    _token = next;
    _items.clear();
    _cursor = null;
    _hasMore = false;
    _error = null;

    if (_token.isNotEmpty) {
      _reload();
    }
  }

  Future<void> _reload() async {
    if (_token.isEmpty || _loading) {
      return;
    }

    final token = _token;
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final response = await _api.getConversationPage(token, limit: 20);
      if (!mounted || token != _token) {
        return;
      }

      final parsed = _parsePage(response);
      setState(() {
        _items
          ..clear()
          ..addAll(parsed.items);
        _hasMore = parsed.hasMore;
        _cursor = parsed.cursor;
      });
    } catch (_) {
      if (mounted && token == _token) {
        setState(() {
          _error = 'Unable to load conversations.';
        });
      }
    } finally {
      if (mounted && token == _token) {
        setState(() {
          _loading = false;
        });
      }
    }
  }

  Future<void> _loadMore() async {
    if (_token.isEmpty || !_hasMore || _cursor == null || _loadingMore) {
      return;
    }

    final token = _token;
    setState(() {
      _loadingMore = true;
      _error = null;
    });

    try {
      final response = await _api.getConversationPage(
        token,
        limit: 20,
        before: _cursor,
      );
      if (!mounted || token != _token) {
        return;
      }

      final parsed = _parsePage(response);
      final ids = _items.map((item) => item['id']?.toString()).toSet();
      setState(() {
        _items.addAll(
          parsed.items.where((item) => !ids.contains(item['id']?.toString())),
        );
        _hasMore = parsed.hasMore;
        _cursor = parsed.cursor;
      });
    } catch (_) {
      if (mounted && token == _token) {
        setState(() {
          _error = 'Unable to load more conversations.';
        });
      }
    } finally {
      if (mounted && token == _token) {
        setState(() {
          _loadingMore = false;
        });
      }
    }
  }

  _ConversationPage _parsePage(Map<String, dynamic> response) {
    final rawItems = response['conversations'];
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

    return _ConversationPage(
      items: items,
      hasMore: pagination['hasMore'] == true,
      cursor: pagination['nextCursor']?.toString(),
    );
  }

  Future<void> _open(Map<String, dynamic> item) async {
    final id = item['id']?.toString();
    final listingId = item['listingId']?.toString();
    final counterpart = item['counterpart'] is Map
        ? Map<String, dynamic>.from(item['counterpart'] as Map)
        : const <String, dynamic>{};
    final recipientId = counterpart['id']?.toString();
    final name = counterpart['displayName']?.toString().trim();

    if (id == null || recipientId == null) {
      return;
    }

    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ConversationDetailScreen(
          conversationId: id,
          recipientId: recipientId,
          counterpartName: name?.isNotEmpty == true ? name! : 'Suqnaa user',
          listingId: listingId,
        ),
      ),
    );

    if (mounted) {
      _reload();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Messages'),
        backgroundColor: SuqnaaBrand.ivory,
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_token.isEmpty) {
      return const _CenteredMessage(
        icon: Icons.lock_outline,
        title: 'Sign in to view messages',
        body: 'Your conversations will appear after you sign in.',
      );
    }

    if (_loading && _items.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_error != null && _items.isEmpty) {
      return _ErrorView(message: _error!, onRetry: _reload);
    }

    if (_items.isEmpty) {
      return RefreshIndicator(
        onRefresh: _reload,
        child: const ListView(
          physics: AlwaysScrollableScrollPhysics(),
          children: [
            SizedBox(height: 120),
            _CenteredMessage(
              icon: Icons.forum_outlined,
              title: 'No conversations yet',
              body: 'Messages from buyers and sellers will appear here.',
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
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
                        label: const Text('Load more'),
                      )
                    : const Text('You are all caught up.'),
              ),
            );
          }

          return _InboxRow(
            data: _items[index],
            onTap: () => _open(_items[index]),
          );
        },
      ),
    );
  }
}

class _InboxRow extends StatelessWidget {
  const _InboxRow({required this.data, required this.onTap});

  final Map<String, dynamic> data;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final counterpart = data['counterpart'] is Map
        ? Map<String, dynamic>.from(data['counterpart'] as Map)
        : const <String, dynamic>{};
    final latest = data['latestMessage'] is Map
        ? Map<String, dynamic>.from(data['latestMessage'] as Map)
        : const <String, dynamic>{};
    final name = counterpart['displayName']?.toString().trim();
    final preview = latest['body']?.toString().trim();
    final unread = data['unreadCount'] is num
        ? (data['unreadCount'] as num).toInt()
        : int.tryParse(data['unreadCount']?.toString() ?? '') ?? 0;
    final safeName = name?.isNotEmpty == true ? name! : 'Suqnaa user';

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: ListTile(
        onTap: onTap,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        leading: CircleAvatar(
          backgroundColor: SuqnaaBrand.blue,
          child: Text(
            safeName.substring(0, 1).toUpperCase(),
            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900),
          ),
        ),
        title: Row(
          children: [
            Expanded(
              child: Text(
                safeName,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontWeight: unread > 0 ? FontWeight.w900 : FontWeight.w700,
                ),
              ),
            ),
            if (unread > 0)
              Container(
                margin: const EdgeInsetsDirectional.only(start: 8),
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: SuqnaaBrand.blue,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Text(
                  unread > 99 ? '99+' : unread.toString(),
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 12,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
          ],
        ),
        subtitle: Text(
          preview?.isNotEmpty == true ? preview! : 'No messages yet',
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
        ),
        trailing: const Icon(Icons.chevron_right),
      ),
    );
  }
}

class _CenteredMessage extends StatelessWidget {
  const _CenteredMessage({
    required this.icon,
    required this.title,
    required this.body,
  });

  final IconData icon;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 48, color: SuqnaaBrand.blue),
            const SizedBox(height: 14),
            Text(
              title,
              style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w900),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 6),
            Text(body, textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.cloud_off_outlined, size: 46),
          const SizedBox(height: 12),
          Text(message),
          const SizedBox(height: 14),
          FilledButton.icon(
            onPressed: onRetry,
            icon: const Icon(Icons.refresh),
            label: const Text('Try again'),
          ),
        ],
      ),
    );
  }
}

class _ConversationPage {
  const _ConversationPage({
    required this.items,
    required this.hasMore,
    this.cursor,
  });

  final List<Map<String, dynamic>> items;
  final bool hasMore;
  final String? cursor;
}
