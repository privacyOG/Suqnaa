import 'package:flutter/material.dart';
import '../../api/authed_api.dart';
import '../../api/conversation_api.dart';
import '../../brand/brand.dart';
import '../../config/mobile_environment.dart';
import '../../session/session_scope.dart';

class ConversationListScreen extends StatefulWidget {
  const ConversationListScreen({super.key});

  @override
  State<ConversationListScreen> createState() => _ConversationListScreenState();
}

class _ConversationListScreenState extends State<ConversationListScreen> {
  late final ConversationApi _api;
  final List<Map<String, dynamic>> _conversations = [];

  String _accessToken = '';
  String? _nextCursor;
  bool _hasMore = false;
  bool _isLoading = false;
  bool _isLoadingMore = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _api = ConversationApi(
      authedApi: AuthedApi(
        baseUrl: Uri.parse(MobileEnvironment.apiBaseUrl),
      ),
    );
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final nextToken = SessionScope.of(context).access.value;

    if (nextToken == _accessToken) {
      return;
    }

    _accessToken = nextToken;
    _conversations.clear();
    _nextCursor = null;
    _hasMore = false;
    _error = null;

    if (_accessToken.isNotEmpty) {
      _loadFirstPage();
    }
  }

  Future<void> _loadFirstPage() async {
    if (_accessToken.isEmpty || _isLoading) {
      return;
    }

    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final response = await _api.getConversationPage(
        _accessToken,
        limit: 20,
      );
      if (!mounted || _accessToken.isEmpty) {
        return;
      }

      final items = _readItems(response);
      final pagination = _readPagination(response);

      setState(() {
        _conversations
          ..clear()
          ..addAll(items);
        _hasMore = pagination.hasMore;
        _nextCursor = pagination.nextCursor;
      });
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = 'Unable to load conversations. Check your connection and try again.';
        });
      }
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  Future<void> _loadMore() async {
    if (_accessToken.isEmpty || !_hasMore || _nextCursor == null || _isLoadingMore) {
      return;
    }

    setState(() {
      _isLoadingMore = true;
      _error = null;
    });

    try {
      final response = await _api.getConversationPage(
        _accessToken,
        limit: 20,
        before: _nextCursor,
      );
      if (!mounted) {
        return;
      }

      final items = _readItems(response);
      final pagination = _readPagination(response);
      final existingIds = _conversations
          .map((item) => item['id']?.toString())
          .whereType<String>()
          .toSet();

      setState(() {
        _conversations.addAll(
          items.where((item) => !existingIds.contains(item['id']?.toString())),
        );
        _hasMore = pagination.hasMore;
        _nextCursor = pagination.nextCursor;
      });
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = 'Unable to load more conversations.';
        });
      }
    } finally {
      if (mounted) {
        setState(() {
          _isLoadingMore = false;
        });
      }
    }
  }

  List<Map<String, dynamic>> _readItems(Map<String, dynamic> response) {
    final raw = response['conversations'];
    if (raw is! List) {
      return const [];
    }

    return raw
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
  }

  _Pagination _readPagination(Map<String, dynamic> response) {
    final raw = response['pagination'];
    if (raw is! Map) {
      return const _Pagination(hasMore: false);
    }

    return _Pagination(
      hasMore: raw['hasMore'] == true,
      nextCursor: raw['nextCursor']?.toString(),
    );
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
    if (_accessToken.isEmpty) {
      return const _SignedOutCard();
    }

    if (_isLoading && _conversations.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_error != null && _conversations.isEmpty) {
      return _ErrorState(message: _error!, onRetry: _loadFirstPage);
    }

    if (_conversations.isEmpty) {
      return RefreshIndicator(
        onRefresh: _loadFirstPage,
        child: const ListView(
          physics: AlwaysScrollableScrollPhysics(),
          padding: EdgeInsets.all(20),
          children: [
            _InboxHeading(),
            SizedBox(height: 24),
            _EmptyConversationCard(),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadFirstPage,
      child: ListView.builder(
        padding: const EdgeInsets.all(20),
        itemCount: _conversations.length + 2,
        itemBuilder: (context, index) {
          if (index == 0) {
            return const Padding(
              padding: EdgeInsets.only(bottom: 16),
              child: _InboxHeading(),
            );
          }

          if (index == _conversations.length + 1) {
            return Padding(
              padding: const EdgeInsets.only(top: 12, bottom: 24),
              child: _PaginationFooter(
                hasMore: _hasMore,
                isLoading: _isLoadingMore,
                error: _error,
                onLoadMore: _loadMore,
              ),
            );
          }

          return Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: _ConversationCard(data: _conversations[index - 1]),
          );
        },
      ),
    );
  }
}

class _InboxHeading extends StatelessWidget {
  const _InboxHeading();

  @override
  Widget build(BuildContext context) {
    return const Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Your conversations',
          style: TextStyle(
            fontSize: 28,
            fontWeight: FontWeight.w900,
            color: SuqnaaBrand.blue,
          ),
        ),
        SizedBox(height: 6),
        Text('Messages from buyers and sellers appear here.'),
      ],
    );
  }
}

