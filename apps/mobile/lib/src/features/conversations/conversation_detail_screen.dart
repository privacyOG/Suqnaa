import 'dart:math';
import 'package:flutter/material.dart';
import '../../api/authed_api.dart';
import '../../api/conversation_api.dart';
import '../../brand/brand.dart';
import '../../config/mobile_environment.dart';
import '../../session/session_scope.dart';

class ConversationDetailScreen extends StatefulWidget {
  const ConversationDetailScreen({
    required this.conversationId,
    required this.recipientId,
    required this.counterpartName,
    this.listingId,
    super.key,
  });

  final String conversationId;
  final String recipientId;
  final String counterpartName;
  final String? listingId;

  @override
  State<ConversationDetailScreen> createState() =>
      _ConversationDetailScreenState();
}

class _ConversationDetailScreenState extends State<ConversationDetailScreen> {
  static final Random _random = Random.secure();

  late final ConversationApi _api;
  final _composerController = TextEditingController();
  final _scrollController = ScrollController();
  final List<Map<String, dynamic>> _messages = [];

  String _accessToken = '';
  String? _nextCursor;
  bool _hasMore = false;
  bool _isLoading = false;
  bool _isLoadingMore = false;
  bool _isSending = false;
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
    _messages.clear();
    _nextCursor = null;
    _hasMore = false;
    _error = null;

