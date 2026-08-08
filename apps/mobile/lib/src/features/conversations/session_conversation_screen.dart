import 'dart:async';
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
  Timer? _pollTimer;
  String? _syncCursor;
  bool _syncing = false;
  bool _loading = false;
  bool _sending = false;
  bool _safetyBusy = false;
  bool _muted = false;
  bool _blockedByMe = false;
  bool _messagingAvailable = true;
  bool _attachmentsEnabled = false;
  String _attachmentPolicy = 'Attachments are currently disabled for message safety.';
  int _maxBodyCharacters = 2000;
  String? _error;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final session = SessionScope.of(context);
    if (!identical(session, _session)) {
      _pollTimer?.cancel();
      _syncCursor = null;
      _session = session;
      _api = ConversationApi(
        authedApi: SessionAuthedApi(
          baseUrl: Uri.parse(MobileEnvironment.apiBaseUrl),
          sessionProvider: () => session,
        ),
      );
      unawaited(_load().then((_) {
        if (mounted) _startPolling();
      }));
    }
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _composer.dispose();
    super.dispose();
  }

  void _startPolling() {
    _pollTimer?.cancel();
    unawaited(_sync());
    _pollTimer = Timer.periodic(
      const Duration(seconds: 3),
      (_) => unawaited(_sync()),
    );
  }

  void _applySafety(Map<dynamic, dynamic>? safety) {
    if (safety == null) return;
    _muted = safety['muted'] == true;
    _blockedByMe = safety['blockedByMe'] == true;
    _messagingAvailable = safety['messagingAvailable'] == true;
  }

  void _applyPolicy(Map<dynamic, dynamic>? policy) {
    if (policy == null) return;
    final maxBody = policy['maxBodyCharacters'];
    if (maxBody is num && maxBody.toInt() > 0) {
      _maxBodyCharacters = maxBody.toInt();
    }
    final attachments = policy['attachments'];
    if (attachments is Map) {
      _attachmentsEnabled = attachments['enabled'] == true;
      final reason = attachments['reason']?.toString();
      if (reason != null && reason.trim().isNotEmpty) {
        _attachmentPolicy = reason.trim();
      }
    }
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
      if (!mounted) return;

      final raw = response['messages'];
      final items = raw is List
          ? raw.whereType<Map>().map((item) => Map<String, dynamic>.from(item)).toList()
          : <Map<String, dynamic>>[];
      final conversation = response['conversation'];
      final policy = response['policy'];

      setState(() {
        _messages
          ..clear()
          ..addAll(items.reversed);
        if (conversation is Map) _applySafety(conversation['safety'] as Map?);
        if (policy is Map) _applyPolicy(policy);
      });
      await api.acknowledge(token, widget.conversationId);
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Unable to load this conversation.');
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _sync() async {
    final api = _api;
    final session = _session;
    final token = session?.access.value ?? '';
    if (api == null || session == null || token.isEmpty || _syncing || !mounted) return;

    _syncing = true;
    try {
      final response = await api.getConversationSync(
        token,
        widget.conversationId,
        limit: 100,
        cursor: _syncCursor,
      );
      if (!mounted) return;

      final rawChanges = response['changes'];
      final changes = rawChanges is List
          ? rawChanges.whereType<Map>().map((item) => Map<String, dynamic>.from(item)).toList()
          : <Map<String, dynamic>>[];
      final pagination = response['pagination'];
      final nextCursor = pagination is Map ? pagination['cursor']?.toString() : null;
      final currentUserId = session.userId;
      final hasUnreadIncoming = changes.any((message) =>
          message['senderId']?.toString() != currentUserId &&
          message['status']?.toString() != 'read');

      if (changes.isNotEmpty || nextCursor != _syncCursor) {
        setState(() {
          for (final change in changes) {
            final id = change['id']?.toString();
            final index = _messages.indexWhere((item) => item['id']?.toString() == id);
            if (index >= 0) {
              _messages[index] = change;
            } else {
              _messages.add(change);
            }
          }
          _messages.sort((a, b) =>
              (a['createdAt']?.toString() ?? '').compareTo(b['createdAt']?.toString() ?? ''));
          _syncCursor = nextCursor ?? _syncCursor;
        });
      }

      if (hasUnreadIncoming) {
        final acknowledgement = await api.acknowledge(token, widget.conversationId);
        final readAt = acknowledgement['readAt']?.toString();
        if (mounted && readAt != null) {
          setState(() {
            for (final message in _messages) {
              if (message['senderId']?.toString() != currentUserId &&
                  message['status']?.toString() != 'read') {
                message['status'] = 'read';
                message['readAt'] = readAt;
                message['updatedAt'] = readAt;
              }
            }
          });
        }
      }
    } catch (_) {
      // Poll failures are intentionally silent; the next bounded poll retries.
    } finally {
      _syncing = false;
    }
  }

  Future<void> _send() async {
    final api = _api;
    final token = _session?.access.value ?? '';
    final body = _composer.text.trim();
    if (api == null ||
        token.isEmpty ||
        body.isEmpty ||
        body.length > _maxBodyCharacters ||
        !_messagingAvailable ||
        _sending) {
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
      if (!mounted) return;

      final raw = response['message'];
      if (raw is Map) {
        final message = Map<String, dynamic>.from(raw);
        final id = message['id']?.toString();
        if (!_messages.any((item) => item['id']?.toString() == id)) {
          setState(() => _messages.add(message));
        }
      }
      _composer.clear();
      unawaited(_sync());
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Message could not be sent. Refresh the conversation before retrying.');
        await _load();
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _toggleMute() async {
    final api = _api;
    final token = _session?.access.value ?? '';
    if (api == null || token.isEmpty || _safetyBusy) return;
    setState(() {
      _safetyBusy = true;
      _error = null;
    });
    try {
      final response = await api.setMuted(
        token,
        widget.conversationId,
        muted: !_muted,
      );
      if (!mounted) return;
      final safety = response['safety'];
      setState(() {
        if (safety is Map) _applySafety(safety);
      });
    } catch (_) {
      if (mounted) setState(() => _error = 'Unable to change the mute setting.');
    } finally {
      if (mounted) setState(() => _safetyBusy = false);
    }
  }

  Future<void> _toggleBlock() async {
    final api = _api;
    final token = _session?.access.value ?? '';
    if (api == null || token.isEmpty || _safetyBusy) return;

    if (!_blockedByMe) {
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Block this user?'),
          content: const Text(
            'Blocking stops new messages in both directions and mutes your conversations with this user. Existing history stays visible.',
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Block')),
          ],
        ),
      );
      if (confirmed != true || !mounted) return;
    }

    setState(() {
      _safetyBusy = true;
      _error = null;
    });
    try {
      final response = await api.setBlocked(
        token,
        widget.conversationId,
        blocked: !_blockedByMe,
      );
      if (!mounted) return;
      final safety = response['safety'];
      setState(() {
        if (safety is Map) _applySafety(safety);
      });
    } catch (_) {
      if (mounted) setState(() => _error = 'Unable to change the block setting.');
    } finally {
      if (mounted) setState(() => _safetyBusy = false);
    }
  }

  Future<void> _reportMessage(Map<String, dynamic> message) async {
    final api = _api;
    final token = _session?.access.value ?? '';
    final messageId = message['id']?.toString() ?? '';
    if (api == null || token.isEmpty || messageId.isEmpty) return;

    var reason = 'harassment';
    final detailsController = TextEditingController();
    final submitted = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Report message'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                DropdownButtonFormField<String>(
                  initialValue: reason,
                  decoration: const InputDecoration(labelText: 'Reason'),
                  items: const [
                    DropdownMenuItem(value: 'harassment', child: Text('Harassment or abuse')),
                    DropdownMenuItem(value: 'spam', child: Text('Spam or repeated content')),
                    DropdownMenuItem(value: 'scam', child: Text('Scam or suspicious request')),
                    DropdownMenuItem(value: 'unsafe', child: Text('Unsafe request or threat')),
                    DropdownMenuItem(value: 'other', child: Text('Other safety concern')),
                  ],
                  onChanged: (value) {
                    if (value != null) setDialogState(() => reason = value);
                  },
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: detailsController,
                  maxLength: 1200,
                  maxLines: 4,
                  decoration: const InputDecoration(
                    labelText: 'Optional details',
                    helperText: 'Do not include passwords or verification codes.',
                  ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Submit report')),
          ],
        ),
      ),
    );
    final details = detailsController.text;
    detailsController.dispose();
    if (submitted != true || !mounted) return;

    try {
      final response = await api.reportMessage(
        token,
        messageId: messageId,
        reason: reason,
        details: details,
      );
      if (!mounted) return;
      final report = response['report'];
      final status = report is Map ? report['status']?.toString() : null;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            status == 'already_reported'
                ? 'You already have an unresolved report for this message.'
                : 'Message report submitted for review.',
          ),
        ),
      );
    } catch (_) {
      if (mounted) setState(() => _error = 'Unable to submit the message report.');
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
        actions: [
          PopupMenuButton<String>(
            enabled: !_safetyBusy,
            onSelected: (value) {
              if (value == 'mute') _toggleMute();
              if (value == 'block') _toggleBlock();
            },
            itemBuilder: (context) => [
              PopupMenuItem(
                value: 'mute',
                child: Text(_muted ? 'Unmute conversation' : 'Mute conversation'),
              ),
              PopupMenuItem(
                value: 'block',
                child: Text(_blockedByMe ? 'Unblock user' : 'Block user'),
              ),
            ],
          ),
        ],
      ),
      body: Column(
        children: [
          if (_error != null)
            MaterialBanner(
              content: Text(_error!),
              actions: [TextButton(onPressed: _load, child: const Text('Retry'))],
            ),
          if (_muted)
            const MaterialBanner(
              content: Text('This conversation is muted. The preference is retained for notifications.'),
              actions: <Widget>[],
            ),
          if (!_messagingAvailable)
            const MaterialBanner(
              content: Text('New messaging is unavailable for this participant pair. Existing history remains visible.'),
              actions: <Widget>[],
            ),
          Expanded(
            child: _loading && _messages.isEmpty
                ? const Center(child: CircularProgressIndicator())
                : ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: _messages.length,
                    itemBuilder: (context, index) {
                      final message = _messages[index];
                      final mine = message['senderId']?.toString() == userId;
                      return _Bubble(
                        body: message['body']?.toString() ?? '',
                        mine: mine,
                        status: message['status']?.toString() ?? '',
                        onReport: mine ? null : () => _reportMessage(message),
                      );
                    },
                  ),
          ),
          if (!_attachmentsEnabled)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Text(
                _attachmentPolicy,
                style: Theme.of(context).textTheme.bodySmall,
                textAlign: TextAlign.center,
              ),
            ),
          if (_messagingAvailable)
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
                        maxLength: _maxBodyCharacters,
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
  const _Bubble({
    required this.body,
    required this.mine,
    required this.status,
    this.onReport,
  });

  final String body;
  final bool mine;
  final String status;
  final VoidCallback? onReport;

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
            if (onReport != null) ...[
              const SizedBox(height: 4),
              TextButton(
                onPressed: onReport,
                child: const Text('Report message'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