class _ConversationCard extends StatelessWidget {
  const _ConversationCard({required this.data});

  final Map<String, dynamic> data;

  @override
  Widget build(BuildContext context) {
    final counterpart = data['counterpart'] is Map
        ? Map<String, dynamic>.from(data['counterpart'] as Map)
        : const <String, dynamic>{};
    final latest = data['latestMessage'] is Map
        ? Map<String, dynamic>.from(data['latestMessage'] as Map)
        : const <String, dynamic>{};
    final unreadCount = data['unreadCount'] is num
        ? (data['unreadCount'] as num).toInt()
        : int.tryParse(data['unreadCount']?.toString() ?? '') ?? 0;
    final displayName = counterpart['displayName']?.toString().trim();
    final preview = latest['body']?.toString().trim();
    final listingId = data['listingId']?.toString();

    return Card(
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        leading: CircleAvatar(
          backgroundColor: SuqnaaBrand.blue,
          child: Text(
            _initial(displayName),
            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800),
          ),
        ),
        title: Row(
          children: [
            Expanded(
              child: Text(
                displayName?.isNotEmpty == true ? displayName! : 'Suqnaa user',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontWeight: unreadCount > 0 ? FontWeight.w900 : FontWeight.w700,
                ),
              ),
            ),
            if (unreadCount > 0) _UnreadBadge(count: unreadCount),
          ],
        ),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 5),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                preview?.isNotEmpty == true ? preview! : 'No messages yet',
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 5),
              Row(
                children: [
                  if (listingId != null) ...[
                    const Icon(Icons.sell_outlined, size: 14),
                    const SizedBox(width: 4),
                    const Text('Listing conversation'),
                    const SizedBox(width: 10),
                  ],
                  Text(
                    _formatTimestamp(data['updatedAt']?.toString()),
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
            ],
          ),
        ),
        trailing: const Icon(Icons.chevron_right),
      ),
    );
  }

  String _initial(String? value) {
    if (value == null || value.trim().isEmpty) {
      return 'S';
    }
    return value.trim().characters.first.toUpperCase();
  }

  String _formatTimestamp(String? value) {
    final parsed = value == null ? null : DateTime.tryParse(value)?.toLocal();
    if (parsed == null) {
      return '';
    }

    final now = DateTime.now();
    final sameDay = parsed.year == now.year &&
        parsed.month == now.month &&
        parsed.day == now.day;
    if (sameDay) {
      final hour = parsed.hour.toString().padLeft(2, '0');
      final minute = parsed.minute.toString().padLeft(2, '0');
      return '$hour:$minute';
    }

    return '${parsed.day}/${parsed.month}/${parsed.year}';
  }
}

class _UnreadBadge extends StatelessWidget {
  const _UnreadBadge({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minWidth: 24),
      margin: const EdgeInsetsDirectional.only(start: 8),
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: SuqnaaBrand.blue,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Text(
        count > 99 ? '99+' : count.toString(),
        textAlign: TextAlign.center,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 12,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}

class _PaginationFooter extends StatelessWidget {
  const _PaginationFooter({
    required this.hasMore,
    required this.isLoading,
    required this.error,
    required this.onLoadMore,
  });

  final bool hasMore;
  final bool isLoading;
  final String? error;
  final VoidCallback onLoadMore;

  @override
  Widget build(BuildContext context) {
    if (isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (!hasMore) {
      return const Center(child: Text('You are all caught up.'));
    }

    return Column(
      children: [
        if (error != null) ...[
          Text(error!, textAlign: TextAlign.center),
          const SizedBox(height: 8),
        ],
        OutlinedButton.icon(
          onPressed: onLoadMore,
          icon: const Icon(Icons.expand_more),
          label: const Text('Load more'),
        ),
      ],
    );
  }
}

class _SignedOutCard extends StatelessWidget {
  const _SignedOutCard();

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: const [
        _InboxHeading(),
        SizedBox(height: 24),
        Card(
          child: Padding(
            padding: EdgeInsets.all(22),
            child: Column(
              children: [
                Icon(Icons.lock_outline, size: 46, color: SuqnaaBrand.blue),
                SizedBox(height: 14),
                Text(
                  'Sign in to view messages',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                ),
                SizedBox(height: 6),
                Text(
                  'Your conversation history will appear after account access is connected.',
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _EmptyConversationCard extends StatelessWidget {
  const _EmptyConversationCard();

  @override
  Widget build(BuildContext context) {
    return const Card(
      child: Padding(
        padding: EdgeInsets.all(22),
        child: Column(
          children: [
            Icon(Icons.forum_outlined, size: 46, color: SuqnaaBrand.blue),
            SizedBox(height: 14),
            Text(
              'No conversations yet',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
            ),
            SizedBox(height: 6),
            Text(
              'Messages from buyers and sellers will appear here.',
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.cloud_off_outlined, size: 46),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Try again'),
            ),
          ],
        ),
      ),
    );
  }
}

class _Pagination {
  const _Pagination({required this.hasMore, this.nextCursor});

  final bool hasMore;
  final String? nextCursor;
}