    if (_accessToken.isNotEmpty) {
      _loadFirstPage();
    }
  }

  @override
  void dispose() {
    _composerController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _loadFirstPage() async {
    if (_accessToken.isEmpty || _isLoading) {
      return;
    }

    final token = _accessToken;
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final response = await _api.getConversationHistory(
        token,
        widget.conversationId,
        limit: 50,
      );
      if (!mounted || token != _accessToken) {
        return;
      }

      final items = _readMessages(response).reversed.toList();
      final pagination = _readPagination(response);

      setState(() {
        _messages
          ..clear()
          ..addAll(items);
        _hasMore = pagination.hasMore;
        _nextCursor = pagination.nextCursor;
      });

      await _acknowledge(token);
      _scrollToBottom();
    } catch (_) {
      if (mounted && token == _accessToken) {
        setState(() {
          _error = 'Unable to load this conversation.';
        });
      }
    } finally {
      if (mounted && token == _accessToken) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  Future<void> _loadOlder() async {
    if (_accessToken.isEmpty || !_hasMore || _nextCursor == null || _isLoadingMore) {
      return;
    }

    final token = _accessToken;
    setState(() {
      _isLoadingMore = true;
      _error = null;
    });

    try {
      final response = await _api.getConversationHistory(
        token,
        widget.conversationId,
        limit: 50,
        before: _nextCursor,
      );
      if (!mounted || token != _accessToken) {
        return;
      }

      final older = _readMessages(response).reversed.toList();
      final pagination = _readPagination(response);
      final existingIds = _messages
          .map((item) => item['id']?.toString())
          .whereType<String>()
          .toSet();

      setState(() {
        _messages.insertAll(
          0,
          older.where((item) => !existingIds.contains(item['id']?.toString())),
        );
        _hasMore = pagination.hasMore;
        _nextCursor = pagination.nextCursor;
      });
    } catch (_) {
      if (mounted && token == _accessToken) {
        setState(() {
          _error = 'Unable to load older messages.';
        });
      }
    } finally {
      if (mounted && token == _accessToken) {
        setState(() {
          _isLoadingMore = false;
        });
      }
    }
  }

  Future<void> _acknowledge(String token) async {
    try {
      await _api.acknowledge(token, widget.conversationId);
    } catch (_) {
      // Reading history remains useful even if acknowledgement is delayed.
    }
  }

  Future<void> _send() async {
    final text = _composerController.text.trim();
    if (_accessToken.isEmpty || text.isEmpty || _isSending) {
      return;
    }

    final token = _accessToken;
    setState(() {
      _isSending = true;
      _error = null;
    });

    try {
      final response = await _api.createEntry(
        token,
        recipientId: widget.recipientId,
        body: text,
        listingId: widget.listingId,
        clientMessageId: _newUuid(),
      );
      if (!mounted || token != _accessToken) {
        return;
      }

      final raw = response['message'];
      if (raw is Map) {
        final message = Map<String, dynamic>.from(raw);
        final id = message['id']?.toString();
        final exists = id != null &&
            _messages.any((item) => item['id']?.toString() == id);

        if (!exists) {
          setState(() {
            _messages.add(message);
          });
        }
      }

      _composerController.clear();
      _scrollToBottom();
    } catch (_) {
      if (mounted && token == _accessToken) {
        setState(() {
          _error = 'Message could not be sent. Try again.';
        });
      }
    } finally {
      if (mounted && token == _accessToken) {
        setState(() {
          _isSending = false;
        });
      }
    }
  }

  List<Map<String, dynamic>> _readMessages(Map<String, dynamic> response) {
    final raw = response['messages'];
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

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_scrollController.hasClients) {
        return;
      }

      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: const Duration(milliseconds: 250),
        curve: Curves.easeOut,
      );
    });
  }

  String _newUuid() {
    final bytes = List<int>.generate(16, (_) => _random.nextInt(256));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    final hex = bytes.map((value) => value.toRadixString(16).padLeft(2, '0')).join();
    return '${hex.substring(0, 8)}-'
        '${hex.substring(8, 12)}-'
        '${hex.substring(12, 16)}-'
        '${hex.substring(16, 20)}-'
        '${hex.substring(20)}';
  }

  @override
  Widget build(BuildContext context) {
    final currentUserId = SessionScope.of(context).userId;

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.counterpartName),
        backgroundColor: SuqnaaBrand.ivory,
      ),
      body: _accessToken.isEmpty
          ? const Center(child: Text('Sign in to view this conversation.'))
          : Column(
              children: [
                if (_error != null)
                  MaterialBanner(
                    content: Text(_error!),
                    actions: [
                      TextButton(
                        onPressed: _loadFirstPage,
                        child: const Text('Retry'),
                      ),
                    ],
                  ),
                Expanded(
                  child: _isLoading && _messages.isEmpty
                      ? const Center(child: CircularProgressIndicator())
                      : _messages.isEmpty
                          ? const Center(child: Text('No messages yet.'))
                          : ListView.builder(
                              controller: _scrollController,
                              padding: const EdgeInsets.all(16),
                              itemCount: _messages.length + (_hasMore ? 1 : 0),
                              itemBuilder: (context, index) {
                                if (_hasMore && index == 0) {
                                  return Padding(
                                    padding: const EdgeInsets.only(bottom: 12),
                                    child: Center(
                                      child: OutlinedButton.icon(
                                        onPressed: _isLoadingMore ? null : _loadOlder,
                                        icon: _isLoadingMore
                                            ? const SizedBox(
                                                width: 16,
                                                height: 16,
                                                child: CircularProgressIndicator(strokeWidth: 2),
                                              )
                                            : const Icon(Icons.history),
                                        label: const Text('Load older messages'),
                                      ),
                                    ),
                                  );
                                }

                                final messageIndex = index - (_hasMore ? 1 : 0);
                                final message = _messages[messageIndex];
                                return _MessageBubble(
                                  message: message,
                                  isMine: message['senderId']?.toString() == currentUserId,
                                );
                              },
                            ),
                ),
                SafeArea(
                  top: false,
                  child: _Composer(
                    controller: _composerController,
                    isSending: _isSending,
                    onSend: _send,
                  ),
                ),
              ],
            ),
    );
  }
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({required this.message, required this.isMine});

  final Map<String, dynamic> message;
  final bool isMine;

  @override
  Widget build(BuildContext context) {
    final body = message['body']?.toString() ?? '';
    final createdAt = DateTime.tryParse(message['createdAt']?.toString() ?? '')?.toLocal();
    final status = message['status']?.toString() ?? '';

    return Align(
      alignment: isMine ? AlignmentDirectional.centerEnd : AlignmentDirectional.centerStart,
      child: Container(
        constraints: const BoxConstraints(maxWidth: 320),
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: isMine ? SuqnaaBrand.blue : Colors.white,
          borderRadius: BorderRadius.circular(18),
          border: isMine ? null : Border.all(color: Colors.black12),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              body,
              style: TextStyle(color: isMine ? Colors.white : Colors.black87),
            ),
            const SizedBox(height: 5),
            Text(
              _metadata(createdAt, status),
              style: TextStyle(
                color: isMine ? Colors.white70 : Colors.black54,
                fontSize: 11,
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _metadata(DateTime? createdAt, String status) {
    final time = createdAt == null
        ? ''
        : '${createdAt.hour.toString().padLeft(2, '0')}:'
            '${createdAt.minute.toString().padLeft(2, '0')}';
    if (!isMine || status.isEmpty) {
      return time;
    }
    return time.isEmpty ? status : '$time · $status';
  }
}

class _Composer extends StatelessWidget {
  const _Composer({
    required this.controller,
    required this.isSending,
    required this.onSend,
  });

  final TextEditingController controller;
  final bool isSending;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: Colors.black12)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(
            child: TextField(
              controller: controller,
              minLines: 1,
              maxLines: 5,
              maxLength: 2000,
              textInputAction: TextInputAction.newline,
              decoration: const InputDecoration(
                hintText: 'Write a message',
                counterText: '',
                border: OutlineInputBorder(),
              ),
            ),
          ),
          const SizedBox(width: 8),
          IconButton.filled(
            tooltip: 'Send',
            onPressed: isSending ? null : onSend,
            icon: isSending
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.send),
          ),
        ],
      ),
    );
  }
}

class _Pagination {
  const _Pagination({required this.hasMore, this.nextCursor});

  final bool hasMore;
  final String? nextCursor;
}
