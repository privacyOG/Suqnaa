import 'dart:math';
import 'package:flutter/material.dart';
import '../../api/conversation_api.dart';
import '../../api/session_authed_api.dart';
import '../../brand/brand.dart';
import '../../config/mobile_environment.dart';
import '../../session/app_session.dart';
import '../../session/session_scope.dart';

class SessionConversationScreen extends StatefulWidget {
  const SessionConversationScreen({
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
  State<SessionConversationScreen> createState() => _SessionConversationScreenState();
}

class _SessionConversationScreenState extends State<SessionConversationScreen> {
  static final Random _random = Random.secure();

  final _composer = TextEditingController();
  final _messages = <Map<String, dynamic>>[];
  ConversationApi? _api;
  AppSession? _session;
  bool _loading = false;
  bool _sending = false;
  String? _error;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final session = SessionScope.of(context);
    if (!identical(session, _session)) {
      _session = session;
      _api = ConversationApi(
        authedApi: SessionAuthedApi(
          baseUrl: Uri.parse(MobileEnvironment.apiBaseUrl),
          sessionProvider: () => session,
        ),
      );
      _load();
    }
  }

  @override
  void dispose() {
    _composer.dispose();
    super.dispose();
  }

  Future<void> _load() async {
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
      final response = await api.getConversationHistory(
        token,
        widget.conversationId,
        limit: 100,
      );
      if (!mounted) {
        return;
      }

      final raw = response['messages'];
      final items = raw is List
          ? raw
              .whereType<Map>()
              .map((item) => Map<String, dynamic>.from(item))
              .toList()
          : <Map<String, dynamic>>[];

      setState(() {
        _messages
          ..clear()
          ..addAll(items.reversed);
      });
      await api.acknowledge(token, widget.conversationId);
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Unable to load this conversation.');
      }
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _send() async {
    final api = _api;
    final token = _session?.access.value ?? '';
    final body = _composer.text.trim();
    if (api == null || token.isEmpty || body.isEmpty || _sending) {
      return;
    }

    setState(() {
      _sending = true;
      _error = null;
    });

    try {
      final response = await api.createEntry(
        token,
        recipientId: widget.recipientId,
        body: body,
        listingId: widget.listingId,
        clientMessageId: _newUuid(),
      );
      if (!mounted) {
        return;
      }

      final raw = response['message'];
      if (raw is Map) {
        final message = Map<String, dynamic>.from(raw);
        final id = message['id']?.toString();
        if (!_messages.any((item) => item['id']?.toString() == id)) {
          setState(() => _messages.add(message));
        }
      }
      _composer.clear();
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Message could not be sent.');
      }
    } finally {
      if (mounted) {
        setState(() => _sending = false);
      }
    }
  }

  String _newUuid() {
    final bytes = List<int>.generate(16, (_) => _random.nextInt(256));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    final hex = bytes.map((value) => value.toRadixString(16).padLeft(2, '0')).join();
    return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
  }

  @override
  Widget build(BuildContext context) {
    final userId = _session?.userId;

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.counterpartName),
        backgroundColor: SuqnaaBrand.ivory,
      ),
      body: Column(
        children: [
          if (_error != null)
            MaterialBanner(
              content: Text(_error!),
              actions: [
                TextButton(onPressed: _load, child: const Text('Retry')),
              ],
            ),
          Expanded(
            child: _loading && _messages.isEmpty
                ? const Center(child: CircularProgressIndicator())
                : ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: _messages.length,
                    itemBuilder: (context, index) {
                      final message = _messages[index];
                      return _Bubble(
                        body: message['body']?.toString() ?? '',
                        mine: message['senderId']?.toString() == userId,
                        status: message['status']?.toString() ?? '',
                      );
                    },
                  ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.all(10),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _composer,
                      minLines: 1,
                      maxLines: 5,
                      maxLength: 2000,
                      decoration: const InputDecoration(
                        hintText: 'Write a message',
                        counterText: '',
                        border: OutlineInputBorder(),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton.filled(
                    onPressed: _sending ? null : _send,
                    icon: _sending
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.send),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.body, required this.mine, required this.status});

  final String body;
  final bool mine;
  final String status;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: mine ? AlignmentDirectional.centerEnd : AlignmentDirectional.centerStart,
      child: Container(
        constraints: const BoxConstraints(maxWidth: 320),
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: mine ? SuqnaaBrand.blue : Colors.white,
          borderRadius: BorderRadius.circular(18),
          border: mine ? null : Border.all(color: Colors.black12),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(body, style: TextStyle(color: mine ? Colors.white : Colors.black87)),
            if (mine && status.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(status, style: const TextStyle(color: Colors.white70, fontSize: 11)),
            ],
          ],
        ),
      ),
    );
  }
}
